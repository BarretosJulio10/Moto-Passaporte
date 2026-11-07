-- =============================================================================
-- Testes da Fase 5.1 — planos e preços configuráveis (banco de TESTE; após phase4b)
-- A e B: proprietários; D: administrador.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 5.1: planos'
select set_config('request.jwt.claim.sub', '', false);

-- Leitura pública
set role anon;
select public.get_public_plans() as pub \gset
select tests.ok(jsonb_array_length(:'pub'::jsonb) = 4, 'site mostra os 4 planos iniciais');
select tests.ok((:'pub'::jsonb -> 0 ->> 'code') = 'gratuito', 'gratuito aparece primeiro');
select tests.ok(:'pub' !~ '"id"|updated_by|"version"|is_active|sort_order', 'lista pública sem campos internos');
select tests.ok((select (value #>> '{}') = 'false' from public.system_settings where key = 'billing_enabled'), 'contratação desligada até o Mercado Pago (configuração pública)');
select tests.must_fail($$select * from public.subscription_plans$$, 'anônimo não lê a tabela');
select tests.must_fail($$select public.admin_list_plans()$$, 'anônimo não administra');
reset role;

-- Usuário comum
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail($$select * from public.subscription_plans$$, 'usuário não lê a tabela');
select tests.must_fail($$select * from public.subscription_plan_versions$$, 'usuário não lê o histórico');
select tests.must_fail($$select public.admin_list_plans()$$, 'usuário não lista planos internos');
select tests.must_fail($$select public.admin_save_plan(null,'hack','premium','monthly','Hack',null,100,null,9,999,null,0,null,true,1)$$, 'usuário não cria plano');
select tests.must_fail($$select public.admin_set_plan_active((select id from public.subscription_plans limit 1), false)$$, 'usuário não desativa plano');
select public.get_my_plan() as mine \gset
select tests.ok((:'mine'::jsonb ->> 'kind') = 'free' and (:'mine'::jsonb ->> 'max_motorcycles')::int = 1
                and (:'mine'::jsonb ->> 'motorcycles_used')::int >= 1, 'usuário vê seu plano, limite e uso');
reset role;
select id as mensal from public.subscription_plans where code = 'premium_mensal' \gset
select id as anual from public.subscription_plans where code = 'premium_anual' \gset
select id as free from public.subscription_plans where code = 'gratuito' \gset

-- Administrador
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((select count(*) = 4 from public.admin_list_plans()), 'admin lista os planos');
select public.admin_save_plan(:'mensal', null, null, null, 'Premium mensal', 'Novo texto', 1290, null, 3, 500,
  array['Mais espaço', '  ', 'Relatórios em PDF'], 7, 'Cancele quando quiser.', true, 20);
reset role;
select tests.ok((select price_cents = 1290 and version = 2 and features = array['Mais espaço', 'Relatórios em PDF']
                 and trial_days = 7 and updated_by = :'D' from public.subscription_plans where id = :'mensal'),
                'admin altera preço, textos e benefícios (vazios descartados); versão sobe');
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((select count(*) = 2 and bool_or(version = 2 and (snapshot ->> 'price_cents')::int = 1290)
                        and bool_or(version = 1 and (snapshot ->> 'price_cents')::int = 990)
                 from public.admin_get_plan_history(:'mensal')), 'histórico guarda as duas versões (antes e depois)');
select tests.must_fail(format($$select public.admin_save_plan(%L, null, null, null, 'Premium mensal', null, 0, null, 3, 500, null, 0, null, true, 20)$$, :'mensal'), 'Premium não fica com preço zero');
select tests.must_fail(format($$select public.admin_save_plan(%L, null, null, null, 'Gratuito', null, 500, null, 1, 100, null, 0, null, true, 10)$$, :'free'), 'gratuito não passa a cobrar');
select tests.must_fail(format($$select public.admin_save_plan(%L, null, null, null, 'Gratuito', null, 0, null, 1, 100, null, 0, null, false, 10)$$, :'free'), 'gratuito não sai do site');
select tests.must_fail(format($$select public.admin_set_plan_active(%L, false)$$, :'free'), 'gratuito não é desativado');
select tests.must_fail($$select public.admin_save_plan(null,'premium_mensal','premium','monthly','Duplicado',null,990,null,3,500,null,0,null,true,50)$$, 'código repetido recusado');
select tests.must_fail($$select public.admin_save_plan(null,'outro_gratis','free','none','Outro grátis',null,0,null,1,100,null,0,null,true,50)$$, 'só um plano gratuito');
select tests.must_fail($$select public.admin_save_plan(null,'premium_x','premium','none','Sem período',null,990,null,3,500,null,0,null,true,50)$$, 'Premium precisa de periodicidade');
select tests.must_fail($$select public.admin_save_plan(null,'premium_y','premium','monthly','Muitos dias',null,990,null,3,500,null,120,null,true,50)$$, 'teste grátis limitado a 90 dias');
select public.admin_save_plan(null, 'premium_anual_promo', 'premium', 'annual', 'Premium anual promocional', null, 7990,
  'R$ 6,66 por mês', 3, 500, array['Mesmos recursos do anual'], 0, null, false, 45) as promo \gset
select public.admin_set_plan_active(:'anual', false);
reset role;
set role anon;
select public.get_public_plans() as pub2 \gset
reset role;
select tests.ok(jsonb_array_length(:'pub2'::jsonb) = 3 and :'pub2' !~ 'premium_anual', 'plano desativado e plano oculto não aparecem no site');
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.admin_set_plan_active(:'anual', true);
reset role;
set role anon;
select tests.ok(public.get_public_plans()::text ~ 'premium_anual"', 'plano reativado volta ao site');
reset role;

-- Regras do banco
select tests.must_fail(format($$update public.subscription_plans set code = 'mudou' where id = %L$$, :'mensal'), 'código do plano não muda');
select tests.must_fail(format($$update public.subscription_plans set billing_period = 'annual' where id = %L$$, :'mensal'), 'periodicidade não muda');
select tests.must_fail($$delete from public.subscription_plans where code = 'premium_anual_promo'$$, 'planos não são excluídos');
select tests.must_fail($$update public.subscription_plan_versions set snapshot = '{}'$$, 'histórico de planos é imutável');
select tests.must_fail($$delete from public.subscription_plan_versions$$, 'histórico de planos não é apagado');
select tests.ok((select count(*) >= 8 from public.audit_logs where entity_type = 'subscription_plans'), 'alterações de planos auditadas');

-- Limites vêm do plano vigente
update public.system_settings set value = '9' where key = 'free_plan_max_motorcycles';  -- configuração antiga é ignorada
update public.subscription_plans set max_motorcycles = 2, storage_quota_mb = 200 where kind = 'free';
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((public.get_storage_usage() ->> 'quota_bytes')::bigint = 200 * 1048576, 'espaço para anexos segue o plano');
select tests.ok((public.register_motorcycle('Honda', 'Biz 125', 2020, 'QWE1A23', 3000) ->> 'status') = 'created', 'limite de motos segue o plano (2ª moto aceita)');
select tests.must_fail($$select public.register_motorcycle('Honda','Pop 110',2021,'QWE1A24',100)$$, 'acima do limite do plano recusado');
reset role;
update public.subscription_plans set max_motorcycles = 1, storage_quota_mb = 100 where kind = 'free';

\echo '=== TODOS OS TESTES DA FASE 5.1 (PLANOS) PASSARAM ==='
