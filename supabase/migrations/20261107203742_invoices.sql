-- =============================================================================
-- Fase 5.3 — Faturas por ciclo e recibo (PRD 8.6, 7.4; ADR-022)
-- - invoices: um registro por ciclo de cobrança (período, valor, vencimento, estado),
--   ligado ao pagamento que o quitou. Número sequencial legível (MP-AAAA-000001).
-- - billing_apply_payment passa a manter as faturas; assinatura cancelada/encerrada
--   cancela faturas em aberto (gatilho).
-- - Recibo do usuário: comprovante interno, sem valor fiscal.
-- Rollback: restaurar billing_apply_payment da migração subscriptions; remover
--   gatilho, funções, tabela e sequência desta migração.
-- =============================================================================

create sequence public.invoice_number_seq;

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  number          text not null unique,
  subscription_id uuid not null references public.subscriptions (id) on delete restrict,
  user_id         uuid references auth.users (id) on delete set null,
  payment_id      uuid references public.payments (id) on delete restrict,
  period_start    timestamptz not null,
  period_end      timestamptz not null check (period_end > period_start),
  amount_cents    int  not null check (amount_cents >= 0),
  currency        text not null default 'BRL',
  due_date        date not null,
  status          text not null default 'open'
                  check (status in ('open', 'failed', 'paid', 'refunded', 'charged_back', 'canceled')),
  attempts        int  not null default 0,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.invoices is
  'Faturas por ciclo (PRD 8.6): período de referência, valor, vencimento e estado. Mudam só pelas funções de cobrança.';

create index invoices_subscription_idx on public.invoices (subscription_id, period_start);
create index invoices_user_idx on public.invoices (user_id, period_start desc);
create index invoices_payment_idx on public.invoices (payment_id);

create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();
create trigger invoices_audit after insert or update or delete on public.invoices
  for each row execute function public.audit_row_change('', '');
create trigger invoices_no_delete before delete on public.invoices
  for each row execute function public.prevent_billing_delete();

alter table public.invoices enable row level security;
revoke all on public.invoices from anon, authenticated;

create or replace function public.next_invoice_number()
returns text
language sql
security definer
set search_path = ''
as $$
  select 'MP-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
$$;

revoke execute on function public.next_invoice_number() from public, anon, authenticated;

-- Assinatura cancelada ou encerrada: faturas ainda não pagas são canceladas.
create or replace function public.cancel_open_invoices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('canceled', 'expired', 'rejected') and old.status is distinct from new.status then
    update public.invoices set status = 'canceled'
     where subscription_id = new.id and status in ('open', 'failed');
  end if;
  return null;
end;
$$;

revoke execute on function public.cancel_open_invoices() from public, anon, authenticated;

create trigger subscriptions_cancel_invoices after update of status on public.subscriptions
  for each row execute function public.cancel_open_invoices();

-- Pagamentos e faturas (PRD 8.4, 8.6). Mantém a lógica de período da migração anterior.
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
  inv public.invoices;
  v_status text;
  v_months int;
  v_base timestamptz;
  v_end timestamptz;
  v_prev text;
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

  select status into v_prev from public.payments where provider = 'mercadopago' and provider_payment_id = p_provider_payment_id;

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
    v_end := v_base + make_interval(months => v_months);
    update public.payments set period_granted = true where id = pay.id;
    update public.subscriptions set
      current_period_end = v_end,
      started_at = coalesce(started_at, now()),
      status = case when status in ('pending', 'past_due', 'rejected', 'expired') then 'active' else status end,
      past_due_since = null,
      last_synced_at = now()
    where id = s.id;

    -- Fatura do ciclo: a mais antiga em aberto é quitada; se não houver, cria já paga.
    select * into inv from public.invoices
     where subscription_id = s.id and status in ('open', 'failed')
     order by period_start limit 1 for update;
    if inv.id is not null then
      update public.invoices set status = 'paid', payment_id = pay.id, paid_at = pay.paid_at,
             period_start = v_base, period_end = v_end, amount_cents = pay.amount_cents
       where id = inv.id;
    else
      insert into public.invoices (number, subscription_id, user_id, payment_id, period_start, period_end, amount_cents, currency,
                                   due_date, status, paid_at)
      values (public.next_invoice_number(), s.id, s.user_id, pay.id, v_base, v_end, pay.amount_cents, s.currency,
              (v_base at time zone 'America/Sao_Paulo')::date, 'paid', pay.paid_at);
    end if;
    -- Próximo ciclo esperado (assinatura que continua renovando).
    if s.status not in ('canceled', 'expired') and not exists (
         select 1 from public.invoices where subscription_id = s.id and status in ('open', 'failed')) then
      insert into public.invoices (number, subscription_id, user_id, period_start, period_end, amount_cents, currency, due_date)
      values (public.next_invoice_number(), s.id, s.user_id, v_end, v_end + make_interval(months => v_months), s.price_cents,
              s.currency, (v_end at time zone 'America/Sao_Paulo')::date);
    end if;

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
    -- Tentativa falha registrada na fatura em aberto (cada pagamento conta uma vez).
    if v_prev is distinct from v_status then
      update public.invoices set status = 'failed', attempts = attempts + 1
       where id = (select id from public.invoices where subscription_id = s.id and status in ('open', 'failed')
                    order by period_start limit 1);
    end if;

  elsif v_status in ('refunded', 'charged_back') and pay.period_granted then
    -- Política provisória (P-4): reembolso ou contestação encerram o Premium na hora.
    update public.subscriptions set
      current_period_end = least(coalesce(current_period_end, now()), now()),
      last_synced_at = now()
    where id = s.id;
    update public.invoices set status = v_status where payment_id = pay.id and status = 'paid';
  end if;

  return jsonb_build_object('result', 'processed', 'subscription_id', s.id, 'payment_status', v_status);
end;
$$;

revoke execute on function public.billing_apply_payment(text, text, text, text, int, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_apply_payment(text, text, text, text, int, timestamptz) to service_role;

-- Leitura do usuário
create or replace function public.get_my_invoices()
returns table (id uuid, number text, plan_name text, period_start timestamptz, period_end timestamptz, amount_cents int,
               currency text, due_date date, status text, attempts int, paid_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.number, s.plan_name, i.period_start, i.period_end, i.amount_cents, i.currency, i.due_date, i.status, i.attempts, i.paid_at
    from public.invoices i
    join public.subscriptions s on s.id = i.subscription_id
   where i.user_id = auth.uid()
   order by i.period_start desc
   limit 100;
$$;

revoke execute on function public.get_my_invoices() from public, anon;
grant execute on function public.get_my_invoices() to authenticated;

-- Recibo de uma fatura paga do próprio usuário (sem valor fiscal).
create or replace function public.get_invoice_receipt(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i public.invoices;
  s public.subscriptions;
  p public.payments;
begin
  select * into i from public.invoices where id = p_invoice_id and user_id = auth.uid();
  if not found then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if i.status not in ('paid', 'refunded', 'charged_back') then
    raise exception 'Esta fatura ainda não foi paga.' using errcode = 'P0001';
  end if;
  select * into s from public.subscriptions where id = i.subscription_id;
  select * into p from public.payments where id = i.payment_id;
  return jsonb_build_object(
    'number', i.number, 'status', i.status, 'plan_name', s.plan_name, 'billing_period', s.billing_period,
    'period_start', i.period_start, 'period_end', i.period_end, 'amount_cents', i.amount_cents, 'currency', i.currency,
    'paid_at', i.paid_at, 'environment', s.environment,
    'payment_reference', case when p.provider_payment_id is not null then p.provider_payment_id end,
    'customer_name', (select full_name from public.profiles where id = auth.uid()),
    'customer_email', public.current_user_email()
  );
end;
$$;

revoke execute on function public.get_invoice_receipt(uuid) from public, anon;
grant execute on function public.get_invoice_receipt(uuid) to authenticated;

-- Admin investiga faturas (sem editar).
create or replace function public.admin_list_invoices(p_limit int default 100)
returns table (id uuid, number text, user_name text, plan_name text, period_start timestamptz, period_end timestamptz,
               amount_cents int, due_date date, status text, attempts int, paid_at timestamptz, environment text)
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
    select i.id, i.number, coalesce(pr.full_name, 'Conta removida'), s.plan_name, i.period_start, i.period_end,
           i.amount_cents, i.due_date, i.status, i.attempts, i.paid_at, s.environment
      from public.invoices i
      join public.subscriptions s on s.id = i.subscription_id
      left join public.profiles pr on pr.id = i.user_id
     order by i.created_at desc
     limit least(greatest(p_limit, 1), 500);
end;
$$;

revoke execute on function public.admin_list_invoices(int) from public, anon;
grant execute on function public.admin_list_invoices(int) to authenticated;
