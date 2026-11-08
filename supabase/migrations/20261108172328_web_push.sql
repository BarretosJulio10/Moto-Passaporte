-- =============================================================================
-- Notificações no celular (Web Push) — ADR-040
-- - push_subscriptions: aparelhos de cada conta (chaves públicas do navegador; sem dado pessoal).
-- - Preferência "Celular" por tipo: ligada por padrão nos avisos importantes; lembretes de
--   manutenção e espaço ficam desligados até a pessoa ligar.
-- - Silêncio das 22h às 8h (Brasília), exceto pedidos de acesso de oficina: o envio espera.
-- - A Edge Function push-send envia (chamada na hora por pg_net e a cada 5 min pelo pg_cron).
-- - Chaves VAPID: a privada fica só no Vault; a pública é lida pelo app logado.
-- Rollback: supabase/rollback/20261108172328_web_push.down.sql
-- =============================================================================

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  endpoint     text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh       text not null check (char_length(p256dh) between 80 and 100),
  auth         text not null check (char_length(auth) between 16 and 30),
  label        text check (char_length(label) <= 80),
  failures     int  not null default 0,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
comment on table public.push_subscriptions is 'Aparelhos com notificação no celular (ADR-040). Só por funções.';

create table if not exists public.push_config (
  id                 int primary key default 1 check (id = 1),
  vapid_public_key   text,
  last_kick_at       timestamptz not null default '-infinity'
);
insert into public.push_config (id) values (1) on conflict do nothing;
alter table public.push_config enable row level security;
revoke all on public.push_config from public, anon, authenticated;

alter table public.notification_preferences add column if not exists push boolean;
alter table public.notifications add column if not exists push_pending boolean not null default false;
alter table public.notifications add column if not exists push_sent_at timestamptz;
create index if not exists notifications_push_pending_idx on public.notifications (created_at) where push_pending;

-- Celular ligado por padrão só nos avisos importantes.
create or replace function public.notification_push_default(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_kind not in ('reminder_due', 'storage_limit') $$;

-- Pode enviar agora? Silêncio 22h–8h em Brasília, exceto pedido de acesso de oficina.
create or replace function public.push_can_send_now(p_kind text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_kind = 'workshop_access_request'
      or extract(hour from now() at time zone 'America/Sao_Paulo') between 8 and 21;
$$;

create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pref public.notification_preferences;
  v_push boolean;
begin
  if p_user is null then return; end if;
  select * into pref from public.notification_preferences where user_id = p_user and kind = p_kind;
  if found and not pref.in_app and public.notification_kind_optional(p_kind) then return; end if;
  v_push := coalesce(pref.push, public.notification_push_default(p_kind))
            and exists (select 1 from public.push_subscriptions s where s.user_id = p_user);
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key, email_pending, push_pending)
  values (p_user, p_kind, left(p_title, 120), left(p_body, 1000), p_link, p_dedupe, coalesce(pref.email, false), v_push)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
exception when others then
  raise warning 'notify(%) falhou: %', p_kind, sqlerrm;
end;
$$;
revoke execute on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;

-- Chama a Edge Function logo após um aviso para o celular (no máximo 1 chamada a cada 5 s).
create or replace function public.push_kick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  if not exists (select 1 from new_rows n where n.push_pending and public.push_can_send_now(n.kind)) then
    return null;
  end if;
  update public.push_config set last_kick_at = now() where id = 1 and last_kick_at < now() - interval '5 seconds';
  if not found then return null; end if;
  select value #>> '{}' into v_url from public.system_settings where key = 'functions_base_url';
  if v_url is null then return null; end if;
  perform net.http_post(
    url := v_url || '/push-send',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-job-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_jobs_secret')),
    body := '{"job":"push"}'::jsonb,
    timeout_milliseconds := 30000);
  return null;
exception when others then
  raise warning 'push_kick falhou: %', sqlerrm;
  return null;
end;
$$;
revoke execute on function public.push_kick() from public, anon, authenticated;
drop trigger if exists notifications_push_kick on public.notifications;
create trigger notifications_push_kick after insert on public.notifications
  referencing new table as new_rows for each statement execute function public.push_kick();

-- ---------------------------------------------------------------- servidor (Edge Function)
create or replace function public.push_get_keys()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'public_key', (select vapid_public_key from public.push_config where id = 1),
    'private_jwk', (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_private_jwk'),
    'subject', 'mailto:' || coalesce((select value #>> '{}' from public.system_settings where key = 'support_email'), 'suporte@motopassaporte.com.br'));
$$;

-- Grava as chaves só se ainda não existirem (gerar duas vezes invalidaria os aparelhos).
create or replace function public.push_store_keys(p_public_key text, p_private_jwk text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select vapid_public_key from public.push_config where id = 1) is not null then
    return false;
  end if;
  perform public.upsert_vault_secret('push_vapid_private_jwk', p_private_jwk);
  update public.push_config set vapid_public_key = p_public_key where id = 1;
  return true;
end;
$$;

-- Separa um lote para enviar (respeita o silêncio) e já marca como enviado.
create or replace function public.push_claim_batch(p_limit int default 100)
returns table (notification_id uuid, kind text, title text, body text, link text, subscriptions jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Avisos velhos (mais de 2 dias) não vão mais para o celular.
  update public.notifications set push_pending = false where push_pending and created_at < now() - interval '2 days';
  return query
  with picked as (
    select n.id from public.notifications n
     where n.push_pending and public.push_can_send_now(n.kind)
     order by n.created_at
     limit least(greatest(coalesce(p_limit, 100), 1), 500)
     for update skip locked
  ), done as (
    update public.notifications n set push_pending = false, push_sent_at = now()
      from picked where n.id = picked.id
    returning n.id, n.user_id, n.kind, n.title, n.body, n.link
  )
  select d.id, d.kind, d.title, d.body, d.link,
         coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                     from public.push_subscriptions s where s.user_id = d.user_id), '[]'::jsonb)
    from done d;
end;
$$;

-- Resultado do envio: apaga aparelhos que não existem mais; 5 falhas seguidas também removem.
create or replace function public.push_report(p_ok uuid[], p_gone uuid[], p_failed uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_subscriptions set last_used_at = now(), failures = 0 where id = any (coalesce(p_ok, '{}'));
  update public.push_subscriptions set failures = failures + 1 where id = any (coalesce(p_failed, '{}'));
  delete from public.push_subscriptions where id = any (coalesce(p_gone, '{}')) or failures >= 5;
$$;

do $g$
declare f text;
begin
  foreach f in array array['push_get_keys()', 'push_store_keys(text, text)', 'push_claim_batch(int)', 'push_report(uuid[], uuid[], uuid[])']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $g$;

-- ---------------------------------------------------------------- usuário
create or replace function public.get_push_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select vapid_public_key from public.push_config where id = 1 $$;

create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_label text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then
    raise exception 'Aparelho não suportado.' using errcode = '22023';
  end if;
  if (select count(*) from public.push_subscriptions where user_id = v_uid and endpoint <> p_endpoint) >= 10 then
    raise exception 'Limite de 10 aparelhos. Remova um aparelho antigo em Notificações.' using errcode = 'P0001';
  end if;
  -- O mesmo aparelho pode ter sido de outra conta (troca de login): passa para a conta atual.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, label)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(nullif(trim(p_label), ''), 80))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    label = coalesce(excluded.label, public.push_subscriptions.label), failures = 0
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$ delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid() $$;

create or replace function public.get_my_push_devices()
returns table (id uuid, label text, created_at timestamptz, last_used_at timestamptz, endpoint_hint text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.label, s.created_at, s.last_used_at, right(s.endpoint, 12)
    from public.push_subscriptions s where s.user_id = auth.uid() order by s.created_at desc;
$$;

create or replace function public.delete_my_push_device(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$ delete from public.push_subscriptions where id = p_id and user_id = auth.uid() $$;

-- Aviso de teste para o próprio aparelho.
create or replace function public.send_my_test_push()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if not exists (select 1 from public.push_subscriptions where user_id = auth.uid()) then
    raise exception 'Ative as notificações neste aparelho primeiro.' using errcode = 'P0001';
  end if;
  insert into public.notifications (user_id, kind, title, body, link, push_pending)
  values (auth.uid(), 'admin_notice', 'Notificações ativadas', 'Tudo certo: os avisos do Moto Passaporte vão chegar neste aparelho.', '/painel/notificacoes', true);
end;
$$;

-- Preferências com a coluna "Celular".
drop function if exists public.get_my_notification_preferences();
create function public.get_my_notification_preferences()
returns table (kind text, optional boolean, in_app boolean, email boolean, push boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select k.kind, public.notification_kind_optional(k.kind), coalesce(p.in_app, true), coalesce(p.email, false),
         coalesce(p.push, public.notification_push_default(k.kind))
    from unnest(array['workshop_access_request', 'workshop_access_decided', 'workshop_access_revoked', 'workshop_service',
                      'transfer_received', 'transfer_decided', 'reminder_due', 'subscription_ending', 'payment_approved',
                      'payment_failed', 'storage_limit', 'claim_decided', 'ownership_notice', 'admin_notice']) k(kind)
    left join public.notification_preferences p on p.user_id = auth.uid() and p.kind = k.kind;
$$;

drop function if exists public.set_my_notification_preference(text, boolean, boolean);
create function public.set_my_notification_preference(p_kind text, p_in_app boolean, p_email boolean, p_push boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_kind not in (select kind from public.get_my_notification_preferences()) then
    raise exception 'Tipo de aviso desconhecido.' using errcode = '22023';
  end if;
  if not coalesce(p_in_app, true) and not public.notification_kind_optional(p_kind) then
    raise exception 'Este aviso é essencial e não pode ser desligado.' using errcode = '22023';
  end if;
  insert into public.notification_preferences (user_id, kind, in_app, email, push)
  values (auth.uid(), p_kind, coalesce(p_in_app, true), coalesce(p_email, false), p_push)
  on conflict (user_id, kind) do update set in_app = excluded.in_app, email = excluded.email,
    push = coalesce(excluded.push, public.notification_preferences.push), updated_at = now();
end;
$$;

revoke execute on function public.get_push_public_key() from public, anon;
revoke execute on function public.register_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.unregister_push_subscription(text) from public, anon;
revoke execute on function public.get_my_push_devices() from public, anon;
revoke execute on function public.delete_my_push_device(uuid) from public, anon;
revoke execute on function public.send_my_test_push() from public, anon;
revoke execute on function public.get_my_notification_preferences() from public, anon;
revoke execute on function public.set_my_notification_preference(text, boolean, boolean, boolean) from public, anon;
grant execute on function public.get_push_public_key() to authenticated;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.unregister_push_subscription(text) to authenticated;
grant execute on function public.get_my_push_devices() to authenticated;
grant execute on function public.delete_my_push_device(uuid) to authenticated;
grant execute on function public.send_my_test_push() to authenticated;
grant execute on function public.get_my_notification_preferences() to authenticated;
grant execute on function public.set_my_notification_preference(text, boolean, boolean, boolean) to authenticated;
revoke execute on function public.notification_push_default(text) from public, anon;
revoke execute on function public.push_can_send_now(text) from public, anon;
grant execute on function public.notification_push_default(text) to authenticated;
grant execute on function public.push_can_send_now(text) to authenticated;

-- Rotina a cada 5 min: envia o que ficou para trás (silêncio, falha de rede).
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'moto-passaporte-push';
  perform cron.schedule('moto-passaporte-push', '*/5 * * * *', $cmd$
    select net.http_post(
      url := (select value #>> '{}' from public.system_settings where key = 'functions_base_url') || '/push-send',
      headers := jsonb_build_object('Content-Type', 'application/json',
                   'x-job-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_jobs_secret')),
      body := '{"job":"push"}'::jsonb,
      timeout_milliseconds := 30000)
    where exists (select 1 from public.notifications where push_pending)
  $cmd$);
end $$;
