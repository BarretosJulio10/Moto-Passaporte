-- =============================================================================
-- Testes da Fase 5.2 (parte 2) — assinaturas, pagamentos e avisos (banco de TESTE; após phase5b)
-- Simula o que as Edge Functions fazem com as respostas do Mercado Pago.
-- A: assinante; B: outro usuário; D: administrador.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 5.2: assinaturas e pagamentos'

-- Segurança de acesso
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tests.must_fail($$select * from public.subscriptions$$, 'anônimo não lê assinaturas');
select tests.must_fail($$select public.billing_prepare_subscription('11111111-1111-1111-1111-111111111111', 'premium_mensal')$$, 'anônimo não cria assinatura');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail($$select * from public.subscriptions$$, 'usuário não lê a tabela de assinaturas');
select tests.must_fail($$select * from public.payments$$, 'usuário não lê a tabela de pagamentos');
select tests.must_fail($$select * from public.payment_events$$, 'usuário não lê os avisos');
select tests.must_fail($$select public.billing_prepare_subscription('11111111-1111-1111-1111-111111111111', 'premium_mensal')$$, 'usuário não chama função do servidor');
select tests.must_fail($$select public.billing_apply_payment('x', 'y', null, 'approved', 990, now())$$, 'usuário não aprova pagamento');
select tests.must_fail($$select public.admin_list_subscriptions()$$, 'usuário não lista assinaturas de todos');
select tests.must_fail($$select public.admin_set_billing_enabled(true)$$, 'usuário não libera a contratação');
select tests.ok(public.get_my_subscription() is null, 'sem assinatura ainda');
reset role;

grant usage on schema tests to service_role;
grant execute on all functions in schema tests to service_role;

-- Contratação desligada
set role service_role;
select tests.must_fail(format($$select public.billing_prepare_subscription(%L, 'premium_mensal')$$, :'A'), 'sem contratação liberada não cria assinatura');
reset role;

-- Liberar contratação: exige conta testada e assinatura do Webhook
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail($$select public.admin_set_billing_enabled(true)$$, 'não libera com a conta ainda não testada');
reset role;
set role service_role;
select public.record_payment_check(true, 'Conexão confirmada', '987654321', 'LOJA_PROD');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.admin_set_billing_enabled(true);
reset role;
select tests.ok((select (value #>> '{}')::boolean from public.system_settings where key = 'billing_enabled'), 'admin libera a contratação com tudo configurado');

-- A contrata o Premium mensal
set role service_role;
select tests.must_fail(format($$select public.billing_prepare_subscription(%L, 'gratuito')$$, :'A'), 'plano gratuito não é contratável');
select tests.must_fail(format($$select public.billing_prepare_subscription(%L, 'nao_existe')$$, :'A'), 'plano inexistente recusado');
select public.billing_prepare_subscription(:'A', 'premium_mensal') as prep1 \gset
select (:'prep1'::jsonb ->> 'subscription_id') as sub1 \gset
select public.billing_attach_checkout(:'sub1', 'pre_old', 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=pre_old');
-- desistiu e tentou de novo: a tentativa anterior expira e é devolvida para cancelar no provedor
select public.billing_prepare_subscription(:'A', 'premium_mensal') as prep2 \gset
reset role;
select tests.ok((:'prep2'::jsonb -> 'expired_provider_ids') = '["pre_old"]'::jsonb
                and (select status = 'expired' from public.subscriptions where id = :'sub1'), 'nova tentativa expira a anterior pendente');
select (:'prep2'::jsonb ->> 'subscription_id') as sub \gset
select tests.ok((:'prep2'::jsonb ->> 'price_cents')::int = (select price_cents from public.subscription_plans where code = 'premium_mensal')
                and :'prep2'::jsonb ->> 'payer_email' = 'ana@teste.local', 'assinatura guarda o preço vigente e o e-mail do pagador');
set role service_role;
select public.billing_attach_checkout(:'sub', 'pre_A', 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=pre_A');
select public.billing_apply_subscription_state('pre_A', :'sub', 'authorized');
reset role;
select tests.ok((select status = 'pending' and current_period_end is null from public.subscriptions where id = :'sub'),
                'autorização sem pagamento aprovado não libera o Premium');
select tests.ok((public.user_plan(:'A')).kind = 'free', 'ainda no plano gratuito');

-- Preço do catálogo muda depois: contrato não muda
update public.subscription_plans set price_cents = 1990 where code = 'premium_mensal';

-- Pagamento pendente não libera
set role service_role;
select public.billing_apply_payment('pay_0', 'pre_A', null, 'in_process', 990, null);
reset role;
select tests.ok((public.user_plan(:'A')).kind = 'free', 'pagamento pendente não libera o Premium');

-- Pagamento aprovado libera um período; aviso repetido não concede de novo
set role service_role;
select public.billing_apply_payment('pay_1', 'pre_A', null, 'approved', 990, now());
select public.billing_apply_payment('pay_1', 'pre_A', null, 'approved', 990, now());
reset role;
select tests.ok((select status = 'active' and current_period_end between now() + interval '27 days' and now() + interval '32 days'
                 from public.subscriptions where id = :'sub'), 'pagamento aprovado ativa por 1 mês (aviso repetido não soma)');
select tests.ok((public.user_plan(:'A')).max_motorcycles = 3 and (public.user_plan(:'A')).price_cents = (:'prep2'::jsonb ->> 'price_cents')::int
                and (:'prep2'::jsonb ->> 'price_cents')::int <> 1990,
                'limites e preço do contrato valem, mesmo com o catálogo alterado');
select tests.ok((select count(*) = 1 from public.payments where provider_payment_id = 'pay_1'), 'pagamento registrado uma vez');

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok((public.get_my_subscription() ->> 'status') = 'active' and (public.get_my_subscription() ->> 'has_access')::boolean,
                'usuário vê assinatura ativa');
select tests.ok((select count(*) = 2 from public.get_my_payments()), 'usuário vê seu histórico de pagamentos');
select tests.ok((public.get_my_plan() ->> 'max_motorcycles')::int = 3, 'painel mostra o limite do Premium');
select tests.ok((public.register_motorcycle('Yamaha', 'Fazer 250', 2022, 'PRM1A11', 500) ->> 'status') = 'created', 'Premium permite cadastrar mais motos');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select count(*) = 0 from public.get_my_payments()) and public.get_my_subscription() is null, 'outro usuário não vê pagamentos alheios');
reset role;

-- Já tem assinatura ativa: não contrata outra
set role service_role;
select tests.must_fail(format($$select public.billing_prepare_subscription(%L, 'premium_anual')$$, :'A'), 'não abre segunda assinatura em andamento');
-- Renovação aprovada soma mais um mês
select public.billing_apply_payment('pay_2', 'pre_A', :'sub', 'approved', 990, now());
reset role;
select tests.ok((select current_period_end > now() + interval '57 days' from public.subscriptions where id = :'sub'), 'renovação soma mais um período');
-- Cobrança recusada com período ainda longo não muda nada
set role service_role;
select public.billing_apply_payment('pay_3', 'pre_A', null, 'rejected', 990, null);
reset role;
select tests.ok((select status = 'active' from public.subscriptions where id = :'sub'), 'recusa com período pago em vigor mantém ativa');

-- Atraso: período vencido + recusa = em atraso, com tolerância de 7 dias
update public.subscriptions set current_period_end = now() - interval '1 day' where id = :'sub';
set role service_role;
select public.billing_apply_payment('pay_4', 'pre_A', null, 'rejected', 990, null);
reset role;
select tests.ok((select status = 'past_due' and past_due_since is not null from public.subscriptions where id = :'sub'), 'cobrança recusada após o vencimento: em atraso');
select tests.ok((public.user_plan(:'A')).kind = 'premium', 'em atraso, mantém o Premium durante a tolerância');
update public.subscriptions set current_period_end = now() - interval '8 days' where id = :'sub';
select tests.ok((public.user_plan(:'A')).kind = 'free', 'passada a tolerância, volta ao gratuito');
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail($$select public.register_motorcycle('Honda','CG 160',2023,'PRM1A12',10)$$, 'de volta ao gratuito, acima do limite não cadastra moto nova');
select tests.ok((select count(*) = 2 from public.my_motorcycles), 'motos já cadastradas continuam com o dono');
reset role;
-- Pagamento em atraso aprovado reativa
set role service_role;
select public.billing_apply_payment('pay_5', 'pre_A', null, 'approved', 990, now());
reset role;
select tests.ok((select status = 'active' and past_due_since is null and current_period_end > now() + interval '27 days'
                 from public.subscriptions where id = :'sub'), 'pagamento aprovado depois do atraso reativa');

-- Pausa e retomada
set role service_role;
select public.billing_apply_subscription_state('pre_A', null, 'paused');
reset role;
select tests.ok((select status = 'paused' from public.subscriptions where id = :'sub') and (public.user_plan(:'A')).kind = 'premium',
                'pausada mantém o período já pago');
set role service_role;
select public.billing_apply_subscription_state('pre_A', null, 'authorized');
reset role;
select tests.ok((select status = 'active' from public.subscriptions where id = :'sub'), 'retomada volta a ativa');

-- Cancelamento: mantém até o fim do período
set role service_role;
select public.billing_cancel_local(:'sub', 'Pedido do usuário');
select public.billing_apply_subscription_state('pre_A', null, 'cancelled');
reset role;
select tests.ok((select status = 'canceled' and canceled_at is not null from public.subscriptions where id = :'sub')
                and (public.user_plan(:'A')).kind = 'premium', 'cancelada mantém o Premium até o fim do período pago');

-- Reembolso encerra na hora
set role service_role;
select public.billing_apply_payment('pay_5', 'pre_A', null, 'refunded', 990, null);
reset role;
select tests.ok((select status = 'refunded' from public.payments where provider_payment_id = 'pay_5')
                and (public.user_plan(:'A')).kind = 'free', 'reembolso registra o pagamento e encerra o Premium');

-- Avisos
set role service_role;
select public.billing_log_event('payment', 'payment.updated', '123', 'req-1', true) as ev \gset
select public.billing_finish_event(:'ev', 'processed', 'ok');
select tests.ok(public.billing_log_event('payment', 'payment.updated', '123', 'req-1', true) is null, 'aviso repetido já processado não é processado de novo');
select public.billing_log_event('payment', 'payment.updated', '125', 'req-3', true) as ev3 \gset
select public.billing_finish_event(:'ev3', 'error', 'Mercado Pago fora do ar');
select tests.ok(public.billing_log_event('payment', 'payment.updated', '125', 'req-3', true) = :'ev3'::bigint, 'repetição de aviso que falhou é processada de novo');
select public.billing_log_event('payment', 'payment.updated', '124', 'req-2', false);
select tests.ok((public.billing_apply_payment('pay_x', 'pre_desconhecida', null, 'approved', 990, now()) ->> 'result') = 'ignored',
                'pagamento sem assinatura local é ignorado (não libera nada)');
reset role;
select tests.ok((select result = 'invalid_signature' from public.payment_events where request_id = 'req-2'), 'aviso com assinatura inválida fica registrado como inválido');
select tests.ok(not exists (select 1 from public.payments where provider_payment_id = 'pay_x'), 'nada gravado para pagamento sem vínculo');

-- Registros financeiros não são apagados
select tests.must_fail(format($$delete from public.payments where provider_payment_id = 'pay_1'$$), 'pagamentos não são excluídos');
select tests.must_fail(format($$delete from public.subscriptions where id = %L$$, :'sub'), 'assinaturas não são excluídas');
select tests.ok((select count(*) >= 5 from public.audit_logs where entity_type in ('subscriptions', 'payments')), 'mudanças de cobrança auditadas');

-- Admin investiga
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((select count(*) >= 1 from public.admin_list_subscriptions() where user_name is not null), 'admin lista assinaturas');
select tests.ok((select count(*) >= 2 from public.admin_list_payment_events()), 'admin vê os avisos recebidos');
select public.admin_set_billing_enabled(false);
reset role;
update public.subscription_plans set price_cents = (:'prep2'::jsonb ->> 'price_cents')::int where code = 'premium_mensal';

\echo '=== TODOS OS TESTES DA FASE 5.2 (ASSINATURAS) PASSARAM ==='
