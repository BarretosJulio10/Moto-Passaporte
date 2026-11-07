-- =============================================================================
-- Testes da Fase 5.2 (parte 1) — credenciais do Mercado Pago (banco de TESTE; após phase5a)
-- A: usuário comum; D: administrador.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set D '44444444-4444-4444-4444-444444444444'
\set TOKEN 'TEST-1234567890123456-110700-abcdefabcdefabcdefabcdefabcdef12-123456789'
\set TOKEN2 'APP_USR-9999999999999999-110700-ffffffffffffffffffffffffffffffff-987654321'

\echo '--- Fase 5.2: credenciais do Mercado Pago'

select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tests.must_fail($$select * from public.payment_gateway_settings$$, 'anônimo não lê configurações de pagamento');
select tests.must_fail($$select public.admin_get_payment_settings()$$, 'anônimo não vê configurações');
select tests.must_fail($$select public.payment_access_token()$$, 'anônimo não lê o token');
select public.get_payment_public_config() as pc \gset
select tests.ok((:'pc'::jsonb ->> 'billing_enabled')::boolean = false and (:'pc'::jsonb -> 'public_key') = 'null'::jsonb,
                'config pública não expõe nada enquanto a contratação está desligada');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail($$select * from public.payment_gateway_settings$$, 'usuário não lê a tabela');
select tests.must_fail($$select public.admin_get_payment_settings()$$, 'usuário não vê configurações');
select tests.must_fail(format($$select public.admin_save_payment_settings('test', null, %L, null)$$, :'TOKEN'), 'usuário não grava token');
select tests.must_fail($$select public.payment_access_token()$$, 'usuário não lê o token');
select tests.must_fail($$select public.payment_webhook_secret()$$, 'usuário não lê a assinatura');
select tests.must_fail($$select public.record_payment_check(true, 'ok', '1', 'x')$$, 'usuário não marca verificação');
select tests.must_fail($$select public.upsert_vault_secret('x', 'y')$$, 'usuário não grava no cofre');
select tests.must_fail($$select * from vault.decrypted_secrets$$, 'usuário não lê o cofre');
reset role;

-- Administrador
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.admin_get_payment_settings() as s0 \gset
select tests.ok((:'s0'::jsonb ->> 'access_token_configured')::boolean = false and :'s0'::jsonb ->> 'environment' = 'test',
                'começa sem token, em ambiente de teste');
select tests.must_fail($$select public.admin_save_payment_settings('test', null, 'token-invalido', null)$$, 'token em formato inválido recusado');
select tests.must_fail($$select public.admin_save_payment_settings('test', 'chave errada', null, null)$$, 'chave pública inválida recusada');
select tests.must_fail($$select public.admin_save_payment_settings('sandbox', null, null, null)$$, 'ambiente inválido recusado');
select public.admin_save_payment_settings('test', 'TEST-abcdef12-3456-7890-abcd-ef1234567890', :'TOKEN', 'segredoWebhook_0123456789abcdef');
select public.admin_get_payment_settings() as s1 \gset
select tests.ok((:'s1'::jsonb ->> 'access_token_configured')::boolean and :'s1'::jsonb ->> 'access_token_hint' = '6789'
                and (:'s1'::jsonb ->> 'webhook_secret_configured')::boolean and :'s1'::jsonb ->> 'webhook_secret_hint' = 'cdef',
                'admin grava token e assinatura; vê só os 4 últimos caracteres');
select tests.ok(:'s1' !~ 'abcdefabcdef' and :'s1' !~ 'segredoWebhook', 'leitura do admin nunca devolve os segredos');
reset role;

-- Servidor
grant usage on schema tests to service_role;
grant execute on all functions in schema tests to service_role;
set role service_role;
select tests.ok(public.payment_access_token() = :'TOKEN', 'servidor lê o token');
select tests.ok(public.payment_webhook_secret() = 'segredoWebhook_0123456789abcdef', 'servidor lê a assinatura');
select public.record_payment_check(true, 'Conexão confirmada', '123456', 'LOJA_TESTE');
reset role;
select tests.ok((select count(*) = 1 from vault.secrets where name = 'mercadopago_access_token'), 'token guardado no cofre');
select tests.ok(not exists (select 1 from public.audit_logs where entity_type = 'payment_gateway_settings'
                            and (coalesce(new_data::text, '') ~ 'abcdefabcdef|segredoWebhook' or coalesce(previous_data::text, '') ~ 'abcdefabcdef|segredoWebhook')),
                'auditoria registra a mudança sem os segredos');
select tests.ok((select count(*) >= 1 from public.audit_logs where entity_type = 'payment_gateway_settings' and action = 'payment_credentials_saved' and actor_user_id = :'D'),
                'gravação de credenciais auditada com autor');

-- Trocar só a chave pública mantém token e verificação; trocar o token (outra conta) substitui e zera a verificação
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.admin_save_payment_settings('test', 'TEST-abcdef12-3456-7890-abcd-ef1234567891', null, null);
select public.admin_get_payment_settings() as s2 \gset
select tests.ok(:'s2'::jsonb ->> 'access_token_hint' = '6789' and :'s2'::jsonb ->> 'account_nickname' = 'LOJA_TESTE'
                and (:'s2'::jsonb ->> 'last_check_ok')::boolean, 'campo em branco mantém o token e a verificação');
select public.admin_save_payment_settings('production', 'APP_USR-abcdef12-3456-7890-abcd-ef1234567890', :'TOKEN2', null);
select public.admin_get_payment_settings() as s3 \gset
select tests.ok(:'s3'::jsonb ->> 'access_token_hint' = '4321' and :'s3'::jsonb ->> 'environment' = 'production'
                and :'s3'::jsonb -> 'account_nickname' = 'null'::jsonb and :'s3'::jsonb -> 'last_check_ok' = 'null'::jsonb,
                'novo token (outra conta) substitui o anterior e exige novo teste');
reset role;
select tests.ok((select count(*) = 1 from vault.secrets where name = 'mercadopago_access_token'), 'cofre continua com um único token (substituído)');
set role service_role;
select tests.ok(public.payment_access_token() = :'TOKEN2', 'servidor passa a usar o token novo');
reset role;

-- Config pública com a contratação ligada
update public.system_settings set value = 'true' where key = 'billing_enabled';
set role anon;
select tests.ok(public.get_payment_public_config() ->> 'public_key' = 'APP_USR-abcdef12-3456-7890-abcd-ef1234567890',
                'com contratação liberada, chave pública disponível para o checkout');
select tests.ok(public.get_payment_public_config()::text !~ 'ffffffff', 'token nunca aparece na config pública');
reset role;
update public.system_settings set value = 'false' where key = 'billing_enabled';

\echo '=== TODOS OS TESTES DA FASE 5.2 (CREDENCIAIS) PASSARAM ==='
