-- =============================================================================
-- Central de notificações internas (PRD 12; KI-020; ADR-031)
-- - Tabela notifications (só o destinatário lê; ninguém escreve direto).
-- - Avisos gerados no banco, no mesmo momento do evento (gatilhos) ou pela rotina diária
--   (lembretes, assinatura perto do fim, espaço perto do limite).
-- - Preferências: avisos opcionais podem ser silenciados; interesse por e-mail fica gravado
--   (email_pending) para quando o envio for ativado. Nada é enviado para fora por enquanto.
-- - Falha ao gerar aviso nunca desfaz a ação principal (exceção capturada, só aviso no log).
-- Rollback: supabase/rollback/<versão>_notifications.down.sql (remove gatilhos, funções, tabelas e o agendamento).
-- =============================================================================

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('workshop_access_request', 'workshop_access_decided', 'workshop_access_revoked',
                  'workshop_service', 'transfer_received', 'transfer_decided', 'reminder_due', 'subscription_ending',
                  'payment_approved', 'payment_failed', 'storage_limit', 'claim_decided', 'ownership_notice', 'admin_notice')),
  title         text not null check (char_length(title) between 1 and 120),
  body          text check (char_length(body) <= 1000),
  link          text check (link is null or link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  dedupe_key    text,
  email_pending boolean not null default false,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create unique index if not exists notifications_dedupe_idx on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
comment on table public.notifications is 'Central de notificações internas (PRD 12, ADR-031). Gerada só pelo banco; lida pelo destinatário.';

create table if not exists public.notification_preferences (
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  in_app     boolean not null default true,
  email      boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public, anon, authenticated;

-- Tipos que podem ser silenciados no site. Os demais (pagamento, oficina, transferência...) são essenciais.
create or replace function public.notification_kind_optional(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_kind in ('reminder_due', 'storage_limit', 'subscription_ending', 'workshop_service') $$;

-- Gera um aviso (uso interno). Respeita preferências; ignora repetidos pela chave; nunca falha.
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pref public.notification_preferences;
begin
  if p_user is null then return; end if;
  select * into pref from public.notification_preferences where user_id = p_user and kind = p_kind;
  if found and not pref.in_app and public.notification_kind_optional(p_kind) then return; end if;
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key, email_pending)
  values (p_user, p_kind, left(p_title, 120), left(p_body, 1000), p_link, p_dedupe, coalesce(pref.email, false))
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
exception when others then
  raise warning 'notify(%) falhou: %', p_kind, sqlerrm;
end;
$$;

create or replace function public.moto_label(p_motorcycle uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select brand || ' ' || model from public.motorcycles where id = p_motorcycle), 'sua moto') $$;

create or replace function public.moto_owner(p_motorcycle uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select owner_user_id from public.motorcycle_ownerships where motorcycle_id = p_motorcycle and ended_at is null limit 1 $$;

create or replace function public.org_label(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select business_name from public.workshops where organization_id = p_org), 'Uma oficina') $$;

-- Oficinas: pedido, decisão, revogação ------------------------------------------
create or replace function public.trg_notify_workshop_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m uuid;
begin
  begin
    if tg_op = 'INSERT' and new.status = 'pending' then
      perform public.notify(public.moto_owner(new.motorcycle_id), 'workshop_access_request',
        public.org_label(new.organization_id) || ' pediu acesso',
        'A oficina pediu para ver e registrar serviços no histórico da ' || public.moto_label(new.motorcycle_id) || '. Você decide no painel.',
        '/painel/motos/' || new.motorcycle_id, 'access:' || new.id || ':pending');
    elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'rejected') then
      for m in select distinct u from (select new.requested_by u union all
                 select user_id from public.organization_members where organization_id = new.organization_id and role = 'responsible' and status = 'active') x
                where u is not null loop
        perform public.notify(m, 'workshop_access_decided',
          case when new.status = 'approved' then 'Acesso autorizado' else 'Acesso recusado' end,
          'O titular ' || case when new.status = 'approved' then 'autorizou' else 'recusou' end || ' o acesso à ' || public.moto_label(new.motorcycle_id) || '.',
          '/oficina/' || new.organization_id, 'access:' || new.id || ':' || new.status);
      end loop;
    elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'revoked' then
      for m in select user_id from public.organization_members where organization_id = new.organization_id and role = 'responsible' and status = 'active' loop
        perform public.notify(m, 'workshop_access_revoked', 'Acesso revogado',
          'O titular encerrou o acesso da oficina ao histórico da ' || public.moto_label(new.motorcycle_id) || '.',
          '/oficina/' || new.organization_id, 'access:' || new.id || ':revoked');
      end loop;
    end if;
  exception when others then
    raise warning 'aviso de oficina falhou: %', sqlerrm;
  end;
  return null;
end;
$$;

create or replace function public.trg_notify_workshop_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_type = 'workshop' and new.corrects_record_id is null then
    perform public.notify(public.moto_owner(new.motorcycle_id), 'workshop_service',
      'Novo serviço registrado', public.org_label(new.organization_id) || ' registrou "' || left(new.title, 80) || '" na ' || public.moto_label(new.motorcycle_id) || '.',
      '/painel/motos/' || new.motorcycle_id || '/historico', 'service:' || new.id);
  end if;
  return null;
exception when others then
  raise warning 'aviso de serviço falhou: %', sqlerrm;
  return null;
end;
$$;

-- Transferências -----------------------------------------------------------------
create or replace function public.trg_notify_transfer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to uuid;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    v_to := coalesce(new.to_user_id, (select id from auth.users where lower(email) = lower(new.to_email) limit 1));
    perform public.notify(v_to, 'transfer_received', 'Transferência de moto para você',
      coalesce((select full_name from public.profiles where id = new.from_user_id), 'O titular') || ' quer transferir a ' || public.moto_label(new.motorcycle_id) || ' para a sua conta.',
      '/painel', 'transfer:' || new.id || ':pending');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('accepted', 'rejected') then
    perform public.notify(new.from_user_id, 'transfer_decided',
      case when new.status = 'accepted' then 'Transferência aceita' else 'Transferência recusada' end,
      'O comprador ' || case when new.status = 'accepted' then 'aceitou' else 'recusou' end || ' a transferência da ' || public.moto_label(new.motorcycle_id) || '.',
      '/painel', 'transfer:' || new.id || ':' || new.status);
  end if;
  return null;
exception when others then
  raise warning 'aviso de transferência falhou: %', sqlerrm;
  return null;
end;
$$;

-- Pagamentos ---------------------------------------------------------------------
create or replace function public.trg_notify_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from (case when tg_op = 'UPDATE' then old.status end) then
    if new.status = 'approved' then
      perform public.notify(new.user_id, 'payment_approved', 'Pagamento confirmado',
        'Recebemos o pagamento de ' || to_char(new.amount_cents / 100.0, 'FM999G990D00') || ' ' || new.currency || '. Obrigado!',
        '/painel/plano', 'payment:' || new.id || ':approved');
    elsif new.status = 'rejected' then
      perform public.notify(new.user_id, 'payment_failed', 'Falha no pagamento',
        'O Mercado Pago recusou a cobrança da sua assinatura. Confira o cartão para não perder o Premium.',
        '/painel/plano', 'payment:' || new.id || ':rejected');
    end if;
  end if;
  return null;
exception when others then
  raise warning 'aviso de pagamento falhou: %', sqlerrm;
  return null;
end;
$$;

-- Verificação de placa -----------------------------------------------------------
create or replace function public.trg_notify_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform public.notify(new.requested_by, 'claim_decided', 'Pedido de verificação respondido',
      'A equipe respondeu ao seu pedido sobre a placa ' || new.plate || '.', '/painel', 'claim:' || new.id || ':' || new.status);
  end if;
  if old.owner_notified_at is null and new.owner_notified_at is not null then
    perform public.notify(public.moto_owner(new.motorcycle_id), 'ownership_notice', 'Aviso sobre a sua moto',
      'Alguém informou que comprou a ' || public.moto_label(new.motorcycle_id) || '. Se você vendeu, faça a transferência pelo painel.',
      '/painel', 'claim:' || new.id || ':owner');
  end if;
  return null;
exception when others then
  raise warning 'aviso de verificação falhou: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists notify_workshop_access on public.motorcycle_workshop_access;
create trigger notify_workshop_access after insert or update of status on public.motorcycle_workshop_access
  for each row execute function public.trg_notify_workshop_access();
drop trigger if exists notify_workshop_service on public.maintenance_records;
create trigger notify_workshop_service after insert on public.maintenance_records
  for each row execute function public.trg_notify_workshop_service();
drop trigger if exists notify_transfer on public.transfer_requests;
create trigger notify_transfer after insert or update of status on public.transfer_requests
  for each row execute function public.trg_notify_transfer();
drop trigger if exists notify_payment on public.payments;
create trigger notify_payment after insert or update of status on public.payments
  for each row execute function public.trg_notify_payment();
drop trigger if exists notify_claim on public.motorcycle_claim_requests;
create trigger notify_claim after update on public.motorcycle_claim_requests
  for each row execute function public.trg_notify_claim();

-- Rotina diária: lembretes, fim de assinatura, espaço; limpeza de avisos antigos lidos ------
create or replace function public.system_generate_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_before int := (select count(*) from public.notifications);
  v_alert int := public.setting_int('storage_alert_percent', 80);
  v_deleted int;
begin
  for r in
    select x.owner_user_id, x.v from (
      select rm.owner_user_id, public.reminder_view(rm, public.motorcycle_current_km(rm.motorcycle_id)) v
        from public.maintenance_reminders rm
        join public.motorcycle_ownerships o on o.motorcycle_id = rm.motorcycle_id and o.ended_at is null and o.owner_user_id = rm.owner_user_id
       where not rm.paused and rm.done_at is null) x
     where x.v ->> 'status' in ('due', 'soon')
  loop
    perform public.notify(r.owner_user_id, 'reminder_due',
      case when r.v ->> 'status' = 'due' then 'Manutenção vencida: ' else 'Manutenção chegando: ' end || left(r.v ->> 'title', 80),
      public.moto_label((r.v ->> 'motorcycle_id')::uuid) ||
        coalesce(' · faltam ' || (r.v ->> 'km_left') || ' km', '') || coalesce(' · ' || (r.v ->> 'days_left') || ' dia(s)', ''),
      '/painel/motos/' || (r.v ->> 'motorcycle_id'),
      'reminder:' || (r.v ->> 'id') || ':' || (r.v ->> 'status') || ':' || coalesce(r.v ->> 'next_km', '') || ':' || coalesce(r.v ->> 'next_date', ''));
  end loop;

  for r in select s.id, s.user_id, s.plan_name, s.current_period_end from public.subscriptions s
            where s.status = 'canceled' and s.current_period_end between now() and now() + interval '3 days'
  loop
    perform public.notify(r.user_id, 'subscription_ending', 'Seu Premium termina em breve',
      'A assinatura ' || r.plan_name || ' foi cancelada e o acesso Premium termina em ' || to_char(r.current_period_end at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '.',
      '/painel/plano', 'subscription:' || r.id || ':ending');
  end loop;

  for r in select s.id, s.user_id, s.past_due_since from public.subscriptions s where s.status = 'past_due'
  loop
    perform public.notify(r.user_id, 'payment_failed', 'Assinatura em atraso',
      'Não conseguimos cobrar a sua assinatura. Regularize no Mercado Pago para manter o Premium.',
      '/painel/plano', 'subscription:' || r.id || ':past_due:' || coalesce(r.past_due_since::date::text, ''));
  end loop;

  for r in select u.id from auth.users u
            where public.user_storage_used_bytes(u.id) > 0
              and public.user_storage_used_bytes(u.id) * 100 >= v_alert::bigint * public.user_storage_quota_mb(u.id)::bigint * 1048576
  loop
    perform public.notify(r.id, 'storage_limit', 'Espaço quase cheio',
      'Você já usou ' || v_alert || '% ou mais do espaço para fotos e comprovantes. Apague o que não precisa ou conheça o Premium.',
      '/painel/plano', 'storage:' || to_char(now(), 'IYYY-IW'));
  end loop;

  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('created', (select count(*) from public.notifications) - v_before + v_deleted, 'deleted_old', v_deleted);
end;
$$;

-- Leitura pelo usuário -----------------------------------------------------------
create or replace function public.get_my_notifications(p_limit int default 30, p_before timestamptz default null)
returns table (id uuid, kind text, title text, body text, link text, created_at timestamptz, read_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.kind, n.title, n.body, n.link, n.created_at, n.read_at
    from public.notifications n
   where n.user_id = auth.uid() and (p_before is null or n.created_at < p_before)
   order by n.created_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.count_my_unread_notifications()
returns int
language sql
stable
security definer
set search_path = ''
as $$ select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null $$;

create or replace function public.mark_my_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v int;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v = row_count;
  return v;
end;
$$;

create or replace function public.get_my_notification_preferences()
returns table (kind text, optional boolean, in_app boolean, email boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select k.kind, public.notification_kind_optional(k.kind), coalesce(p.in_app, true), coalesce(p.email, false)
    from unnest(array['workshop_access_request', 'workshop_access_decided', 'workshop_access_revoked', 'workshop_service',
                      'transfer_received', 'transfer_decided', 'reminder_due', 'subscription_ending', 'payment_approved',
                      'payment_failed', 'storage_limit', 'claim_decided', 'ownership_notice', 'admin_notice']) k(kind)
    left join public.notification_preferences p on p.user_id = auth.uid() and p.kind = k.kind;
$$;

create or replace function public.set_my_notification_preference(p_kind text, p_in_app boolean, p_email boolean)
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
  insert into public.notification_preferences (user_id, kind, in_app, email)
  values (auth.uid(), p_kind, coalesce(p_in_app, true), coalesce(p_email, false))
  on conflict (user_id, kind) do update set in_app = excluded.in_app, email = excluded.email, updated_at = now();
end;
$$;

-- Aviso administrativo para uma conta, com motivo e auditoria.
create or replace function public.admin_send_notice(p_user_id uuid, p_title text, p_body text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.require_admin_reason(p_reason);
begin
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;
  if char_length(coalesce(trim(p_title), '')) not between 3 and 120 or char_length(coalesce(trim(p_body), '')) not between 3 and 1000 then
    raise exception 'Escreva um título (3 a 120 caracteres) e uma mensagem (3 a 1000).' using errcode = '22023';
  end if;
  perform public.notify(p_user_id, 'admin_notice', trim(p_title), trim(p_body), '/painel/notificacoes');
  perform public.write_audit('notifications', p_user_id::text, 'admin_send_notice', null, null, null,
    jsonb_build_object('reason', v_reason, 'title', trim(p_title)));
end;
$$;

revoke execute on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.moto_label(uuid) from public, anon, authenticated;
revoke execute on function public.moto_owner(uuid) from public, anon, authenticated;
revoke execute on function public.org_label(uuid) from public, anon, authenticated;
revoke execute on function public.trg_notify_workshop_access() from public, anon, authenticated;
revoke execute on function public.trg_notify_workshop_service() from public, anon, authenticated;
revoke execute on function public.trg_notify_transfer() from public, anon, authenticated;
revoke execute on function public.trg_notify_payment() from public, anon, authenticated;
revoke execute on function public.trg_notify_claim() from public, anon, authenticated;
revoke execute on function public.system_generate_notifications() from public, anon, authenticated;
revoke execute on function public.notification_kind_optional(text) from public, anon;
revoke execute on function public.get_my_notifications(int, timestamptz) from public, anon;
revoke execute on function public.count_my_unread_notifications() from public, anon;
revoke execute on function public.mark_my_notifications_read(uuid[]) from public, anon;
revoke execute on function public.get_my_notification_preferences() from public, anon;
revoke execute on function public.set_my_notification_preference(text, boolean, boolean) from public, anon;
revoke execute on function public.admin_send_notice(uuid, text, text, text) from public, anon;
grant execute on function public.system_generate_notifications() to service_role;
grant execute on function public.notification_kind_optional(text) to authenticated;
grant execute on function public.get_my_notifications(int, timestamptz) to authenticated;
grant execute on function public.count_my_unread_notifications() to authenticated;
grant execute on function public.mark_my_notifications_read(uuid[]) to authenticated;
grant execute on function public.get_my_notification_preferences() to authenticated;
grant execute on function public.set_my_notification_preference(text, boolean, boolean) to authenticated;
grant execute on function public.admin_send_notice(uuid, text, text, text) to authenticated;

-- Agendamento diário (só onde há pg_cron): 08:07 em Brasília.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('moto-passaporte-notifications', '7 11 * * *', 'select public.system_generate_notifications()');
  end if;
end $$;
