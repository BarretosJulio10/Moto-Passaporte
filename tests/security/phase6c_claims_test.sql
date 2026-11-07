-- =============================================================================
-- Testes da Fase 6.2 — pedidos de verificação de placa (banco de TESTE; após phase6b)
-- C: solicitante; A: titular atual; B: outro usuário; D: administrador.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 6.2: verificação de placa'

select p.plate as plate_a, p.motorcycle_id as moto_a from public.motorcycle_plates p
  join public.motorcycle_ownerships o on o.motorcycle_id = p.motorcycle_id and o.ended_at is null
 where o.owner_user_id = :'A' and p.valid_until is null order by p.created_at limit 1 \gset

-- C tenta cadastrar a placa de A: vira pedido de verificação
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select (public.register_motorcycle('Honda', 'CG 160', 2020, :'plate_a', 1000) ->> 'claim_id') as claim \gset
select tests.ok((select count(*) = 1 and bool_and(status = 'pending') from public.get_my_claims() where id = :'claim'), 'solicitante acompanha o pedido');
select tests.ok((select row_to_json(x)::text !~ :'moto_a' from public.get_my_claims() x where id = :'claim'), 'solicitante não vê a moto existente');
select public.update_my_claim_note(:'claim', 'Comprei a moto em outubro; tenho o recibo de compra e venda.');
select tests.ok((select requester_note like 'Comprei%' from public.get_my_claims() where id = :'claim'), 'solicitante complementa o pedido');
select tests.must_fail($$select * from public.admin_list_claims()$$, 'solicitante não vê a fila do admin');
select tests.must_fail(format($$select public.admin_resolve_claim(%L, 'approved', 'Aprovado por mim mesmo', false, 'Tentativa indevida aqui')$$, :'claim'), 'solicitante não decide');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.must_fail(format($$select public.update_my_claim_note(%L, 'intromissão')$$, :'claim'), 'outro usuário não mexe no pedido');
select tests.must_fail(format($$select public.cancel_my_claim(%L)$$, :'claim'), 'outro usuário não cancela o pedido');
reset role;

-- Admin analisa
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((select motorcycle_id = :'moto_a' and current_owner_id = :'A' and requester_email_masked like '%•••@%'
                 and requester_note like 'Comprei%' from public.admin_list_claims() where id = :'claim'), 'admin vê o pedido com contexto da moto e do titular');
select tests.must_fail(format($$select public.admin_resolve_claim(%L, 'approved', 'curta', true, 'Recibo conferido pela equipe')$$, :'claim'), 'resposta ao solicitante obrigatória');
select tests.must_fail(format($$select public.admin_resolve_claim(%L, 'approved', 'Pedido procedente, aguarde.', true, 'curto')$$, :'claim'), 'motivo obrigatório');
select tests.must_fail(format($$select public.admin_resolve_claim(%L, 'rejected', 'Não encontramos evidências.', true, 'Sem recibo nem documento')$$, :'claim'), 'aviso ao titular só em pedido procedente');
select public.admin_resolve_claim(:'claim', 'approved',
  'Pedido procedente. Avisamos o titular atual para transferir o passaporte para a sua conta.', true, 'Recibo de compra e venda conferido');
select tests.must_fail(format($$select public.admin_resolve_claim(%L, 'rejected', 'Mudança de ideia depois.', false, 'Segunda decisão indevida')$$, :'claim'), 'pedido encerrado não é decidido de novo');
reset role;
select tests.ok((select count(*) = 1 from public.audit_logs where action = 'admin_resolve_claim' and entity_id = :'claim'
                 and new_data ->> 'reason' = 'Recibo de compra e venda conferido'), 'decisão auditada com motivo');

-- Solicitante vê a resposta
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.ok((select status = 'approved' and resolution_note like 'Pedido procedente%' from public.get_my_claims() where id = :'claim'), 'solicitante vê a decisão e a resposta');
select tests.must_fail(format($$select public.cancel_my_claim(%L)$$, :'claim'), 'pedido encerrado não é cancelado');
select tests.ok((select count(*) = 0 from public.get_my_ownership_notices()), 'solicitante não recebe o aviso do titular');
reset role;

-- Titular recebe aviso anônimo
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok((select count(*) = 1 and bool_and(motorcycle_id = :'moto_a') from public.get_my_ownership_notices() where claim_id = :'claim'), 'titular recebe o aviso');
select tests.ok((select row_to_json(x)::text !~ :'C' from public.get_my_ownership_notices() x), 'aviso não identifica o solicitante');
select public.dismiss_ownership_notice(:'claim');
select tests.ok((select count(*) = 0 from public.get_my_ownership_notices() where claim_id = :'claim'), 'titular dispensa o aviso');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.must_fail(format($$select public.dismiss_ownership_notice(%L)$$, :'claim'), 'outro usuário não mexe no aviso');
reset role;

-- Cancelamento pelo solicitante
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select (public.register_motorcycle('Honda', 'CG 160', 2020, :'plate_a', 1000) ->> 'claim_id') as claim2 \gset
select public.cancel_my_claim(:'claim2');
select tests.ok((select status = 'canceled' from public.get_my_claims() where id = :'claim2'), 'solicitante cancela pedido pendente');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok(not exists (select 1 from public.admin_list_claims() where id = :'claim2'), 'cancelado sai da fila pendente');
select tests.ok(exists (select 1 from public.admin_list_claims(null) where id = :'claim2'), 'histórico completo disponível');
reset role;

\echo '=== TODOS OS TESTES DA FASE 6.2 (VERIFICAÇÃO DE PLACA) PASSARAM ==='
