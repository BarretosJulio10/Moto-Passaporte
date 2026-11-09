-- =============================================================================
-- Premium com 2 motos + moto extra (ADR-062).
-- Premium cobre 2 motos; cada moto extra: R$ 3,90/mês, R$ 19,90/semestre, R$ 34,90/ano.
-- Assinatura (cartão) e período pago (Pix) guardam a quantidade de motos extras e o
-- valor no momento da compra. Quem já assina mantém o que contratou (até renovar).
-- Moto acima do limite do plano fica só para leitura para o dono.
-- =============================================================================

alter table public.subscription_plans
  add column if not exists extra_motorcycle_cents int not null default 0 check (extra_motorcycle_cents between 0 and 100000);
update public.subscription_plans set max_motorcycles = 2,
       extra_motorcycle_cents = case billing_period when 'monthly' then 390 when 'semiannual' then 1990 when 'annual' then 3490 else 0 end
 where kind = 'premium';
update public.subscription_plans
   set features = array_replace(features, 'Mais motos e mais espaço para anexos', '2 motos incluídas (moto extra a partir de R$ 3,90) e mais espaço para anexos')
 where kind = 'premium';

alter table public.subscriptions
  add column if not exists base_max_motorcycles int,
  add column if not exists base_price_cents int,
  add column if not exists extra_motorcycles int not null default 0 check (extra_motorcycles between 0 and 50),
  add column if not exists extra_motorcycle_cents int not null default 0;
update public.subscriptions set base_max_motorcycles = max_motorcycles, base_price_cents = price_cents where base_max_motorcycles is null;

alter table public.premium_passes
  add column if not exists extra_motorcycles int not null default 0 check (extra_motorcycles between 0 and 50),
  add column if not exists extra_motorcycle_cents int not null default 0,
  add column if not exists addon_for uuid references public.premium_passes (id) on delete restrict;
create index if not exists premium_passes_addon_idx on public.premium_passes (addon_for) where addon_for is not null;

-- Período principal (o complemento de moto extra não conta como período).
create or replace function public.user_active_pass(p_user uuid)
returns public.premium_passes
language sql
stable
security definer
set search_path = ''
as $$
  select x.* from public.premium_passes x
   where x.user_id = p_user and x.status = 'paid' and x.addon_for is null and x.starts_at <= now() and x.ends_at > now()
   order by x.ends_at desc limit 1;
$$;
create or replace function public.user_pass_until(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(x.ends_at) from public.premium_passes x
   where x.user_id = p_user and x.status = 'paid' and x.addon_for is null and x.ends_at > now();
$$;
revoke execute on function public.user_active_pass(uuid) from public, anon, authenticated;
revoke execute on function public.user_pass_until(uuid) from public, anon, authenticated;

create or replace function public.pass_addon_extras(p_pass uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(a.extra_motorcycles), 0)::int from public.premium_passes a
   where a.addon_for = p_pass and a.status = 'paid' and a.starts_at <= now() and a.ends_at > now();
$$;
revoke execute on function public.pass_addon_extras(uuid) from public, anon, authenticated;

-- Limite do período pago soma as motos extras compradas depois.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.user_plan(uuid)'::regprocedure);
  if position('p.max_motorcycles := x.max_motorcycles;' in v_def) = 0 then
    raise exception 'user_plan mudou; revisar o patch';
  end if;
  v_def := replace(v_def, 'p.max_motorcycles := x.max_motorcycles;',
                          'p.max_motorcycles := x.max_motorcycles + public.pass_addon_extras(x.id);');
  execute v_def;

  -- Complemento pago vale do pagamento até o fim do período principal.
  v_def := pg_get_functiondef('public.billing_apply_pass_payment(uuid, text, text, integer, timestamp with time zone, text)'::regprocedure);
  if position('v_start := greatest(now(), coalesce(public.user_pass_until(x.user_id), now()));' in v_def) = 0 then
    raise exception 'billing_apply_pass_payment mudou; revisar o patch';
  end if;
  v_def := replace(v_def, 'v_start := greatest(now(), coalesce(public.user_pass_until(x.user_id), now()));
    v_end := v_start + make_interval(months => x.months);',
    'if x.addon_for is not null then
      v_start := now();
      v_end := greatest(coalesce((select ends_at from public.premium_passes where id = x.addon_for and status = ''paid''), now()), now() + interval ''1 day'');
    else
      v_start := greatest(now(), coalesce(public.user_pass_until(x.user_id), now()));
      v_end := v_start + make_interval(months => x.months);
    end if;');
  execute v_def;
end;
$$;

-- Contratar com motos extras (cartão): usa a contratação de sempre e acrescenta as extras.
create or replace function public.billing_prepare_subscription_v2(p_user uuid, p_plan_code text, p_extra int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare r jsonb;
        p public.subscription_plans;
        v_extra int := coalesce(p_extra, 0);
        v_price int;
begin
  if v_extra < 0 or v_extra > 50 then raise exception 'Quantidade de motos extras inválida.' using errcode = '22023'; end if;
  r := public.billing_prepare_subscription(p_user, p_plan_code);
  select * into p from public.subscription_plans where code = p_plan_code;
  update public.subscriptions
     set base_max_motorcycles = max_motorcycles, base_price_cents = price_cents,
         extra_motorcycles = v_extra, extra_motorcycle_cents = p.extra_motorcycle_cents,
         max_motorcycles = max_motorcycles + v_extra, price_cents = price_cents + v_extra * p.extra_motorcycle_cents
   where id = (r ->> 'subscription_id')::uuid
  returning price_cents into v_price;
  return r || jsonb_build_object('price_cents', v_price, 'extra_motorcycles', v_extra);
end;
$$;
revoke execute on function public.billing_prepare_subscription_v2(uuid, text, int) from public, anon, authenticated;
grant execute on function public.billing_prepare_subscription_v2(uuid, text, int) to service_role;

-- Pagar à vista com motos extras (Pix).
create or replace function public.billing_prepare_pass_v2(p_user uuid, p_plan_code text, p_extra int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare r jsonb;
        p public.subscription_plans;
        v_extra int := coalesce(p_extra, 0);
        v_price int;
begin
  if v_extra < 0 or v_extra > 50 then raise exception 'Quantidade de motos extras inválida.' using errcode = '22023'; end if;
  r := public.billing_prepare_pass(p_user, p_plan_code);
  select * into p from public.subscription_plans where code = p_plan_code;
  update public.premium_passes
     set extra_motorcycles = v_extra, extra_motorcycle_cents = p.extra_motorcycle_cents,
         max_motorcycles = max_motorcycles + v_extra, price_cents = price_cents + v_extra * p.extra_motorcycle_cents
   where id = (r ->> 'pass_id')::uuid
  returning price_cents into v_price;
  return r || jsonb_build_object('price_cents', v_price, 'extra_motorcycles', v_extra);
end;
$$;
revoke execute on function public.billing_prepare_pass_v2(uuid, text, int) from public, anon, authenticated;
grant execute on function public.billing_prepare_pass_v2(uuid, text, int) to service_role;

-- Moto extra no meio de um período pago (Pix): R$ 3,90 por moto por mês que falta (arredonda para cima).
create or replace function public.billing_prepare_pass_addon(p_user uuid, p_extra int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare x public.premium_passes;
        v_monthly int;
        v_months int;
        v_id uuid;
        v_email text;
        g public.payment_gateway_settings;
begin
  if coalesce(p_extra, 0) < 1 or p_extra > 50 then raise exception 'Escolha quantas motos incluir.' using errcode = '22023'; end if;
  if coalesce((select (value #>> '{}')::boolean from public.system_settings where key = 'billing_enabled'), false) is not true then
    raise exception 'A contratação ainda não está disponível.' using errcode = 'P0001';
  end if;
  x := public.user_active_pass(p_user);
  if x.id is null then raise exception 'Você não tem um período Premium pago ativo.' using errcode = 'P0001'; end if;
  select lower(email) into v_email from auth.users where id = p_user;
  select extra_motorcycle_cents into v_monthly from public.subscription_plans where kind = 'premium' and billing_period = 'monthly' and is_active order by price_cents limit 1;
  if coalesce(v_monthly, 0) <= 0 then raise exception 'Moto extra indisponível no momento.' using errcode = 'P0001'; end if;
  v_months := greatest(1, ceil(extract(epoch from (x.ends_at - now())) / (30 * 86400.0))::int);
  select * into g from public.payment_gateway_settings where provider = 'mercadopago';
  if g.access_token_secret_id is null or g.last_check_ok is not true then
    raise exception 'Pagamentos indisponíveis no momento.' using errcode = 'P0001';
  end if;
  update public.premium_passes set status = 'expired', updated_at = now()
   where user_id = p_user and addon_for is not null and status = 'pending' and created_at < now() - interval '3 days';
  insert into public.premium_passes
    (user_id, plan_id, plan_code, plan_name, billing_period, months, price_cents, currency, max_motorcycles, storage_quota_mb,
     entitlements, max_share_links, environment, extra_motorcycles, extra_motorcycle_cents, addon_for)
  values (p_user, x.plan_id, x.plan_code, 'Moto extra no ' || x.plan_name, x.billing_period, 1, p_extra * v_monthly * v_months, x.currency,
          0, 0, '{}', x.max_share_links, g.environment, p_extra, v_monthly, x.id)
  returning id into v_id;
  return jsonb_build_object('pass_id', v_id, 'payer_email', v_email, 'plan_name', 'Moto extra (' || p_extra || ') até ' ||
                            to_char((x.ends_at - interval '1 second') at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
                            'months', 1, 'price_cents', p_extra * v_monthly * v_months, 'currency', x.currency);
end;
$$;
revoke execute on function public.billing_prepare_pass_addon(uuid, int) from public, anon, authenticated;
grant execute on function public.billing_prepare_pass_addon(uuid, int) to service_role;

-- Mudar a quantidade de motos extras de uma assinatura ativa (o valor muda na próxima cobrança).
create or replace function public.billing_prepare_extras(p_user uuid, p_extra int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare s public.subscriptions;
        v_cents int;
begin
  if coalesce(p_extra, -1) < 0 or p_extra > 50 then raise exception 'Quantidade de motos extras inválida.' using errcode = '22023'; end if;
  select * into s from public.subscriptions where user_id = p_user and status = 'active' order by created_at desc limit 1;
  if not found or s.provider_subscription_id is null then
    raise exception 'Você não tem assinatura ativa no cartão.' using errcode = 'P0001';
  end if;
  v_cents := case when s.extra_motorcycle_cents > 0 then s.extra_motorcycle_cents
                  else (select extra_motorcycle_cents from public.subscription_plans where id = s.plan_id) end;
  if coalesce(v_cents, 0) <= 0 then raise exception 'Moto extra indisponível neste plano.' using errcode = 'P0001'; end if;
  return jsonb_build_object('subscription_id', s.id, 'provider_subscription_id', s.provider_subscription_id,
                            'currency', s.currency, 'extra_motorcycle_cents', v_cents,
                            'price_cents', coalesce(s.base_price_cents, s.price_cents - s.extra_motorcycles * s.extra_motorcycle_cents) + p_extra * v_cents);
end;
$$;
revoke execute on function public.billing_prepare_extras(uuid, int) from public, anon, authenticated;
grant execute on function public.billing_prepare_extras(uuid, int) to service_role;

create or replace function public.billing_apply_extras(p_user uuid, p_subscription uuid, p_extra int, p_cents int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare s public.subscriptions;
begin
  select * into s from public.subscriptions where id = p_subscription and user_id = p_user and status = 'active' for update;
  if not found then raise exception 'Assinatura não encontrada.' using errcode = 'P0002'; end if;
  update public.subscriptions
     set base_max_motorcycles = coalesce(base_max_motorcycles, max_motorcycles - extra_motorcycles),
         base_price_cents = coalesce(base_price_cents, price_cents - extra_motorcycles * extra_motorcycle_cents),
         extra_motorcycle_cents = p_cents, extra_motorcycles = p_extra
   where id = s.id;
  update public.subscriptions
     set max_motorcycles = base_max_motorcycles + p_extra, price_cents = base_price_cents + p_extra * p_cents
   where id = s.id;
  perform public.write_audit('subscriptions', s.id::text, 'extra_motorcycles', null, null, null,
    jsonb_build_object('from', s.extra_motorcycles, 'to', p_extra));
end;
$$;
revoke execute on function public.billing_apply_extras(uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.billing_apply_extras(uuid, uuid, int, int) to service_role;

-- -----------------------------------------------------------------------------
-- Moto acima do limite: só leitura para o dono (as mais antigas ficam liberadas).
-- -----------------------------------------------------------------------------
create or replace function public.motorcycle_over_limit(p_moto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select o.motorcycle_id, o.owner_user_id,
           row_number() over (partition by o.owner_user_id order by o.started_at, o.motorcycle_id) as n
      from public.motorcycle_ownerships o
     where o.ended_at is null
       and o.owner_user_id = (select owner_user_id from public.motorcycle_ownerships where motorcycle_id = p_moto and ended_at is null limit 1)
  )
  select coalesce((select n > public.user_max_motorcycles(owner_user_id) from mine where motorcycle_id = p_moto), false);
$$;
revoke execute on function public.motorcycle_over_limit(uuid) from public, anon, authenticated;

create or replace function public.block_over_limit_owner_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.motorcycle_id is not null and auth.uid() is not null
     and exists (select 1 from public.motorcycle_ownerships where motorcycle_id = new.motorcycle_id and ended_at is null and owner_user_id = auth.uid())
     and public.motorcycle_over_limit(new.motorcycle_id) then
    raise exception 'Esta moto passou do limite do seu plano e está só para leitura. Inclua uma moto extra em Meu plano para voltar a registrar.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.block_over_limit_owner_write() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['maintenance_records', 'mileage_records', 'motorcycle_diary', 'owner_expenses', 'passport_shares', 'maintenance_reminders'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_over_limit', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.block_over_limit_owner_write()', t || '_over_limit', t);
  end loop;
end;
$$;

-- Tela "Meu plano": motos extras, valores e motos só leitura.
create or replace function public.get_my_motorcycle_slots()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
        s public.subscriptions;
        x public.premium_passes;
        v_mode text;
        v_extras int := 0;
        v_cents int := 0;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  s := public.user_active_subscription(v_uid);
  x := public.user_active_pass(v_uid);
  if s.id is not null then
    v_mode := 'subscription'; v_extras := s.extra_motorcycles;
    v_cents := case when s.extra_motorcycle_cents > 0 then s.extra_motorcycle_cents else (select extra_motorcycle_cents from public.subscription_plans where id = s.plan_id) end;
  elsif x.id is not null then
    v_mode := 'pass'; v_extras := x.extra_motorcycles + public.pass_addon_extras(x.id);
    v_cents := (select extra_motorcycle_cents from public.subscription_plans where kind = 'premium' and billing_period = 'monthly' and is_active order by price_cents limit 1);
  elsif (public.user_active_grant(v_uid)).id is not null then
    v_mode := 'grant';
  else
    v_mode := 'free';
  end if;
  return jsonb_build_object(
    'mode', v_mode,
    'max', public.user_max_motorcycles(v_uid),
    'used', (select count(*) from public.motorcycle_ownerships where owner_user_id = v_uid and ended_at is null),
    'extras', v_extras,
    'extra_cents', v_cents,
    'billing_period', coalesce(s.billing_period, x.billing_period),
    'pass_until', case when x.id is not null then x.ends_at end,
    'pass_months_left', case when x.id is not null then greatest(1, ceil(extract(epoch from (x.ends_at - now())) / (30 * 86400.0))::int) end,
    'over_limit', coalesce((select jsonb_agg(o.motorcycle_id) from public.motorcycle_ownerships o
                             where o.owner_user_id = v_uid and o.ended_at is null and public.motorcycle_over_limit(o.motorcycle_id)), '[]'::jsonb));
end;
$$;
revoke execute on function public.get_my_motorcycle_slots() from public, anon;
grant execute on function public.get_my_motorcycle_slots() to authenticated;

-- Planos públicos mostram o preço da moto extra.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.get_public_plans()'::regprocedure);
  if position('''price_note'', price_note, ''max_motorcycles'', max_motorcycles,' in v_def) = 0 then
    raise exception 'get_public_plans mudou; revisar o patch';
  end if;
  v_def := replace(v_def, '''price_note'', price_note, ''max_motorcycles'', max_motorcycles,',
                          '''price_note'', price_note, ''max_motorcycles'', max_motorcycles, ''extra_motorcycle_cents'', extra_motorcycle_cents,');
  execute v_def;
end;
$$;

-- Admin: preço da moto extra por plano (com motivo e auditoria).
create or replace function public.admin_set_plan_extra_price(p_id uuid, p_cents int, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_old int;
begin
  perform public.require_admin_reason(p_reason);
  if p_cents is null or p_cents < 0 or p_cents > 100000 then raise exception 'Valor inválido.' using errcode = '22023'; end if;
  select extra_motorcycle_cents into v_old from public.subscription_plans where id = p_id for update;
  if not found then raise exception 'Plano não encontrado.' using errcode = 'P0002'; end if;
  update public.subscription_plans set extra_motorcycle_cents = p_cents where id = p_id;
  perform public.write_audit('subscription_plans', p_id::text, 'extra_motorcycle_price', null, null,
    jsonb_build_object('extra_motorcycle_cents', v_old), jsonb_build_object('extra_motorcycle_cents', p_cents, 'reason', btrim(p_reason)));
end;
$$;
revoke execute on function public.admin_set_plan_extra_price(uuid, int, text) from public, anon;
grant execute on function public.admin_set_plan_extra_price(uuid, int, text) to authenticated;
