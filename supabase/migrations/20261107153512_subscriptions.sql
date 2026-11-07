-- =============================================================================
-- Fase 5.2 (parte 2) — Assinaturas, pagamentos, Webhook e conciliação (PRD 8; ADR-020)
-- - subscriptions: assinatura interna com preço/periodicidade/limites contratados (8.5).
-- - payments: cada cobrança, com estado próprio (8.4).
-- - payment_events: avisos recebidos do Mercado Pago, validação e resultado (8.3).
-- - Funções billing_* só para o servidor (Edge Functions com service_role);
--   o estado real sempre vem da API do Mercado Pago, nunca do navegador.
-- - user_plan() passa a considerar a assinatura com direito vigente.
-- - Políticas provisórias (P-3, P-4): tolerância de 7 dias após falha de cobrança;
--   cancelamento mantém o Premium até o fim do período pago; reembolso ou
--   contestação encerram o Premium na hora.
-- Rollback: restaurar user_plan da migração subscription_plans e remover as
--   tabelas e funções desta migração (sem dados reais de cobrança ainda).
-- =============================================================================

create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users (id) on delete set null,
  plan_id                  uuid not null references public.subscription_plans (id) on delete restrict,
  plan_code                text not null,
  plan_name                text not null,
  billing_period           text not null check (billing_period in ('monthly', 'semiannual', 'annual')),
  price_cents              int  not null check (price_cents > 0),
  currency                 text not null default 'BRL',
  max_motorcycles          int  not null,
  storage_quota_mb         int  not null,
  status                   text not null default 'pending'
                           check (status in ('pending', 'active', 'past_due', 'paused', 'canceled', 'expired', 'rejected')),
  provider                 text not null default 'mercadopago' check (provider = 'mercadopago'),
  environment              text not null check (environment in ('test', 'production')),
  provider_account_id      text,
  provider_subscription_id text unique,
  provider_status          text,
  checkout_url             text,
  started_at               timestamptz,
  current_period_end       timestamptz,
  past_due_since           timestamptz,
  canceled_at              timestamptz,
  cancel_reason            text check (char_length(cancel_reason) <= 300),
  last_synced_at           timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.subscriptions is
  'Assinaturas Premium (PRD 8.6). Guarda preço, periodicidade e limites contratados; muda só pelo servidor a partir do estado confirmado no Mercado Pago.';

create index subscriptions_user_idx on public.subscriptions (user_id, created_at desc);
create index subscriptions_plan_idx on public.subscriptions (plan_id);
-- Uma assinatura em andamento por usuário.
create unique index subscriptions_one_open on public.subscriptions (user_id)
  where status in ('pending', 'active', 'past_due', 'paused');

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  subscription_id     uuid references public.subscriptions (id) on delete restrict,
  user_id             uuid references auth.users (id) on delete set null,
  provider            text not null default 'mercadopago' check (provider = 'mercadopago'),
  provider_payment_id text not null,
  status              text not null check (status in ('pending', 'approved', 'rejected', 'refunded', 'charged_back', 'canceled')),
  provider_status     text,
  amount_cents        int  not null check (amount_cents >= 0),
  currency            text not null default 'BRL',
  paid_at             timestamptz,
  period_granted      boolean not null default false,
  last_synced_at      timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

comment on table public.payments is
  'Cobranças das assinaturas com estado próprio (PRD 8.4). Sem dados de cartão.';

create index payments_subscription_idx on public.payments (subscription_id, created_at desc);
create index payments_user_idx on public.payments (user_id, created_at desc);

create table public.payment_events (
  id              bigint generated always as identity primary key,
  provider        text not null default 'mercadopago',
  event_type      text check (char_length(event_type) <= 80),
  action          text check (char_length(action) <= 80),
  resource_id     text check (char_length(resource_id) <= 80),
  request_id      text check (char_length(request_id) <= 120),
  signature_valid boolean not null,
  result          text not null default 'received'
                  check (result in ('received', 'processed', 'ignored', 'invalid_signature', 'error')),
  detail          text check (char_length(detail) <= 500),
  received_at     timestamptz not null default now(),
  processed_at    timestamptz
);

comment on table public.payment_events is
  'Avisos recebidos do Mercado Pago (PRD 8.3): sem payload completo nem segredos; só o necessário para investigar.';

create unique index payment_events_request_uq on public.payment_events (provider, request_id) where request_id is not null;
create index payment_events_received_idx on public.payment_events (received_at desc);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create trigger subscriptions_audit after insert or update or delete on public.subscriptions
  for each row execute function public.audit_row_change('', '');
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function public.audit_row_change('', '');

-- Registros financeiros não são apagados.
create or replace function public.prevent_billing_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Registros de cobrança não são excluídos.' using errcode = 'P0001';
end;
$$;

create trigger subscriptions_no_delete before delete on public.subscriptions
  for each row execute function public.prevent_billing_delete();
create trigger payments_no_delete before delete on public.payments
  for each row execute function public.prevent_billing_delete();
create trigger payment_events_no_delete before delete on public.payment_events
  for each row execute function public.prevent_billing_delete();

alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
revoke all on public.subscriptions, public.payments, public.payment_events from anon, authenticated;

insert into public.system_settings (key, value, description, is_public) values
  ('billing_grace_days', '7', 'Dias de tolerância do Premium após falha de cobrança (P-3, provisório).', false)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Plano vigente: assinatura com direito em vigor; senão, o gratuito
-- -----------------------------------------------------------------------------

create or replace function public.user_active_subscription(p_user uuid)
returns public.subscriptions
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.subscriptions s
  where s.user_id = p_user
    and s.current_period_end is not null
    and (
      (s.status in ('active', 'canceled', 'paused') and s.current_period_end > now())
      or (s.status = 'past_due'
          and s.current_period_end + make_interval(days => public.setting_int('billing_grace_days', 7)) > now())
    )
  order by s.current_period_end desc
  limit 1;
$$;

revoke execute on function public.user_active_subscription(uuid) from public, anon, authenticated;

create or replace function public.user_plan(p_user uuid)
returns public.subscription_plans
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  p public.subscription_plans;
begin
  s := public.user_active_subscription(p_user);
  if s.id is not null then
    select * into p from public.subscription_plans where id = s.plan_id;
    -- Limites e nome contratados valem mesmo se o catálogo mudar (PRD 8.5).
    p.name := s.plan_name;
    p.max_motorcycles := s.max_motorcycles;
    p.storage_quota_mb := s.storage_quota_mb;
    p.price_cents := s.price_cents;
    return p;
  end if;
  select * into p from public.subscription_plans where kind = 'free' limit 1;
  return p;
end;
$$;

revoke execute on function public.user_plan(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Funções do servidor (Edge Functions, service_role)
-- -----------------------------------------------------------------------------

create or replace function public.billing_prepare_subscription(p_user uuid, p_plan_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.subscription_plans;
  g public.payment_gateway_settings;
  v_email text;
  v_id uuid;
  v_expired jsonb;
begin
  if coalesce((select (value #>> '{}')::boolean from public.system_settings where key = 'billing_enabled'), false) is not true then
    raise exception 'A contratação ainda não está disponível.' using errcode = 'P0001';
  end if;
  select lower(email) into v_email from auth.users where id = p_user;
  if v_email is null then
    raise exception 'Conta não encontrada.' using errcode = '42501';
  end if;
  select * into p from public.subscription_plans
   where code = p_plan_code and kind = 'premium' and is_active and is_public;
  if not found then
    raise exception 'Plano indisponível.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.subscriptions
             where user_id = p_user and status in ('active', 'past_due', 'paused')) then
    raise exception 'Você já tem uma assinatura em andamento. Cancele a atual antes de contratar outra.' using errcode = 'P0001';
  end if;
  select * into g from public.payment_gateway_settings where provider = 'mercadopago';
  if g.access_token_secret_id is null or g.last_check_ok is not true then
    raise exception 'Pagamentos indisponíveis no momento.' using errcode = 'P0001';
  end if;

  -- Tentativas anteriores não concluídas são encerradas (devolvidas para cancelar no provedor).
  with old as (
    update public.subscriptions set status = 'expired', cancel_reason = 'Nova tentativa de contratação'
     where user_id = p_user and status = 'pending'
     returning provider_subscription_id
  )
  select coalesce(jsonb_agg(provider_subscription_id) filter (where provider_subscription_id is not null), '[]'::jsonb)
    into v_expired from old;

  insert into public.subscriptions
    (user_id, plan_id, plan_code, plan_name, billing_period, price_cents, currency, max_motorcycles,
     storage_quota_mb, environment, provider_account_id)
  values
    (p_user, p.id, p.code, p.name, p.billing_period, p.price_cents, p.currency, p.max_motorcycles,
     p.storage_quota_mb, g.environment, g.account_id)
  returning id into v_id;

  return jsonb_build_object(
    'subscription_id', v_id, 'payer_email', v_email, 'plan_name', p.name,
    'billing_period', p.billing_period, 'price_cents', p.price_cents, 'currency', p.currency,
    'trial_days', p.trial_days, 'expired_provider_ids', v_expired
  );
end;
$$;

create or replace function public.billing_attach_checkout(p_subscription_id uuid, p_provider_subscription_id text, p_checkout_url text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.subscriptions
     set provider_subscription_id = p_provider_subscription_id,
         checkout_url = left(p_checkout_url, 500),
         provider_status = 'pending',
         last_synced_at = now()
   where id = p_subscription_id and status = 'pending';
$$;

create or replace function public.billing_fail_checkout(p_subscription_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.subscriptions set status = 'rejected', cancel_reason = left(p_reason, 300)
   where id = p_subscription_id and status = 'pending';
$$;

-- Mapa de estados da assinatura no Mercado Pago (preapproval) para o estado interno (PRD 8.4).
create or replace function public.billing_apply_subscription_state(
  p_provider_subscription_id text,
  p_external_reference       text,
  p_provider_status          text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  v_new text;
begin
  select * into s from public.subscriptions where provider_subscription_id = p_provider_subscription_id for update;
  if not found and p_external_reference ~ '^[0-9a-f-]{36}$' then
    select * into s from public.subscriptions where id = p_external_reference::uuid for update;
    if found and s.provider_subscription_id is null then
      update public.subscriptions set provider_subscription_id = p_provider_subscription_id where id = s.id;
    end if;
  end if;
  if s.id is null then
    return jsonb_build_object('result', 'ignored', 'detail', 'Assinatura sem vínculo local');
  end if;

  v_new := case p_provider_status
    when 'authorized' then
      case when s.status in ('pending', 'paused', 'rejected', 'expired') then
             case when s.current_period_end is not null and s.current_period_end > now() then 'active' else s.status end
           else s.status end
    when 'paused' then case when s.status in ('canceled', 'expired') then s.status else 'paused' end
    when 'cancelled' then case when s.status in ('pending', 'rejected') then 'expired' else 'canceled' end
    else s.status
  end;
  -- 'pending' no provedor: aguardando o cliente; mantém o estado interno.

  update public.subscriptions set
    status = v_new,
    provider_status = p_provider_status,
    canceled_at = case when v_new = 'canceled' and s.canceled_at is null then now() else s.canceled_at end,
    last_synced_at = now()
  where id = s.id;

  return jsonb_build_object('result', 'processed', 'subscription_id', s.id, 'status', v_new);
end;
$$;

-- Mapa de estados de pagamento (PRD 8.4) e efeito no direito ao Premium.
create or replace function public.billing_apply_payment(
  p_provider_payment_id      text,
  p_provider_subscription_id text,
  p_external_reference       text,
  p_provider_status          text,
  p_amount_cents             int,
  p_paid_at                  timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  pay public.payments;
  v_status text;
  v_months int;
  v_base timestamptz;
begin
  select * into s from public.subscriptions
   where provider_subscription_id = p_provider_subscription_id for update;
  if not found and p_external_reference ~ '^[0-9a-f-]{36}$' then
    select * into s from public.subscriptions where id = p_external_reference::uuid for update;
  end if;
  if s.id is null then
    return jsonb_build_object('result', 'ignored', 'detail', 'Pagamento sem assinatura local');
  end if;

  v_status := case
    when p_provider_status in ('approved', 'processed', 'authorized_payment_approved') then 'approved'
    when p_provider_status in ('pending', 'in_process', 'in_mediation', 'authorized', 'scheduled', 'recycling') then 'pending'
    when p_provider_status in ('rejected') then 'rejected'
    when p_provider_status in ('cancelled') then 'canceled'
    when p_provider_status in ('refunded') then 'refunded'
    when p_provider_status in ('charged_back') then 'charged_back'
    else 'pending'
  end;

  insert into public.payments (subscription_id, user_id, provider_payment_id, status, provider_status, amount_cents, currency, paid_at)
  values (s.id, s.user_id, p_provider_payment_id, v_status, p_provider_status, coalesce(p_amount_cents, 0), s.currency,
          case when v_status = 'approved' then coalesce(p_paid_at, now()) end)
  on conflict (provider, provider_payment_id) do update set
    status = excluded.status,
    provider_status = excluded.provider_status,
    amount_cents = case when excluded.amount_cents > 0 then excluded.amount_cents else public.payments.amount_cents end,
    paid_at = coalesce(public.payments.paid_at, excluded.paid_at),
    last_synced_at = now()
  returning * into pay;

  v_months := case s.billing_period when 'monthly' then 1 when 'semiannual' then 6 else 12 end;

  if v_status = 'approved' and not pay.period_granted then
    -- Idempotente: cada pagamento aprovado concede um período uma única vez.
    v_base := greatest(coalesce(s.current_period_end, now()), now());
    update public.payments set period_granted = true where id = pay.id;
    update public.subscriptions set
      current_period_end = v_base + make_interval(months => v_months),
      started_at = coalesce(started_at, now()),
      status = case when status in ('pending', 'past_due', 'rejected', 'expired') then 'active' else status end,
      past_due_since = null,
      last_synced_at = now()
    where id = s.id;
  elsif v_status in ('rejected', 'canceled') then
    update public.subscriptions set
      status = case
        when status = 'active' and (current_period_end is null or current_period_end <= now() + interval '3 days') then 'past_due'
        when status = 'pending' and current_period_end is null then 'pending'
        else status end,
      past_due_since = case when status = 'active' and (current_period_end is null or current_period_end <= now() + interval '3 days')
                            then coalesce(past_due_since, now()) else past_due_since end,
      last_synced_at = now()
    where id = s.id;
  elsif v_status in ('refunded', 'charged_back') and pay.period_granted then
    -- Política provisória (P-4): reembolso ou contestação encerram o Premium na hora.
    update public.subscriptions set
      current_period_end = least(coalesce(current_period_end, now()), now()),
      last_synced_at = now()
    where id = s.id;
  end if;

  return jsonb_build_object('result', 'processed', 'subscription_id', s.id, 'payment_status', v_status);
end;
$$;

create or replace function public.billing_log_event(
  p_event_type text, p_action text, p_resource_id text, p_request_id text, p_signature_valid boolean
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.payment_events (event_type, action, resource_id, request_id, signature_valid,
                                     result)
  values (left(p_event_type, 80), left(p_action, 80), left(p_resource_id, 80), left(p_request_id, 120), p_signature_valid,
          case when p_signature_valid then 'received' else 'invalid_signature' end)
  on conflict (provider, request_id) where request_id is not null do nothing
  returning id into v_id;
  if v_id is null and p_signature_valid then
    -- Repetição de um aviso que falhou, não terminou ou chegou sem assinatura válida: processa de novo.
    update public.payment_events set signature_valid = true, result = 'received'
     where provider = 'mercadopago' and request_id = left(p_request_id, 120)
       and result in ('received', 'error', 'invalid_signature')
    returning id into v_id;
  end if;
  return v_id; -- NULL = aviso repetido já processado
end;
$$;

create or replace function public.billing_finish_event(p_event_id bigint, p_result text, p_detail text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_events
     set result = p_result, detail = left(p_detail, 500), processed_at = now()
   where id = p_event_id;
$$;

-- Assinatura do usuário para o servidor (cancelar / sincronizar).
create or replace function public.billing_user_subscription(p_user uuid)
returns public.subscriptions
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.subscriptions
   where user_id = p_user and provider_subscription_id is not null
     and status in ('pending', 'active', 'past_due', 'paused', 'canceled')
   order by created_at desc limit 1;
$$;

create or replace function public.billing_cancel_local(p_subscription_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.subscriptions
     set status = case when status = 'pending' then 'expired' else 'canceled' end,
         canceled_at = coalesce(canceled_at, now()),
         cancel_reason = left(p_reason, 300),
         provider_status = 'cancelled',
         last_synced_at = now()
   where id = p_subscription_id and status in ('pending', 'active', 'past_due', 'paused');
$$;

-- Assinaturas a conciliar (PRD 8.3).
create or replace function public.billing_reconcile_targets(p_limit int default 50)
returns table (id uuid, provider_subscription_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.provider_subscription_id from public.subscriptions s
   where s.provider_subscription_id is not null
     and (s.status in ('pending', 'active', 'past_due', 'paused')
          or (s.status = 'canceled' and s.current_period_end > now()))
   order by s.last_synced_at nulls first
   limit least(greatest(p_limit, 1), 200);
$$;

do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.billing_prepare_subscription(uuid, text)',
    'public.billing_attach_checkout(uuid, text, text)',
    'public.billing_fail_checkout(uuid, text)',
    'public.billing_apply_subscription_state(text, text, text)',
    'public.billing_apply_payment(text, text, text, text, int, timestamptz)',
    'public.billing_log_event(text, text, text, text, boolean)',
    'public.billing_finish_event(bigint, text, text)',
    'public.billing_user_subscription(uuid)',
    'public.billing_cancel_local(uuid, text)',
    'public.billing_reconcile_targets(int)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$grants$;

-- -----------------------------------------------------------------------------
-- Leitura do usuário
-- -----------------------------------------------------------------------------

create or replace function public.get_my_subscription()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  s public.subscriptions;
  v_grace int := public.setting_int('billing_grace_days', 7);
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  select * into s from public.subscriptions
   where user_id = v_uid and status <> 'expired' and not (status = 'rejected' and current_period_end is null)
   order by created_at desc limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', s.id, 'plan_name', s.plan_name, 'billing_period', s.billing_period, 'price_cents', s.price_cents,
    'status', s.status, 'current_period_end', s.current_period_end, 'started_at', s.started_at,
    'canceled_at', s.canceled_at, 'past_due_since', s.past_due_since,
    'grace_until', case when s.status = 'past_due' then s.current_period_end + make_interval(days => v_grace) end,
    'has_access', (public.user_active_subscription(v_uid)).id = s.id,
    'environment', s.environment
  );
end;
$$;

revoke execute on function public.get_my_subscription() from public, anon;
grant execute on function public.get_my_subscription() to authenticated;

create or replace function public.get_my_payments()
returns table (id uuid, status text, amount_cents int, currency text, paid_at timestamptz, created_at timestamptz, plan_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.status, p.amount_cents, p.currency, p.paid_at, p.created_at, s.plan_name
    from public.payments p
    join public.subscriptions s on s.id = p.subscription_id
   where p.user_id = auth.uid()
   order by p.created_at desc
   limit 100;
$$;

revoke execute on function public.get_my_payments() from public, anon;
grant execute on function public.get_my_payments() to authenticated;

-- -----------------------------------------------------------------------------
-- Administração (investigar sem editar registros financeiros — PRD 8.5)
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_subscriptions(p_limit int default 100)
returns table (
  id uuid, user_name text, plan_name text, billing_period text, price_cents int, status text,
  provider_status text, environment text, current_period_end timestamptz, created_at timestamptz,
  last_synced_at timestamptz, payments_approved int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select s.id, coalesce(pr.full_name, 'Conta removida'), s.plan_name, s.billing_period, s.price_cents, s.status,
           s.provider_status, s.environment, s.current_period_end, s.created_at, s.last_synced_at,
           (select count(*)::int from public.payments p where p.subscription_id = s.id and p.status = 'approved')
      from public.subscriptions s
      left join public.profiles pr on pr.id = s.user_id
     where s.status <> 'expired' or s.created_at > now() - interval '7 days'
     order by s.created_at desc
     limit least(greatest(p_limit, 1), 500);
end;
$$;

revoke execute on function public.admin_list_subscriptions(int) from public, anon;
grant execute on function public.admin_list_subscriptions(int) to authenticated;

create or replace function public.admin_list_payment_events(p_limit int default 50)
returns setof public.payment_events
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query select * from public.payment_events order by received_at desc limit least(greatest(p_limit, 1), 200);
end;
$$;

revoke execute on function public.admin_list_payment_events(int) from public, anon;
grant execute on function public.admin_list_payment_events(int) to authenticated;

-- Liga/desliga a contratação. Só liga com conta testada e assinatura do Webhook cadastrada.
create or replace function public.admin_set_billing_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.payment_gateway_settings;
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  select * into g from public.payment_gateway_settings where provider = 'mercadopago';
  if p_enabled and (g.access_token_secret_id is null or g.last_check_ok is not true or g.webhook_secret_secret_id is null) then
    raise exception 'Para liberar a contratação: cadastre o token, teste a conexão com sucesso e cadastre a assinatura secreta do Webhook.'
      using errcode = 'P0001';
  end if;
  update public.system_settings set value = to_jsonb(p_enabled), updated_by = auth.uid(), updated_at = now()
   where key = 'billing_enabled';
end;
$$;

revoke execute on function public.admin_set_billing_enabled(boolean) from public, anon;
grant execute on function public.admin_set_billing_enabled(boolean) to authenticated;
