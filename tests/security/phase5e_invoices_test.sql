-- =============================================================================
-- Testes da Fase 5.3 — faturas por ciclo e recibo (banco de TESTE; após phase5d)
-- B: assinante; A: outro usuário; D: administrador.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 5.3: faturas'

grant usage on schema tests to service_role;
grant execute on all functions in schema tests to service_role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.admin_set_billing_enabled(true);
reset role;

set role service_role;
select public.billing_prepare_subscription(:'B', 'premium_mensal') as prep \gset
select (:'prep'::jsonb ->> 'subscription_id') as sub \gset
select public.billing_attach_checkout(:'sub', 'pre_B', 'https://www.mercadopago.com.br/x');
select public.billing_apply_payment('pay_B1', 'pre_B', null, 'approved', 990, now());
select public.billing_apply_payment('pay_B1', 'pre_B', null, 'approved', 990, now());
reset role;
select tests.ok((select count(*) = 2 from public.invoices where subscription_id = :'sub'), 'pagamento aprovado gera a fatura paga e a do próximo ciclo (aviso repetido não duplica)');
select tests.ok((select status = 'paid' and amount_cents = 990 and payment_id is not null and number ~ '^MP-\d{4}-\d{6}$'
                 from public.invoices where subscription_id = :'sub' order by period_start limit 1), 'fatura paga com número legível e pagamento ligado');
select tests.ok((select i.status = 'open' and i.period_start = s.current_period_end and i.due_date = (s.current_period_end at time zone 'America/Sao_Paulo')::date
                 from public.invoices i join public.subscriptions s on s.id = i.subscription_id
                 where i.subscription_id = :'sub' order by i.period_start desc limit 1), 'próxima fatura em aberto vence no fim do período pago');

-- Falhas de cobrança
set role service_role;
select public.billing_apply_payment('pay_B2', 'pre_B', null, 'rejected', 990, null);
select public.billing_apply_payment('pay_B2', 'pre_B', null, 'rejected', 990, null);
reset role;
select tests.ok((select status = 'failed' and attempts = 1 from public.invoices where subscription_id = :'sub' and status <> 'paid'),
                'cobrança recusada marca a fatura como falha (aviso repetido não soma tentativa)');
set role service_role;
select public.billing_apply_payment('pay_B3', 'pre_B', null, 'rejected', 990, null);
select public.billing_apply_payment('pay_B4', 'pre_B', null, 'approved', 990, now());
reset role;
select tests.ok((select count(*) = 2 from public.invoices where subscription_id = :'sub' and status = 'paid'), 'nova tentativa aprovada quita a fatura que falhou');
select tests.ok((select attempts = 2 from public.invoices where subscription_id = :'sub' and status = 'paid' order by period_start desc limit 1),
                'fatura guarda quantas tentativas falharam');
select tests.ok((select count(*) = 1 from public.invoices where subscription_id = :'sub' and status = 'open'), 'abre o ciclo seguinte');

-- Usuário
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select count(*) = 3 from public.get_my_invoices()), 'assinante vê suas faturas');
select id as paid_inv from public.get_my_invoices() where status = 'paid' order by period_start limit 1 \gset
select id as open_inv from public.get_my_invoices() where status = 'open' limit 1 \gset
select public.get_invoice_receipt(:'paid_inv') as rec \gset
select tests.ok(:'rec'::jsonb ->> 'customer_email' = 'bruno@teste.local' and (:'rec'::jsonb ->> 'amount_cents')::int = 990
                and :'rec'::jsonb ->> 'payment_reference' = 'pay_B1', 'recibo da fatura paga com cliente, valor e referência do pagamento');
select tests.must_fail(format($$select public.get_invoice_receipt(%L)$$, :'open_inv'), 'fatura em aberto não tem recibo');
select tests.must_fail($$select * from public.invoices$$, 'tabela de faturas sem acesso direto');
select tests.must_fail($$select public.admin_list_invoices()$$, 'usuário não lista faturas de todos');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok(not exists (select 1 from public.get_my_invoices() where id = :'paid_inv'), 'outro usuário não vê faturas alheias');
select tests.must_fail(format($$select public.get_invoice_receipt(%L)$$, :'paid_inv'), 'outro usuário não abre recibo alheio');
reset role;

-- Reembolso e cancelamento
set role service_role;
select public.billing_apply_payment('pay_B4', 'pre_B', null, 'refunded', 990, null);
select public.billing_cancel_local(:'sub', 'Pedido do usuário');
reset role;
select tests.ok((select status = 'refunded' from public.invoices where payment_id = (select id from public.payments where provider_payment_id = 'pay_B4')),
                'reembolso marca a fatura como reembolsada');
select tests.ok((select count(*) = 0 from public.invoices where subscription_id = :'sub' and status in ('open', 'failed'))
                and (select count(*) = 1 from public.invoices where subscription_id = :'sub' and status = 'canceled'), 'cancelar a assinatura cancela a fatura em aberto');
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.get_invoice_receipt(:'paid_inv') as rec2 \gset
select tests.ok(:'rec2'::jsonb ->> 'status' = 'paid', 'recibo antigo continua disponível');
reset role;

select tests.must_fail($$delete from public.invoices$$, 'faturas não são excluídas');
select tests.ok((select count(*) >= 3 from public.audit_logs where entity_type = 'invoices'), 'faturas auditadas');
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((select count(*) >= 3 from public.admin_list_invoices() where user_name is not null), 'admin lista faturas');
select public.admin_set_billing_enabled(false);
reset role;

\echo '=== TODOS OS TESTES DA FASE 5.3 (FATURAS) PASSARAM ==='
