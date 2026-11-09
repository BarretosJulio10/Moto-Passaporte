-- =============================================================================
-- Conta da pista (ADR-058). Banco de TESTE, depois da fase 8f.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'
\set P '77777777-aaaa-4aaa-8aaa-000000000001'
\set Q '77777777-aaaa-4aaa-8aaa-000000000002'
\echo '--- Conta da pista'

select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_c from public.workshops where public_slug = 'oficina-do-carlos' \gset
select pista_code as code from public.organizations where id = :'org_c' \gset
select tests.ok(:'code' ~ '^[a-z0-9]{6}$', 'oficina ganhou código da pista');
select tests.ok((public.pista_workshop_by_code(upper(:'code')) ->> 'name') is not null, 'tela de entrada acha a oficina pelo código');
select tests.ok(public.pista_workshop_by_code('zzzzzz') is null, 'código errado não acha nada');

-- Só o responsável prepara
select tests.must_fail(format($$select public.pista_account_prepare(%L, %L, 'davi')$$, :'D', :'org_c'), 'funcionário não cria mecânico');
select tests.must_fail(format($$select public.pista_account_prepare(%L, %L, 'Davi Souza')$$, :'C', :'org_c'), 'apelido com espaço ou maiúscula recusado');
select public.pista_account_prepare(:'C', :'org_c', 'davi') as prep \gset
select tests.ok((:'prep'::jsonb ->> 'email') = 'davi.' || :'code' || '@pista.motopassaporte.com.br', 'e-mail interno montado a partir do apelido e do código');
select tests.ok(not has_function_privilege('authenticated', 'public.pista_account_prepare(uuid, uuid, text, uuid)', 'execute')
                and not has_function_privilege('authenticated', 'public.pista_account_manage(uuid, uuid, uuid, text)', 'execute'),
                'gestão das contas só pela Edge Function');

-- Conta criada como a Edge Function faz (sem Premium de boas-vindas)
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values (:'P', :'prep'::jsonb ->> 'email', '{"full_name": "Davi Souza"}', '{"account_kind": "pista"}');
select tests.ok(not exists (select 1 from public.premium_grants where user_id = :'P'), 'conta da pista não ganha Premium de boas-vindas');
select tests.must_fail(format($$select public.pista_account_register(%L, %L, %L, 'davi', 'Davi')$$, :'C', :'org_c', :'A'), 'só registra conta marcada como da pista');
select public.pista_account_register(:'C', :'org_c', :'P', 'davi', 'Davi Souza');
select tests.must_fail(format($$select public.pista_account_prepare(%L, %L, 'davi')$$, :'C', :'org_c'), 'apelido repetido na oficina recusado');
select tests.ok((select role = 'staff' and can_execute_orders and not can_manage_finance and not can_request_access
                   from public.organization_members where organization_id = :'org_c' and user_id = :'P'), 'mecânico entra só com "Executar OS"');

-- O mecânico na pista
select set_config('request.jwt.claim.sub', :'P', false);
set role authenticated;
select public.pista_context() as ctx \gset
select tests.ok((:'ctx'::jsonb -> 0 ->> 'nickname') = 'davi' and (:'ctx'::jsonb -> 0 ->> 'pista_account')::boolean, 'pista mostra apelido e oficina');
select set_config('request.path', '/rpc/pista_list_orders', false);
select public.pista_request_guard();
select set_config('request.path', '/rpc/create_motorcycle', false);
select tests.must_fail('select public.pista_request_guard()', 'conta da pista não chama nada fora da pista');
select set_config('request.path', '/motorcycles', false);
select tests.must_fail('select public.pista_request_guard()', 'conta da pista não lê tabelas');
select tests.must_fail(format($$select public.workshop_pista_accounts(%L)$$, :'org_c'), 'mecânico não vê a lista da equipe da pista');
reset role;
select tests.ok(position('is_pista_account(p_user)' in pg_get_functiondef('public.billing_prepare_subscription(uuid, text)'::regprocedure)) > 0, 'conta da pista não assina plano');
select tests.must_fail(format($$select public.pista_account_prepare(%L, %L, 'outro')$$, :'P', :'org_c'), 'conta da pista não cria mecânicos');

-- Outras contas passam pela trava normalmente
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select set_config('request.path', '/rpc/create_motorcycle', false);
select public.pista_request_guard();
select (public.workshop_pista_accounts(:'org_c') -> 'accounts') as acc \gset
select tests.ok(jsonb_array_length(:'acc'::jsonb) = 1 and (:'acc'::jsonb -> 0 ->> 'active')::boolean, 'responsável vê o mecânico na equipe');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select public.pista_request_guard();
reset role;

-- Desligar e reativar
select public.pista_account_manage(:'C', :'org_c', :'P', 'disable');
select set_config('request.jwt.claim.sub', :'P', false);
set role authenticated;
select set_config('request.path', '/rpc/pista_context', false);
select tests.must_fail('select public.pista_request_guard()', 'mecânico desligado sai na hora');
reset role;
select tests.ok((select status = 'removed' from public.organization_members where organization_id = :'org_c' and user_id = :'P'), 'desligar tira da equipe');
select tests.must_fail(format($$select public.pista_account_manage(%L, %L, %L, 'password')$$, :'C', :'org_c', :'P'), 'senha só depois de reativar');
select public.pista_account_manage(:'C', :'org_c', :'P', 'enable');
select public.pista_account_manage(:'C', :'org_c', :'P', 'password');
select tests.ok((select status = 'active' from public.organization_members where organization_id = :'org_c' and user_id = :'P'), 'reativar volta para a equipe');

-- Converter funcionário convidado (D) em conta da pista
select id as mem_d from public.organization_members where organization_id = :'org_c' and user_id = :'D' and status = 'active' \gset
select public.pista_account_prepare(:'C', :'org_c', 'dudu', :'mem_d') as prep2 \gset
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values (:'Q', :'prep2'::jsonb ->> 'email', '{"full_name": "Dudu"}', '{"account_kind": "pista"}');
select public.pista_account_register(:'C', :'org_c', :'Q', 'dudu', 'Dudu', :'mem_d');
select tests.ok((select status = 'removed' from public.organization_members where id = :'mem_d')
                and exists (select 1 from public.organization_members where organization_id = :'org_c' and user_id = :'Q' and status = 'active'),
                'convidado vira conta da pista e a conta pessoal sai da equipe');
select tests.ok(not exists (select 1 from public.workshop_service_orders
                             where organization_id = :'org_c' and mechanic_user_id = :'D'
                               and status not in ('completed', 'awaiting_pickup', 'delivered', 'canceled')),
                'serviços em andamento passam para a conta da pista');
select id as mem_q from public.organization_members where organization_id = :'org_c' and user_id = :'Q' \gset
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.update_org_member(%L, 'responsible', true, true)$$, :'mem_q'), 'conta da pista não vira responsável');
reset role;

\o
\echo 'Conta da pista: ok'

-- KI-047: controle de acessos anônimos aceita as categorias usadas pelos links da oficina
\o /dev/null
select tests.ok(pg_get_constraintdef(oid) ~ 'quote_link' and pg_get_constraintdef(oid) ~ 'public_workshop' and pg_get_constraintdef(oid) ~ 'public_booking',
                'categorias dos links da oficina aceitas no controle de acessos')
  from pg_constraint where conname = 'anon_rate_limits_bucket_check';
\o

-- Conta da pista abre páginas públicas; checklist aceita "chaves" com texto
\o /dev/null
select set_config('request.jwt.claim.sub', :'Q', false);
set role authenticated;
select set_config('request.path', '/rpc/get_quote_by_token', false);
select public.pista_request_guard();
select set_config('request.path', '/rpc/get_my_plan', false);
select tests.must_fail('select public.pista_request_guard()', 'função não pública continua bloqueada para a pista');
reset role;
select tests.ok(position('regexp_replace' in pg_get_functiondef('public.workshop_save_inspection(uuid, uuid, text, jsonb)'::regprocedure)) > 0,
                'checklist ignora texto no campo de chaves');
\o
