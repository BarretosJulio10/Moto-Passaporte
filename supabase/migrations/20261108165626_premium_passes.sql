-- =============================================================================
-- Premium por período, pago à vista (Pix, débito, boleto ou saldo) — ADR-039
-- Para quem não quer cadastrar cartão de crédito na assinatura automática. O cliente paga um
-- período (1, 6 ou 12 meses, conforme o plano) pelo Checkout do Mercado Pago; ao aprovar,
-- o Premium vale até a data final. Renovar antes do fim soma ao período atual.
-- Avisos: 30 dias (só períodos de 6+ meses), 15, 7, vence hoje e venceu.
-- Plano vigente: assinatura com cartão > período pago > bônus (cortesia) > gratuito.
-- Rollback: supabase/rollback/20261108165626_premium_passes.down.sql
-- =============================================================================

create table if not exists public.premium_passes (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users (id) on delete set null,
  plan_id             uuid not null references public.subscription_plans (id) on delete restrict,
  plan_code           text not null,
  plan_name           text not null,
  billing_period      text not null check (billing_period in ('monthly', 'semiannual', 'annual')),
  months              int  not null check (months in (1, 6, 12)),
  price_cents         int  not null check (price_cents > 0),
  currency            text not null default 'BRL',
  max_motorcycles     int  not null,
  storage_quota_mb    int  not null,
  entitlements        text[] not null default '{}',
  max_share_links     int,
  status              text not null default 'pending'
                      check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  environment         text not null check (environment in ('test', 'production')),
  provider_preference_id text,
  provider_payment_id text unique,
  provider_status     text,
  payment_method      text,
  checkout_url        text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (status <> 'paid' or (starts_at is not null and ends_at > starts_at))
);
create index if not exists premium_passes_user_idx on public.premium_passes (user_id, created_at desc);
create index if not exists premium_passes_plan_idx on public.premium_passes (plan_id);
create index if not exists premium_passes_paid_idx on public.premium_passes (user_id, ends_at) where status = 'paid';
create index if not exists premium_passes_pending_idx on public.premium_passes (status, created_at) where status = 'pending';
alter table public.premium_passes enable row level security;
revoke all on public.premium_passes from public, anon, authenticated;
comment on table public.premium_passes is 'Premium por período pago à vista (Pix/débito/boleto), ADR-039. Só por funções.';

-- Período pago em vigor agora.
create or replace function public.user_active_pass(p_user uuid)
returns public.premium_passes
language sql
stable
security definer
set search_path = ''
as $$
  select x.* from public.premium_passes x
   where x.user_id = p_user and x.status = 'paid' and x.starts_at <= now() and x.ends_at > now()
   order by x.ends_at desc limit 1;
$$;

-- Fim da cobertura paga (último período pago ainda não vencido), para somar renovações.
create or replace function public.user_pass_until(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(x.ends_at) from public.premium_passes x
   where x.user_id = p_user and x.status = 'paid' and x.ends_at > now();
$$;
revoke execute on function public.user_active_pass(uuid) from public, anon, authenticated;
revoke execute on function public.user_pass_until(uuid) from public, anon, authenticated;

create or replace function public.user_plan(p_user uuid)
returns public.subscription_plans
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.subscriptions;
  x public.premium_passes;
  g public.premium_grants;
  p public.subscription_plans;
begin
  s := public.user_active_subscription(p_user);
  if s.id is not null then
    select * into p from public.subscription_plans where id = s.plan_id;
    p.name := s.plan_name;
    p.max_motorcycles := s.max_motorcycles;
    p.storage_quota_mb := s.storage_quota_mb;
    p.price_cents := s.price_cents;
    p.entitlements := s.entitlements;
    p.max_share_links := s.max_share_links;
    return p;
  end if;
  x := public.user_active_pass(p_user);
  if x.id is not null then
    select * into p from public.subscription_plans where id = x.plan_id;
    p.name := x.plan_name;
    p.max_motorcycles := x.max_motorcycles;
    p.storage_quota_mb := x.storage_quota_mb;
    p.price_cents := x.price_cents;
    p.entitlements := x.entitlements;
    p.max_share_links := x.max_share_links;
    return p;
  end if;
  g := public.user_active_grant(p_user);
  if g.id is not null then
    select * into p from public.subscription_plans where id = g.plan_id;
    p.name := p.name || ' (cortesia)';
    p.price_cents := 0;
    return p;
  end if;
  select * into p from public.subscription_plans where kind = 'free' limit 1;
  return p;
end;
$$;
revoke execute on function public.user_plan(uuid) from public, anon, authenticated;

-- Servidor (Edge Function): prepara um período para pagar.
create or replace function public.billing_prepare_pass(p_user uuid, p_plan_code text)
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
  v_months int;
  v_until timestamptz;
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
  v_months := case p.billing_period when 'monthly' then 1 when 'semiannual' then 6 when 'annual' then 12 end;
  if v_months is null then
    raise exception 'Plano indisponível.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.subscriptions
             where user_id = p_user and status in ('active', 'past_due', 'paused')) then
    raise exception 'Você já tem assinatura automática no cartão. Para pagar por Pix, cancele a assinatura antes.' using errcode = 'P0001';
  end if;
  v_until := public.user_pass_until(p_user);
  if v_until is not null and v_until > now() + interval '400 days' then
    raise exception 'Você já tem Premium pago por mais de um ano. Renove mais perto do vencimento.' using errcode = 'P0001';
  end if;
  select * into g from public.payment_gateway_settings where provider = 'mercadopago';
  if g.access_token_secret_id is null or g.last_check_ok is not true then
    raise exception 'Pagamentos indisponíveis no momento.' using errcode = 'P0001';
  end if;
  -- Tentativas anteriores não pagas deixam de valer (o pagamento atrasado ainda é reconhecido).
  update public.premium_passes set status = 'expired', updated_at = now()
   where user_id = p_user and status = 'pending' and created_at < now() - interval '3 days';
  if (select count(*) from public.premium_passes where user_id = p_user and status = 'pending' and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Muitas tentativas de pagamento hoje. Tente amanhã ou fale com o suporte.' using errcode = 'P0001';
  end if;
  insert into public.premium_passes
    (user_id, plan_id, plan_code, plan_name, billing_period, months, price_cents, currency,
     max_motorcycles, storage_quota_mb, entitlements, max_share_links, environment)
  values
    (p_user, p.id, p.code, p.name, p.billing_period, v_months, p.price_cents, p.currency,
     p.max_motorcycles, p.storage_quota_mb, coalesce(p.entitlements, '{}'), p.max_share_links, g.environment)
  returning id into v_id;
  return jsonb_build_object('pass_id', v_id, 'payer_email', v_email, 'plan_name', p.name, 'months', v_months,
                            'price_cents', p.price_cents, 'currency', p.currency);
end;
$$;

create or replace function public.billing_attach_pass_checkout(p_pass_id uuid, p_preference_id text, p_checkout_url text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.premium_passes set provider_preference_id = left(p_preference_id, 120), checkout_url = left(p_checkout_url, 500), updated_at = now()
   where id = p_pass_id and status = 'pending';
$$;

create or replace function public.billing_fail_pass_checkout(p_pass_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.premium_passes set status = 'failed', updated_at = now() where id = p_pass_id and status = 'pending';
$$;

-- Servidor: aplica o pagamento confirmado na API do Mercado Pago (idempotente).
create or replace function public.billing_apply_pass_payment(
  p_pass_id uuid, p_provider_payment_id text, p_provider_status text, p_amount_cents int,
  p_paid_at timestamptz, p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.premium_passes;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into x from public.premium_passes where id = p_pass_id for update;
  if not found then
    return jsonb_build_object('result', 'ignored', 'detail', 'Período não encontrado');
  end if;
  -- Outro pagamento já liquidou este período: o novo é ignorado (reembolso manual pelo suporte).
  if x.provider_payment_id is not null and x.provider_payment_id <> p_provider_payment_id and x.status = 'paid' then
    return jsonb_build_object('result', 'ignored', 'detail', 'Período já pago por outro pagamento');
  end if;

  if p_provider_status in ('approved', 'accredited') then
    if x.status = 'paid' then
      return jsonb_build_object('result', 'processed', 'detail', 'Já aplicado');
    end if;
    if p_amount_cents < x.price_cents then
      update public.premium_passes set provider_status = 'amount_mismatch', provider_payment_id = p_provider_payment_id, updated_at = now() where id = x.id;
      perform public.write_audit('premium_passes', x.id::text, 'pass_amount_mismatch', null, null, null,
        jsonb_build_object('expected', x.price_cents, 'received', p_amount_cents));
      return jsonb_build_object('result', 'error', 'detail', 'Valor pago menor que o do período');
    end if;
    v_start := greatest(now(), coalesce(public.user_pass_until(x.user_id), now()));
    v_end := v_start + make_interval(months => x.months);
    update public.premium_passes
       set status = 'paid', provider_payment_id = p_provider_payment_id, provider_status = p_provider_status,
           payment_method = left(p_payment_method, 40), paid_at = coalesce(p_paid_at, now()),
           starts_at = v_start, ends_at = v_end, updated_at = now()
     where id = x.id;
    perform public.write_audit('premium_passes', x.id::text, 'pass_paid', null, null, null,
      jsonb_build_object('payment', p_provider_payment_id, 'method', p_payment_method, 'amount_cents', p_amount_cents, 'until', v_end));
    perform public.notify(x.user_id, 'payment_approved', 'Pagamento confirmado',
      x.plan_name || ' liberado até ' || to_char((v_end - interval '1 second') at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '. Obrigado!',
      '/painel/plano', 'pass:' || x.id || ':paid');
    return jsonb_build_object('result', 'processed', 'detail', 'Período pago até ' || v_end::date);
  end if;

  if p_provider_status in ('refunded', 'charged_back') then
    if x.status = 'paid' then
      update public.premium_passes set status = 'refunded', provider_status = p_provider_status,
             ends_at = least(ends_at, now()), updated_at = now()
       where id = x.id;
      perform public.write_audit('premium_passes', x.id::text, 'pass_refunded', null, null, null, jsonb_build_object('status', p_provider_status));
    end if;
    return jsonb_build_object('result', 'processed', 'detail', 'Reembolsado');
  end if;

  if p_provider_status in ('rejected', 'cancelled') then
    if x.status = 'pending' then
      update public.premium_passes set status = 'failed', provider_status = p_provider_status, provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id), updated_at = now() where id = x.id;
      perform public.notify(x.user_id, 'payment_failed', 'Pagamento não concluído',
        'O pagamento do ' || x.plan_name || ' não foi aprovado. Você pode tentar de novo em Meu plano.',
        '/painel/plano', 'pass:' || x.id || ':failed');
    end if;
    return jsonb_build_object('result', 'processed', 'detail', 'Não aprovado');
  end if;

  -- pending, in_process, authorized: aguardando (Pix não pago ainda, boleto em compensação).
  update public.premium_passes set provider_status = p_provider_status, updated_at = now() where id = x.id and status = 'pending';
  return jsonb_build_object('result', 'processed', 'detail', 'Aguardando pagamento');
end;
$$;

-- Servidor: períodos pendentes para conferir (conciliação e retorno do checkout).
create or replace function public.billing_pass_targets(p_user uuid default null, p_limit int default 100)
returns table (id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select x.id from public.premium_passes x
   where (x.status = 'pending' or (x.status = 'expired' and x.updated_at > now() - interval '7 days'))
     and x.created_at > now() - interval '10 days'
     and (p_user is null or x.user_id = p_user)
   order by x.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

do $g$
declare f text;
begin
  foreach f in array array['billing_prepare_pass(uuid, text)', 'billing_attach_pass_checkout(uuid, text, text)',
    'billing_fail_pass_checkout(uuid)', 'billing_apply_pass_payment(uuid, text, text, int, timestamptz, text)',
    'billing_pass_targets(uuid, int)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $g$;

-- Usuário: histórico dos períodos pagos.
create or replace function public.get_my_passes()
returns table (id uuid, plan_name text, months int, price_cents int, status text, payment_method text,
               starts_at timestamptz, ends_at timestamptz, paid_at timestamptz, created_at timestamptz, checkout_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select x.id, x.plan_name, x.months, x.price_cents, x.status, x.payment_method, x.starts_at, x.ends_at, x.paid_at, x.created_at,
         case when x.status = 'pending' and x.created_at > now() - interval '1 day' then x.checkout_url end
    from public.premium_passes x
   where x.user_id = auth.uid() and (x.status in ('paid', 'refunded') or x.created_at > now() - interval '3 days')
   order by x.created_at desc limit 50;
$$;
revoke execute on function public.get_my_passes() from public, anon;
grant execute on function public.get_my_passes() to authenticated;

-- Admin: períodos pagos (para conferência e suporte).
create or replace function public.admin_list_passes(p_limit int default 100)
returns table (id uuid, user_name text, plan_name text, months int, price_cents int, status text, payment_method text,
               provider_payment_id text, environment text, starts_at timestamptz, ends_at timestamptz, paid_at timestamptz, created_at timestamptz)
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
    select x.id, p.full_name, x.plan_name, x.months, x.price_cents, x.status, x.payment_method, x.provider_payment_id,
           x.environment, x.starts_at, x.ends_at, x.paid_at, x.created_at
      from public.premium_passes x left join public.profiles p on p.id = x.user_id
     where x.status <> 'pending' or x.created_at > now() - interval '3 days'
     order by x.created_at desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
revoke execute on function public.admin_list_passes(int) from public, anon;
grant execute on function public.admin_list_passes(int) to authenticated;

-- Meu plano: até quando vai o Premium pago e o bônus.
create or replace function public.get_my_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.subscription_plans;
  g public.premium_grants;
  v_pass timestamptz;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  p := public.user_plan(v_uid);
  g := public.user_active_grant(v_uid);
  v_pass := public.user_pass_until(v_uid);
  return jsonb_build_object(
    'code', p.code, 'kind', p.kind, 'name', p.name, 'billing_period', p.billing_period,
    'max_motorcycles', coalesce(p.max_motorcycles, 1),
    'storage_quota_mb', coalesce(p.storage_quota_mb, 100),
    'motorcycles_used', (select count(*) from public.motorcycle_ownerships
                          where owner_user_id = v_uid and ended_at is null),
    'features', to_jsonb(coalesce(p.features, '{}')),
    'entitlements', to_jsonb(coalesce(p.entitlements, '{}')),
    'max_share_links', coalesce(p.max_share_links, 3),
    'bonus', g.id is not null,
    'bonus_until', g.expires_at,
    'paid_until', v_pass
  );
end;
$$;

-- Assinatura no cartão feita durante bônus ou período pago: 1ª cobrança só quando a cobertura acabar.
create or replace function public.billing_prepare_subscription(p_user uuid, p_plan_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.subscription_plans;
  g public.payment_gateway_settings;
  b public.premium_grants;
  v_email text;
  v_id uuid;
  v_expired jsonb;
  v_first timestamptz;
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

  b := public.user_active_grant(p_user);
  v_first := greatest(case when b.id is not null then b.expires_at end, public.user_pass_until(p_user));
  if v_first is not null and v_first <= now() + interval '1 day' then
    v_first := null;
  end if;

  with old as (
    update public.subscriptions set status = 'expired', cancel_reason = 'Nova tentativa de contratação'
     where user_id = p_user and status = 'pending'
     returning provider_subscription_id
  )
  select coalesce(jsonb_agg(provider_subscription_id) filter (where provider_subscription_id is not null), '[]'::jsonb)
    into v_expired from old;

  insert into public.subscriptions
    (user_id, plan_id, plan_code, plan_name, billing_period, price_cents, currency, max_motorcycles,
     storage_quota_mb, environment, provider_account_id, entitlements, max_share_links)
  values
    (p_user, p.id, p.code, p.name, p.billing_period, p.price_cents, p.currency, p.max_motorcycles,
     p.storage_quota_mb, g.environment, g.account_id, p.entitlements, p.max_share_links)
  returning id into v_id;

  return jsonb_build_object(
    'subscription_id', v_id, 'payer_email', v_email, 'plan_name', p.name,
    'billing_period', p.billing_period, 'price_cents', p.price_cents, 'currency', p.currency,
    'trial_days', case when v_first is null then p.trial_days else 0 end, 'expired_provider_ids', v_expired,
    'first_charge_at', v_first
  );
end;
$$;

-- Avisos diários (inclui vencimento do período pago).
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

  -- Bônus Premium (cortesia) perto do fim ou encerrado, para quem não assinou nem pagou período.
  for r in select g.id, g.user_id, g.expires_at,
                  case when g.expires_at <= now() then 'ended'
                       when g.expires_at <= now() + interval '1 day' then '1d' else '7d' end as stage
             from public.premium_grants g
            where g.revoked_at is null and g.expires_at is not null
              and g.expires_at between now() - interval '2 days' and now() + interval '7 days'
              and not exists (select 1 from public.subscriptions s
                               where s.user_id = g.user_id and s.status in ('pending', 'active', 'past_due', 'paused'))
              and coalesce(public.user_pass_until(g.user_id), '-infinity') <= g.expires_at
  loop
    perform public.notify(r.user_id, 'subscription_ending',
      case r.stage when 'ended' then 'Seu bônus Premium terminou' when '1d' then 'Seu bônus Premium termina amanhã' else 'Seu bônus Premium termina em 7 dias' end,
      case when r.stage = 'ended'
           then 'Sua conta voltou ao plano gratuito. Motos e histórico continuam com você. Assine para voltar ao Premium.'
           else 'O bônus termina em ' || to_char((r.expires_at - interval '1 second') at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
                || '. Assine agora para continuar: a primeira cobrança só acontece quando o bônus acabar.' end,
      '/painel/plano', 'grant:' || r.id || ':' || r.stage);
  end loop;

  -- Premium pago por período (Pix/débito/boleto): 30 dias (só 6+ meses), 15, 7, vence hoje e venceu.
  for r in
    select y.id, y.user_id, y.ends_at, y.months,
           case when y.ends_at <= now() then 'ended'
                when y.ends_at <= now() + interval '1 day' then '0d'
                when y.ends_at <= now() + interval '7 days' then '7d'
                when y.ends_at <= now() + interval '15 days' then '15d'
                else '30d' end as stage
      from (select distinct on (x.user_id) x.* from public.premium_passes x
             where x.status = 'paid' order by x.user_id, x.ends_at desc) y
     where y.ends_at between now() - interval '2 days' and now() + interval '30 days'
       and not exists (select 1 from public.subscriptions s
                        where s.user_id = y.user_id and s.status in ('pending', 'active', 'past_due', 'paused'))
  loop
    continue when r.stage = '30d' and r.months < 6;
    perform public.notify(r.user_id, 'subscription_ending',
      case r.stage when 'ended' then 'Seu Premium venceu'
                   when '0d' then 'Seu Premium vence hoje'
                   when '7d' then 'Seu Premium vence em 7 dias'
                   when '15d' then 'Seu Premium vence em 15 dias'
                   else 'Seu Premium vence em 30 dias' end,
      case when r.stage = 'ended'
           then 'Sua conta voltou ao plano gratuito. Motos, histórico e notas continuam com você. Renove por Pix em Meu plano para voltar ao Premium.'
           else 'Vence em ' || to_char((r.ends_at - interval '1 second') at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
                || '. Renove por Pix em Meu plano: o novo período começa quando o atual terminar, sem perder dias.' end,
      '/painel/plano', 'pass:' || r.id || ':' || r.stage);
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
