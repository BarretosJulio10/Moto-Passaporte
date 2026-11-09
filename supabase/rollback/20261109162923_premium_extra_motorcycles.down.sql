-- Desfaz 20261109162923_premium_extra_motorcycles (ADR-062). Volta o Premium a 3 motos.
do $$
declare t text;
begin
  foreach t in array array['maintenance_records', 'mileage_records', 'motorcycle_diary', 'owner_expenses', 'passport_shares', 'maintenance_reminders'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_over_limit', t);
  end loop;
end;
$$;
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.user_plan(uuid)'::regprocedure);
  execute replace(v_def, 'p.max_motorcycles := x.max_motorcycles + public.pass_addon_extras(x.id);', 'p.max_motorcycles := x.max_motorcycles;');
  v_def := pg_get_functiondef('public.billing_apply_pass_payment(uuid, text, text, integer, timestamp with time zone, text)'::regprocedure);
  v_def := regexp_replace(v_def, E'if x.addon_for is not null then.*?else\n      (v_start := greatest.*?;)\n      (v_end := v_start.*?;)\n    end if;', E'\\1\n    \\2', 's');
  execute v_def;
  v_def := pg_get_functiondef('public.get_public_plans()'::regprocedure);
  execute replace(v_def, ' ''extra_motorcycle_cents'', extra_motorcycle_cents,', '');
end;
$$;
drop function if exists public.admin_set_plan_extra_price(uuid, int, text);
drop function if exists public.get_my_motorcycle_slots();
drop function if exists public.block_over_limit_owner_write();
drop function if exists public.motorcycle_over_limit(uuid);
drop function if exists public.billing_apply_extras(uuid, uuid, int, int);
drop function if exists public.billing_prepare_extras(uuid, int);
drop function if exists public.billing_prepare_pass_addon(uuid, int);
drop function if exists public.billing_prepare_pass_v2(uuid, text, int);
drop function if exists public.billing_prepare_subscription_v2(uuid, text, int);
create or replace function public.user_active_pass(p_user uuid)
returns public.premium_passes language sql stable security definer set search_path = '' as $$
  select x.* from public.premium_passes x
   where x.user_id = p_user and x.status = 'paid' and x.starts_at <= now() and x.ends_at > now()
   order by x.ends_at desc limit 1;
$$;
create or replace function public.user_pass_until(p_user uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select max(x.ends_at) from public.premium_passes x where x.user_id = p_user and x.status = 'paid' and x.ends_at > now();
$$;
drop function if exists public.pass_addon_extras(uuid);
update public.subscription_plans set max_motorcycles = 3 where kind = 'premium';
-- Colunas novas ficam (dados de cobrança já gravados não são apagados).
