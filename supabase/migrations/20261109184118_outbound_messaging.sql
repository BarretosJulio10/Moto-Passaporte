-- =============================================================================
-- Avisos por e-mail (Resend) e WhatsApp (FZAP) — ADR-064
-- - Os avisos continuam nascendo em public.notify(); cada aviso marca email_pending
--   e whatsapp_pending conforme a preferência do usuário (padrões por tipo).
-- - A Edge Function messages-send (pg_cron a cada 2 min) pega os pendentes e envia.
-- - Chaves do Resend e da FZAP ficam no Vault; o navegador nunca as vê.
-- - O convite para comprar vai por aqui (fora do app da Google Play, ADR-063).
-- =============================================================================

-- Configuração (uma linha) -----------------------------------------------------
create table public.messaging_settings (
  id                    boolean primary key default true check (id),
  email_enabled         boolean not null default false,
  email_from            text not null default 'Moto Passaporte <avisos@motopassaporte.com.br>'
                        check (char_length(email_from) between 5 and 160 and email_from ~ '<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$|^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$'),
  link_base             text not null default 'https://www.motopassaporte.com.br'
                        check (link_base ~ '^https://[a-z0-9.-]+\.[a-z]{2,}$'),
  resend_key_secret_id  uuid,
  resend_key_hint       text check (char_length(resend_key_hint) <= 8),
  whatsapp_enabled      boolean not null default false,
  fzap_url              text check (fzap_url is null or fzap_url ~ '^https://[a-z0-9.-]+\.[a-z]{2,}(:[0-9]{2,5})?$'),
  fzap_token_secret_id  uuid,
  fzap_token_hint       text check (char_length(fzap_token_hint) <= 8),
  whatsapp_cooldown_hours integer not null default 48 check (whatsapp_cooldown_hours between 1 and 720),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users (id) on delete set null
);
comment on table public.messaging_settings is 'Envio de avisos por e-mail (Resend) e WhatsApp (FZAP), ADR-064. Segredos no Vault; aqui só referências e os 4 últimos caracteres.';
create index messaging_settings_updated_by_idx on public.messaging_settings (updated_by);
insert into public.messaging_settings (id) values (true);
alter table public.messaging_settings enable row level security;
revoke all on public.messaging_settings from anon, authenticated;
create trigger messaging_settings_audit
  after insert or update or delete on public.messaging_settings
  for each row execute function public.audit_row_change('', '');

-- Histórico de envios (sem o texto; destino mascarado) ------------------------
create table public.outbound_messages (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications (id) on delete set null,
  user_id         uuid references auth.users (id) on delete cascade,
  channel         text not null check (channel in ('email', 'whatsapp')),
  kind            text not null check (char_length(kind) <= 60),
  destination     text not null check (char_length(destination) <= 80),
  status          text not null check (status in ('sent', 'failed', 'skipped')),
  provider_id     text check (char_length(provider_id) <= 120),
  error           text check (char_length(error) <= 300),
  created_at      timestamptz not null default now()
);
comment on table public.outbound_messages is 'Envios de e-mail e WhatsApp (ADR-064). Só leitura pelo admin via função.';
create index outbound_messages_notification_idx on public.outbound_messages (notification_id);
create index outbound_messages_user_idx on public.outbound_messages (user_id, channel, created_at desc);
create index outbound_messages_created_idx on public.outbound_messages (created_at desc);
alter table public.outbound_messages enable row level security;
revoke all on public.outbound_messages from anon, authenticated;

-- Avisos, preferências e perfil ----------------------------------------------
alter table public.notification_preferences add column whatsapp boolean;
alter table public.notifications
  add column whatsapp_pending boolean not null default false,
  add column email_sent_at timestamptz,
  add column whatsapp_sent_at timestamptz;
-- Nada acumulado do tempo em que o e-mail ainda não saía.
update public.notifications set email_pending = false where email_pending;
create index notifications_email_pending_idx on public.notifications (created_at) where email_pending;
create index notifications_whatsapp_pending_idx on public.notifications (created_at) where whatsapp_pending;

alter table public.profiles
  add column whatsapp_optin    boolean not null default false,
  add column email_optout      boolean not null default false,
  add column email_unsub_token uuid not null default gen_random_uuid();
create unique index profiles_email_unsub_token_idx on public.profiles (email_unsub_token);

-- Novo tipo de aviso: limite de motos do plano.
do $$
declare v text;
begin
  select pg_get_constraintdef(oid) into v from pg_constraint where conrelid = 'public.notifications'::regclass and conname = 'notifications_kind_check';
  if position('''appointment_canceled''::text' in v) = 0 then raise exception 'notifications_kind_check mudou'; end if;
  alter table public.notifications drop constraint notifications_kind_check;
  execute 'alter table public.notifications add constraint notifications_kind_check '
          || replace(v, '''appointment_canceled''::text', '''appointment_canceled''::text, ''limit_reached''::text');
end $$;

-- Padrões por tipo de aviso ----------------------------------------------------
create or replace function public.notification_email_default(p_kind text)
returns boolean language sql immutable set search_path = ''
as $$ select p_kind in ('subscription_ending', 'payment_failed', 'payment_approved', 'limit_reached',
                        'transfer_received', 'workshop_access_request') $$;

create or replace function public.notification_whatsapp_default(p_kind text)
returns boolean language sql immutable set search_path = ''
as $$ select p_kind in ('subscription_ending', 'payment_failed', 'limit_reached') $$;

-- Novo tipo: limite de motos (opcional, sem notificação no celular).
do $$
declare v text;
begin
  v := pg_get_functiondef('public.notification_kind_optional(text)'::regprocedure);
  if position($q$select p_kind in ('reminder_due', 'storage_limit',$q$ in v) = 0 then raise exception 'notification_kind_optional mudou'; end if;
  execute replace(v, $q$select p_kind in ('reminder_due', 'storage_limit',$q$, $q$select p_kind in ('reminder_due', 'storage_limit', 'limit_reached',$q$);
  v := pg_get_functiondef('public.notification_push_default(text)'::regprocedure);
  if position($q$not in ('reminder_due', 'storage_limit')$q$ in v) = 0 then raise exception 'notification_push_default mudou'; end if;
  execute replace(v, $q$not in ('reminder_due', 'storage_limit')$q$, $q$not in ('reminder_due', 'storage_limit', 'limit_reached')$q$);
end $$;

-- notify(): marca e-mail e WhatsApp pendentes conforme a preferência.
do $$
declare
  v text := pg_get_functiondef('public.notify(uuid,text,text,text,text,text)'::regprocedure);
  a text := 'insert into public.notifications (user_id, kind, title, body, link, dedupe_key, email_pending, push_pending)';
  b text := 'coalesce(pref.email, false), v_push)';
begin
  if position(a in v) = 0 or position(b in v) = 0 then raise exception 'notify mudou'; end if;
  v := replace(v, a, 'insert into public.notifications (user_id, kind, title, body, link, dedupe_key, email_pending, push_pending, whatsapp_pending)');
  v := replace(v, b, $q$coalesce(pref.email, public.notification_email_default(p_kind)), v_push,
          coalesce(pref.whatsapp, public.notification_whatsapp_default(p_kind))
          and exists (select 1 from public.profiles pr where pr.id = p_user and pr.whatsapp_optin and pr.phone ~ '^[0-9]{10,13}$'))$q$);
  execute v;
end $$;

-- Preferências: agora com WhatsApp e padrões de e-mail.
drop function public.get_my_notification_preferences();
create function public.get_my_notification_preferences()
returns table (kind text, optional boolean, in_app boolean, email boolean, push boolean, whatsapp boolean)
language sql stable security definer set search_path = ''
as $$
  select k.kind, public.notification_kind_optional(k.kind), coalesce(p.in_app, true),
         coalesce(p.email, public.notification_email_default(k.kind)),
         coalesce(p.push, public.notification_push_default(k.kind)),
         coalesce(p.whatsapp, public.notification_whatsapp_default(k.kind))
    from unnest(array['care_checkup', 'oil_change', 'workshop_access_request', 'workshop_access_decided', 'workshop_access_revoked',
                      'workshop_service', 'transfer_received', 'transfer_decided', 'reminder_due', 'subscription_ending',
                      'payment_approved', 'payment_failed', 'limit_reached', 'storage_limit', 'claim_decided', 'ownership_notice', 'admin_notice',
                      'quote_viewed', 'quote_decided', 'quote_expired', 'service_order_assigned',
                      'appointment_requested', 'workshop_review', 'workshop_update', 'workshop_reminder_due', 'appointment_canceled']) k(kind)
    left join public.notification_preferences p on p.user_id = auth.uid() and p.kind = k.kind;
$$;

drop function public.set_my_notification_preference(text, boolean, boolean, boolean);
create function public.set_my_notification_preference(p_kind text, p_in_app boolean, p_email boolean, p_push boolean default null, p_whatsapp boolean default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_kind not in (select kind from public.get_my_notification_preferences()) then
    raise exception 'Tipo de aviso desconhecido.' using errcode = '22023';
  end if;
  if not coalesce(p_in_app, true) and not public.notification_kind_optional(p_kind) then
    raise exception 'Este aviso é essencial e não pode ser desligado.' using errcode = '22023';
  end if;
  insert into public.notification_preferences (user_id, kind, in_app, email, push, whatsapp)
  values (auth.uid(), p_kind, coalesce(p_in_app, true), coalesce(p_email, public.notification_email_default(p_kind)), p_push, p_whatsapp)
  on conflict (user_id, kind) do update set in_app = excluded.in_app, email = excluded.email,
    push = coalesce(excluded.push, public.notification_preferences.push),
    whatsapp = coalesce(excluded.whatsapp, public.notification_preferences.whatsapp), updated_at = now();
end;
$$;

-- Canais do usuário ------------------------------------------------------------
create or replace function public.get_my_messaging_prefs()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare p public.profiles; s public.messaging_settings;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select * into p from public.profiles where id = auth.uid();
  select * into s from public.messaging_settings where id;
  return jsonb_build_object(
    'email', p.email, 'email_optout', p.email_optout, 'email_active', s.email_enabled,
    'phone', p.phone, 'phone_ok', coalesce(p.phone ~ '^[0-9]{10,13}$', false),
    'whatsapp_optin', p.whatsapp_optin, 'whatsapp_active', s.whatsapp_enabled);
end;
$$;

create or replace function public.set_my_messaging_prefs(p_email_optout boolean, p_whatsapp_optin boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if coalesce(p_whatsapp_optin, false)
     and not exists (select 1 from public.profiles where id = auth.uid() and phone ~ '^[0-9]{10,13}$') then
    raise exception 'Cadastre um celular com DDD em Minha conta para receber avisos por WhatsApp.' using errcode = '22023';
  end if;
  update public.profiles
     set email_optout = coalesce(p_email_optout, email_optout),
         whatsapp_optin = coalesce(p_whatsapp_optin, whatsapp_optin),
         updated_at = now()
   where id = auth.uid();
end;
$$;

-- Link "parar de receber" do e-mail: funciona sem entrar na conta.
create or replace function public.email_unsubscribe(p_token uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if p_token is null then return false; end if;
  update public.profiles set email_optout = true, updated_at = now() where email_unsub_token = p_token;
  return found;
end;
$$;

-- Limite de motos atingido: aviso (e e-mail/WhatsApp) com o caminho para incluir mais motos.
create or replace function public.notify_motorcycle_limit()
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_max  integer;
  v_used integer;
  v_free integer;
  v_cents integer;
  v_price text;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  v_max := public.user_max_motorcycles(v_uid);
  select count(*) into v_used from public.motorcycle_ownerships where owner_user_id = v_uid and ended_at is null;
  if v_used < v_max then return false; end if;
  select max_motorcycles into v_free from public.subscription_plans where kind = 'free' and is_active order by price_cents limit 1;
  select extra_motorcycle_cents into v_cents from public.subscription_plans
   where kind = 'premium' and billing_period = 'monthly' and is_active order by price_cents limit 1;
  v_price := replace(to_char(coalesce(v_cents, 390) / 100.0, 'FM990.00'), '.', ',');
  perform public.notify(v_uid, 'limit_reached', 'Seu plano chegou ao limite de motos',
    'Você tem ' || v_used || ' de ' || v_max || case when v_max = 1 then ' moto' else ' motos' end || ' no plano. ' ||
    case when v_max <= coalesce(v_free, 1)
         then 'O Premium inclui 2 motos, e cada moto a mais custa R$ ' || v_price || ' por mês. Assine em Meu plano.'
         else 'Inclua uma moto extra por R$ ' || v_price || ' por mês em Meu plano.' end,
    '/painel/plano', 'limit:' || to_char(now() at time zone 'America/Sao_Paulo', 'IYYY-IW'));
  return true;
end;
$$;

-- Servidor (messages-send) -----------------------------------------------------
create or replace function public.messaging_config()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'email_enabled', s.email_enabled, 'email_from', s.email_from, 'link_base', s.link_base,
    'resend_key', (select decrypted_secret from vault.decrypted_secrets where id = s.resend_key_secret_id),
    'whatsapp_enabled', s.whatsapp_enabled, 'fzap_url', s.fzap_url,
    'fzap_token', (select decrypted_secret from vault.decrypted_secrets where id = s.fzap_token_secret_id))
  from public.messaging_settings s where s.id;
$$;

create or replace function public.messages_claim_email(p_limit integer default 50)
returns table (notification_id uuid, user_id uuid, kind text, title text, body text, link text,
               email text, full_name text, unsub_token uuid)
language plpgsql security definer set search_path = ''
as $$
begin
  update public.notifications set email_pending = false where email_pending and created_at < now() - interval '2 days';
  if not coalesce((select email_enabled from public.messaging_settings where id), false) then return; end if;
  -- Quem desligou os e-mails ou não tem endereço válido: só os essenciais seguem.
  update public.notifications n set email_pending = false
    from public.profiles p
   where n.email_pending and p.id = n.user_id
     and (p.email is null or p.email like '%@pista.motopassaporte.com.br' or p.account_status <> 'active'
          or (p.email_optout and public.notification_kind_optional(n.kind)));
  return query
  with picked as (
    select n.id from public.notifications n
     where n.email_pending
     order by n.created_at
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
     for update skip locked
  ), done as (
    update public.notifications n set email_pending = false, email_sent_at = now()
      from picked where n.id = picked.id
    returning n.id, n.user_id, n.kind, n.title, n.body, n.link
  )
  select d.id, d.user_id, d.kind, d.title, d.body, d.link, p.email, p.full_name, p.email_unsub_token
    from done d join public.profiles p on p.id = d.user_id;
end;
$$;

create or replace function public.messages_claim_whatsapp(p_limit integer default 20)
returns table (notification_id uuid, user_id uuid, kind text, title text, body text, link text,
               phone text, full_name text, skip boolean)
language plpgsql security definer set search_path = ''
as $$
declare v_hours integer;
begin
  update public.notifications set whatsapp_pending = false where whatsapp_pending and created_at < now() - interval '2 days';
  if not coalesce((select whatsapp_enabled from public.messaging_settings where id), false) then return; end if;
  select whatsapp_cooldown_hours into v_hours from public.messaging_settings where id;
  update public.notifications n set whatsapp_pending = false
    from public.profiles p
   where n.whatsapp_pending and p.id = n.user_id
     and (not p.whatsapp_optin or p.phone is null or p.phone !~ '^[0-9]{10,13}$' or p.account_status <> 'active');
  return query
  with picked as (
    select n.id from public.notifications n
     where n.whatsapp_pending
     order by n.created_at
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
     for update skip locked
  ), done as (
    update public.notifications n set whatsapp_pending = false, whatsapp_sent_at = now()
      from picked where n.id = picked.id
    returning n.id, n.user_id, n.kind, n.title, n.body, n.link
  )
  select d.id, d.user_id, d.kind, d.title, d.body, d.link,
         case when char_length(p.phone) in (10, 11) then '55' || p.phone else p.phone end,
         p.full_name,
         -- Anti-spam: avisos opcionais respeitam o intervalo mínimo entre mensagens.
         public.notification_kind_optional(d.kind) and exists (
           select 1 from public.outbound_messages m
            where m.user_id = d.user_id and m.channel = 'whatsapp' and m.status = 'sent'
              and m.created_at > now() - make_interval(hours => v_hours))
    from done d join public.profiles p on p.id = d.user_id;
end;
$$;

create or replace function public.messages_report(p_items jsonb)
returns void language sql security definer set search_path = ''
as $$
  insert into public.outbound_messages (notification_id, user_id, channel, kind, destination, status, provider_id, error)
  select x.notification_id, x.user_id, x.channel, left(x.kind, 60), left(x.destination, 80), x.status,
         left(x.provider_id, 120), left(x.error, 300)
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
         as x(notification_id uuid, user_id uuid, channel text, kind text, destination text, status text, provider_id text, error text);
$$;

-- Admin -------------------------------------------------------------------------
create or replace function public.admin_get_messaging_settings()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare s public.messaging_settings;
begin
  if not public.is_admin() then raise exception 'Operação não permitida.' using errcode = '42501'; end if;
  select * into s from public.messaging_settings where id;
  return jsonb_build_object(
    'email_enabled', s.email_enabled, 'email_from', s.email_from, 'link_base', s.link_base,
    'resend_key_configured', s.resend_key_secret_id is not null, 'resend_key_hint', s.resend_key_hint,
    'whatsapp_enabled', s.whatsapp_enabled, 'fzap_url', s.fzap_url,
    'fzap_token_configured', s.fzap_token_secret_id is not null, 'fzap_token_hint', s.fzap_token_hint,
    'whatsapp_cooldown_hours', s.whatsapp_cooldown_hours,
    'updated_at', s.updated_at, 'updated_by_name', (select full_name from public.profiles where id = s.updated_by),
    'last_24h', (select coalesce(jsonb_object_agg(k, c), '{}'::jsonb)
                   from (select channel || ':' || status as k, count(*) as c from public.outbound_messages
                          where created_at > now() - interval '24 hours' group by 1) t),
    'pending', jsonb_build_object(
      'email', (select count(*) from public.notifications where email_pending),
      'whatsapp', (select count(*) from public.notifications where whatsapp_pending)));
end;
$$;

-- Chaves: null mantém a atual.
create or replace function public.admin_save_messaging_settings(
  p_email_enabled boolean, p_email_from text, p_link_base text, p_resend_key text,
  p_whatsapp_enabled boolean, p_fzap_url text, p_fzap_token text, p_cooldown_hours integer)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_key   text := nullif(btrim(p_resend_key), '');
  v_tok   text := nullif(btrim(p_fzap_token), '');
  v_url   text := nullif(rtrim(btrim(p_fzap_url), '/'), '');
  v_link  text := rtrim(btrim(coalesce(p_link_base, '')), '/');
  s public.messaging_settings;
begin
  if not public.is_admin() then raise exception 'Operação não permitida.' using errcode = '42501'; end if;
  if v_key is not null and v_key !~ '^re_[A-Za-z0-9_]{10,120}$' then
    raise exception 'Chave do Resend inválida. Ela começa com re_.' using errcode = '22023';
  end if;
  if v_tok is not null and v_tok !~ '^[A-Za-z0-9_.-]{6,200}$' then
    raise exception 'Token da FZAP inválido.' using errcode = '22023';
  end if;
  if v_url is not null and v_url !~ '^https://[a-z0-9.-]+\.[a-z]{2,}(:[0-9]{2,5})?$' then
    raise exception 'Endereço da FZAP inválido. Use https://seu-servidor (sem caminho no final).' using errcode = '22023';
  end if;
  if v_link !~ '^https://[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'Endereço dos links inválido. Ex.: https://www.motopassaporte.com.br' using errcode = '22023';
  end if;
  select * into s from public.messaging_settings where id for update;
  if coalesce(p_email_enabled, false) and v_key is null and s.resend_key_secret_id is null then
    raise exception 'Informe a chave do Resend antes de ligar os e-mails.' using errcode = '22023';
  end if;
  if coalesce(p_whatsapp_enabled, false) and (v_url is null or (v_tok is null and s.fzap_token_secret_id is null)) then
    raise exception 'Informe o endereço e o token da FZAP antes de ligar o WhatsApp.' using errcode = '22023';
  end if;
  update public.messaging_settings set
    email_enabled = coalesce(p_email_enabled, false),
    email_from = coalesce(nullif(btrim(p_email_from), ''), s.email_from),
    link_base = v_link,
    resend_key_secret_id = case when v_key is null then s.resend_key_secret_id else public.upsert_vault_secret('resend_api_key', v_key) end,
    resend_key_hint = case when v_key is null then s.resend_key_hint else right(v_key, 4) end,
    whatsapp_enabled = coalesce(p_whatsapp_enabled, false),
    fzap_url = v_url,
    fzap_token_secret_id = case when v_tok is null then s.fzap_token_secret_id else public.upsert_vault_secret('fzap_token', v_tok) end,
    fzap_token_hint = case when v_tok is null then s.fzap_token_hint else right(v_tok, 4) end,
    whatsapp_cooldown_hours = coalesce(p_cooldown_hours, s.whatsapp_cooldown_hours),
    updated_at = now(), updated_by = auth.uid()
  where id;
  perform public.write_audit('messaging_settings', 'messaging', 'messaging_settings_saved', null, null, null,
    jsonb_build_object('email_enabled', coalesce(p_email_enabled, false), 'whatsapp_enabled', coalesce(p_whatsapp_enabled, false),
                       'resend_key_changed', v_key is not null, 'fzap_token_changed', v_tok is not null));
end;
$$;

create or replace function public.admin_list_outbound_messages(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Operação não permitida.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'channel', m.channel, 'kind', m.kind, 'destination', m.destination,
             'status', m.status, 'error', m.error, 'created_at', m.created_at,
             'user_name', (select full_name from public.profiles where id = m.user_id)) order by m.created_at desc)
      from (select * from public.outbound_messages order by created_at desc
             limit least(greatest(coalesce(p_limit, 100), 1), 500)) m), '[]'::jsonb);
end;
$$;

-- Permissões ------------------------------------------------------------------
revoke execute on function public.notification_email_default(text) from public, anon;
revoke execute on function public.notification_whatsapp_default(text) from public, anon;
grant execute on function public.notification_email_default(text) to authenticated;
grant execute on function public.notification_whatsapp_default(text) to authenticated;
revoke execute on function public.get_my_notification_preferences() from public, anon;
grant execute on function public.get_my_notification_preferences() to authenticated;
revoke execute on function public.set_my_notification_preference(text, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_my_notification_preference(text, boolean, boolean, boolean, boolean) to authenticated;
revoke execute on function public.get_my_messaging_prefs() from public, anon;
grant execute on function public.get_my_messaging_prefs() to authenticated;
revoke execute on function public.set_my_messaging_prefs(boolean, boolean) from public, anon;
grant execute on function public.set_my_messaging_prefs(boolean, boolean) to authenticated;
revoke execute on function public.email_unsubscribe(uuid) from public;
grant execute on function public.email_unsubscribe(uuid) to anon, authenticated;
revoke execute on function public.notify_motorcycle_limit() from public, anon;
grant execute on function public.notify_motorcycle_limit() to authenticated;
revoke execute on function public.messaging_config() from public, anon, authenticated;
revoke execute on function public.messages_claim_email(integer) from public, anon, authenticated;
revoke execute on function public.messages_claim_whatsapp(integer) from public, anon, authenticated;
revoke execute on function public.messages_report(jsonb) from public, anon, authenticated;
grant execute on function public.messaging_config() to service_role;
grant execute on function public.messages_claim_email(integer) to service_role;
grant execute on function public.messages_claim_whatsapp(integer) to service_role;
grant execute on function public.messages_report(jsonb) to service_role;
revoke execute on function public.admin_get_messaging_settings() from public, anon;
grant execute on function public.admin_get_messaging_settings() to authenticated;
revoke execute on function public.admin_save_messaging_settings(boolean, text, text, text, boolean, text, text, integer) from public, anon;
grant execute on function public.admin_save_messaging_settings(boolean, text, text, text, boolean, text, text, integer) to authenticated;
revoke execute on function public.admin_list_outbound_messages(integer) from public, anon;
grant execute on function public.admin_list_outbound_messages(integer) to authenticated;

-- Rotina a cada 2 min: só chama a função quando há algo pendente e o canal está ligado.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'moto-passaporte-messages';
  perform cron.schedule('moto-passaporte-messages', '*/2 * * * *', $cmd$
    select net.http_post(
      url := (select value #>> '{}' from public.system_settings where key = 'functions_base_url') || '/messages-send',
      headers := jsonb_build_object('Content-Type', 'application/json',
                   'x-job-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_jobs_secret')),
      body := '{"job":"send"}'::jsonb,
      timeout_milliseconds := 60000)
    where exists (select 1 from public.messaging_settings s where s.id and (
            (s.email_enabled and exists (select 1 from public.notifications where email_pending))
         or (s.whatsapp_enabled and exists (select 1 from public.notifications where whatsapp_pending))))
  $cmd$);
end $$;
