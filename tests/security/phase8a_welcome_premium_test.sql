-- =============================================================================
-- Premium de boas-vindas no cadastro (ADR-049) — banco de TESTE, depois das demais suítes.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set N1 '66666666-6666-6666-6666-666666666661'
\set N2 '66666666-6666-6666-6666-666666666662'
\set N3 '66666666-6666-6666-6666-666666666663'

\echo '--- Premium de boas-vindas'
select set_config('request.jwt.claim.sub', '', false);
update public.system_settings set value = '90'::jsonb where key = 'welcome_premium_days';
insert into auth.users (id, email, raw_user_meta_data) values
  (:'N1', 'nova1@teste.local', '{"full_name":"Nova Um","terms_accepted":true,"terms_version":"1.0","privacy_version":"1.0"}');

select tests.ok((select count(*) = 1 from public.premium_grants where user_id = :'N1' and source = 'welcome' and revoked_at is null
                   and expires_at between now() + interval '90 days' and now() + interval '92 days'), 'conta nova recebe 90 dias de Premium');
select tests.ok((public.user_plan(:'N1')).kind = 'premium' and (public.user_plan(:'N1')).name = 'Premium (boas-vindas)', 'plano vigente é Premium (boas-vindas)');
select tests.ok((public.user_plan(:'N1')).max_motorcycles > 1, 'limites Premium valem durante o bônus');
select tests.ok(exists (select 1 from public.notifications where user_id = :'N1' and dedupe_key = 'welcome:' || :'N1'), 'aviso de boas-vindas com a data final');

select set_config('request.jwt.claim.sub', :'N1', false);
set role authenticated;
select tests.ok((public.get_my_plan() ->> 'bonus')::boolean and public.get_my_plan() ->> 'bonus_source' = 'welcome', 'tela do plano sabe que é o bônus de boas-vindas');
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- Uma vez por conta
select tests.ok(public.grant_welcome_premium(:'N1') is null, 'bônus não se repete na mesma conta');

-- No fim do prazo volta ao gratuito sem apagar nada
update public.premium_grants set starts_at = now() - interval '91 days', expires_at = now() - interval '1 minute' where user_id = :'N1';
select tests.ok((public.user_plan(:'N1')).kind = 'free', 'depois do prazo a conta volta ao gratuito');
select tests.ok(public.grant_welcome_premium(:'N1') is null, 'bônus vencido não é renovado');

-- Configuração 0 desliga
update public.system_settings set value = '0'::jsonb where key = 'welcome_premium_days';
insert into auth.users (id, email, raw_user_meta_data) values
  (:'N2', 'nova2@teste.local', '{"full_name":"Nova Dois","terms_accepted":true,"terms_version":"1.0","privacy_version":"1.0"}');
select tests.ok(not exists (select 1 from public.premium_grants where user_id = :'N2'), 'com 0 dias não há bônus');

-- Sem plano Premium ativo, o cadastro continua funcionando
update public.system_settings set value = '90'::jsonb where key = 'welcome_premium_days';
update public.subscription_plans set is_active = false where kind = 'premium';
insert into auth.users (id, email, raw_user_meta_data) values
  (:'N3', 'nova3@teste.local', '{"full_name":"Nova Três","terms_accepted":true,"terms_version":"1.0","privacy_version":"1.0"}');
select tests.ok(exists (select 1 from public.profiles where id = :'N3') and not exists (select 1 from public.premium_grants where user_id = :'N3'),
                'sem Premium ativo o cadastro segue, só sem bônus');
update public.subscription_plans set is_active = true where kind = 'premium';

set role anon;
select tests.must_fail($$select public.grant_welcome_premium('66666666-6666-6666-6666-666666666663')$$, 'ninguém dá o bônus a si mesmo pela API');
reset role;
set role authenticated;
select tests.must_fail($$select public.grant_welcome_premium('66666666-6666-6666-6666-666666666663')$$, 'usuário logado também não');
reset role;

\o
\echo '=== TODOS OS TESTES DO PREMIUM DE BOAS-VINDAS PASSARAM ==='
