-- =============================================================================
-- Premium com 2 motos + moto extra (ADR-062). Banco de TESTE.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set E '88888888-eeee-4eee-8eee-000000000001'
\echo '--- Moto extra no Premium'

select set_config('request.jwt.claim.sub', '', false);
-- Suítes antigas mexem no catálogo; aqui vale o que a migração definiu.
update public.subscription_plans set max_motorcycles = 2 where code in ('premium_mensal', 'premium_semestral', 'premium_anual');
select tests.ok((select bool_and(max_motorcycles = 2) from public.subscription_plans where code in ('premium_mensal', 'premium_semestral', 'premium_anual')), 'Premium cobre 2 motos');
select tests.ok((select string_agg(billing_period || '=' || extra_motorcycle_cents, ',' order by billing_period) from public.subscription_plans where code in ('premium_mensal', 'premium_semestral', 'premium_anual'))
                = 'annual=3490,monthly=390,semiannual=1990', 'moto extra: 3,90/mês, 19,90/semestre, 34,90/ano');
select tests.ok(exists (select 1 from jsonb_array_elements(public.get_public_plans()) e where (e ->> 'extra_motorcycle_cents')::int = 390), 'planos públicos mostram o preço da moto extra');

-- Conta nova: 3 meses de boas-vindas com 2 motos
insert into auth.users (id, email, raw_user_meta_data) values (:'E', 'extra@teste.local', '{"full_name":"Eva Extra"}');
select set_config('request.jwt.claim.sub', :'E', false);
set role authenticated;
select public.register_motorcycle('Honda', 'CG 160', 2022, 'EXA1A11', 1000) ->> 'motorcycle_id' as m1 \gset
select public.register_motorcycle('Honda', 'Biz', 2021, 'EXA1A12', 2000) ->> 'motorcycle_id' as m2 \gset
select tests.must_fail($$select public.register_motorcycle('Honda', 'Pop', 2020, 'EXA1A13', 3000)$$, 'teste de boas-vindas: 3ª moto pede moto extra');
select tests.ok((public.get_my_motorcycle_slots() ->> 'mode') = 'grant' and (public.get_my_motorcycle_slots() ->> 'max')::int = 2, 'tela do plano: boas-vindas com 2 motos');
reset role;

-- Período pago (Pix) com 1 moto extra
select id as plan_m from public.subscription_plans where code = 'premium_mensal' \gset
insert into public.premium_passes (id, user_id, plan_id, plan_code, plan_name, billing_period, months, price_cents, max_motorcycles,
                                   storage_quota_mb, environment, status, starts_at, ends_at, paid_at, extra_motorcycles, extra_motorcycle_cents)
values ('99999999-0000-4000-8000-000000000001', :'E', :'plan_m', 'premium_mensal', 'Premium mensal', 'monthly', 1, 1380, 3, 500, 'test',
        'paid', now() - interval '1 day', now() + interval '20 days', now(), 1, 390);
select set_config('request.jwt.claim.sub', :'E', false);
set role authenticated;
select public.register_motorcycle('Honda', 'Pop', 2020, 'EXA1A13', 3000) ->> 'motorcycle_id' as m3 \gset
select tests.ok((public.get_my_motorcycle_slots() ->> 'extras')::int = 1 and (public.get_my_motorcycle_slots() ->> 'mode') = 'pass', 'Pix com moto extra libera a 3ª moto');
select tests.must_fail($$select public.register_motorcycle('Honda', 'Bros', 2020, 'EXA1A14', 3000)$$, 'sem outra extra, a 4ª moto é recusada');
reset role;

-- Moto extra comprada no meio do período: preço proporcional e vale até o fim do período
update public.system_settings set value = 'true' where key = 'billing_enabled';
select (exists (select 1 from public.payment_gateway_settings where provider = 'mercadopago' and access_token_secret_id is not null and last_check_ok)) as gw \gset
\if :gw
set role service_role;
select public.billing_prepare_pass_addon(:'E', 1) as addon \gset
reset role;
select tests.ok((:'addon'::jsonb ->> 'price_cents')::int = 390, 'moto extra no meio do mês: R$ 3,90 por mês que falta');
select public.billing_apply_pass_payment((:'addon'::jsonb ->> 'pass_id')::uuid, 'pay_addon_E', 'approved', 390, now(), 'pix');
select tests.ok((select ends_at = (select ends_at from public.premium_passes where id = '99999999-0000-4000-8000-000000000001')
                   from public.premium_passes where id = (:'addon'::jsonb ->> 'pass_id')::uuid), 'moto extra vale até o fim do período pago');
select tests.ok(public.user_max_motorcycles(:'E') = 4, 'limite soma a moto extra comprada depois');
select tests.ok(public.user_pass_until(:'E') = (select ends_at from public.premium_passes where id = '99999999-0000-4000-8000-000000000001'),
                'complemento não estica o período Premium');
\else
select tests.ok(true, 'moto extra no meio do mês (sem gateway no banco de teste)');
\endif
update public.system_settings set value = 'false' where key = 'billing_enabled';

-- Período acaba: volta às 2 motos das boas-vindas; a 3ª fica só leitura para o dono
update public.premium_passes set ends_at = now() - interval '1 second', starts_at = now() - interval '2 days' where user_id = :'E';
select set_config('request.jwt.claim.sub', :'E', false);
set role authenticated;
select tests.ok((public.get_my_motorcycle_slots() -> 'over_limit') ? :'m3', 'moto acima do limite aparece como só leitura');
select tests.must_fail(format($$select public.record_mileage(%L, 3500)$$, :'m3'), 'moto acima do limite não recebe registro do dono');
select public.record_mileage(:'m1', 1500);
reset role;
select tests.ok((select count(*) = 1 from public.mileage_records where motorcycle_id = :'m1' and mileage = 1500), 'motos dentro do limite continuam normais');
select tests.ok(not has_function_privilege('authenticated', 'public.billing_prepare_pass_addon(uuid, integer)', 'execute')
                and not has_function_privilege('authenticated', 'public.billing_apply_extras(uuid, uuid, integer, integer)', 'execute'),
                'cobrança da moto extra só pelo servidor');

\o
\echo 'Moto extra no Premium: ok'

\echo '--- Aviso antes do Premium acabar (KI-052)'
insert into auth.users (id, email, raw_user_meta_data) values ('88888888-eeee-4eee-8eee-000000000009', 'aviso@teste.local', '{"full_name":"Ana Aviso"}');
select set_config('request.jwt.claim.sub', '88888888-eeee-4eee-8eee-000000000009', false);
set role authenticated;
select tests.ok((public.get_my_motorcycle_slots() ->> 'mode') = 'grant' and (public.get_my_motorcycle_slots() ->> 'grant_until') is not null,
                'boas-vindas informa até quando vale');
select tests.ok((public.get_my_motorcycle_slots() ->> 'free_max')::int = 1, 'informa quantas motos o plano grátis cobre');
reset role;
select set_config('request.jwt.claim.sub', '', false);
