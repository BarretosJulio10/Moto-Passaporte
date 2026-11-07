-- =============================================================================
-- Testes da Fase 4 — transferência do passaporte (banco de TESTE; após phase3d)
-- Estado herdado: B é titular de duas motos (moto_x e moto_b); A não tem moto;
-- D é responsável pela "Moto Center D"; A pela "Oficina da Ana".
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 4: transferência'
select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_a from public.workshops where public_slug = 'oficina-da-ana' \gset
select organization_id as org_d from public.workshops where public_slug = 'moto-center-d' \gset
select a.motorcycle_id as moto_x from public.motorcycle_workshop_access a
  join public.workshops w on w.organization_id = a.organization_id
 where w.public_slug = 'oficina-do-carlos' and a.end_reason = 'owner' and a.status = 'revoked'
 order by a.ended_at desc limit 1 \gset
select plate as plate_x from public.motorcycle_plates where motorcycle_id = :'moto_x' and valid_until is null \gset
select o.motorcycle_id as moto_b from public.motorcycle_ownerships o
 where o.owner_user_id = :'B' and o.ended_at is null and o.motorcycle_id <> :'moto_x' limit 1 \gset
select tests.ok((select count(*) = 2 from public.motorcycle_ownerships where owner_user_id = :'B' and ended_at is null), 'B tem duas motos (estado herdado)');

-- Oficinas: uma autorizada e outra com pedido pendente em moto_x
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.request_workshop_access(:'org_d', :'plate_x') ->> 'id' as acc_d \gset
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.decide_workshop_access(:'acc_d', true);
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.request_workshop_access(:'org_a', :'plate_x') ->> 'id' as acc_a \gset
reset role;

-- ===== Pedido
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.must_fail(format($$select public.create_transfer_request(%L, 'bruno@teste.local')$$, :'moto_x'), 'não transfere para si mesmo');
select tests.must_fail(format($$select public.create_transfer_request(%L, 'sem-arroba')$$, :'moto_x'), 'e-mail inválido');
select public.create_transfer_request(:'moto_x', '  Ana@Teste.LOCAL ', 'Vendida no sábado') as tr \gset
select tests.must_fail(format($$select public.create_transfer_request(%L, 'outra@pessoa.com')$$, :'moto_x'), 'um pedido aberto por moto');
select tests.ok((select status = 'pending' and to_email = 'ana@teste.local' from public.get_motorcycle_transfers(:'moto_x') where id = :'tr'), 'titular acompanha o pedido');
select tests.must_fail($$select * from public.transfer_requests$$, 'tabela não é lida diretamente');
reset role;

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.create_transfer_request(%L, 'x@y.com')$$, :'moto_x'), 'quem não é titular não pede');
select tests.ok((select count(*) = 0 from public.get_my_incoming_transfers()), 'outra conta não vê o pedido');
select tests.must_fail(format($$select public.accept_transfer_request(%L)$$, :'tr'), 'outra conta não aceita');
select tests.must_fail(format($$select public.reject_transfer_request(%L)$$, :'tr'), 'outra conta não recusa');
reset role;

-- ===== Comprador vê e aceita
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok((select count(*) = 1 and bool_and(from_name = 'Bruno' and plate = :'plate_x' and message = 'Vendida no sábado' and maintenance_count >= 1)
                   from public.get_my_incoming_transfers()), 'comprador vê moto, placa, quem envia e tamanho do histórico');
select tests.ok((select count(*) = 0 from public.maintenance_timeline where motorcycle_id = :'moto_x'), 'antes de aceitar, comprador não vê o histórico');
select tests.must_fail(format($$select public.accept_transfer_request(%L, current_date + 3)$$, :'tr'), 'data de aquisição futura recusada');
select tests.ok(public.accept_transfer_request(:'tr', current_date - 1) = :'moto_x'::uuid, 'comprador aceita');
select tests.ok(public.is_current_owner(:'moto_x'), 'comprador vira titular');
select tests.ok((select count(*) >= 3 from public.maintenance_timeline where motorcycle_id = :'moto_x'), 'histórico acompanha a moto');
select tests.ok((select count(*) >= 1 from public.maintenance_timeline where motorcycle_id = :'moto_x' and source_type = 'workshop' and recorded_by_name = 'Carlos'), 'autoria dos registros preservada');
select tests.ok((select count(*) >= 1 from public.mileage_records where motorcycle_id = :'moto_x'), 'quilometragem preservada');
select tests.ok((select acquisition_date = current_date - 1 and transfer_id = :'tr' from public.motorcycle_ownerships where motorcycle_id = :'moto_x' and ended_at is null), 'nova titularidade ligada ao pedido');
select tests.must_fail(format($$select public.accept_transfer_request(%L)$$, :'tr'), 'pedido aceito não vale de novo');
reset role;

select set_config('request.jwt.claim.sub', '', false);
select tests.ok((select status = 'ended' and end_reason = 'transfer' from public.motorcycle_workshop_access where id = :'acc_d'), 'autorização ativa encerrada pela transferência');
select tests.ok((select status = 'canceled' and end_reason = 'transfer' from public.motorcycle_workshop_access where id = :'acc_a'), 'pedido de oficina pendente cancelado pela transferência');
select tests.ok((select count(*) = 0 from public.motorcycle_workshop_access where motorcycle_id = :'moto_x' and status in ('pending', 'approved')), 'nenhuma oficina continua com acesso');
select tests.ok((select end_reason = 'transfer' and transfer_id = :'tr' from public.motorcycle_ownerships where motorcycle_id = :'moto_x' and owner_user_id = :'B' and ended_at is not null order by ended_at desc limit 1), 'titularidade anterior encerrada pela transferência');

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok(not public.workshop_has_access(:'moto_x'), 'oficina perde o acesso na hora');
reset role;

-- Antigo titular
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok(not public.is_current_owner(:'moto_x'), 'antigo titular deixa de ser titular');
select tests.ok((select count(*) = 0 from public.maintenance_timeline where motorcycle_id = :'moto_x'), 'antigo titular não vê mais o histórico');
select tests.must_fail(format($$select public.create_maintenance_record(%L, 'revision', 'X', current_date)$$, :'moto_x'), 'antigo titular não registra mais');
select tests.must_fail(format($$select * from public.get_motorcycle_transfers(%L)$$, :'moto_x'), 'antigo titular não gerencia transferências');
select tests.ok((select count(*) = 1 from public.get_my_previous_motorcycles() where motorcycle_id = :'moto_x'), 'moto aparece em "motos anteriores"');
reset role;

-- ===== Limite do plano de quem recebe
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.create_transfer_request(:'moto_b', 'ana@teste.local') as tr2 \gset
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.accept_transfer_request(%L)$$, :'tr2'), 'quem recebe respeita o limite do plano');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.cancel_transfer_request(:'tr2');
select tests.ok((select status = 'canceled' from public.get_motorcycle_transfers(:'moto_b') where id = :'tr2'), 'titular cancela o pedido');

-- ===== Recusa
select public.create_transfer_request(:'moto_b', 'carlos@teste.local') as tr3 \gset
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.reject_transfer_request(:'tr3');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select status = 'rejected' from public.get_motorcycle_transfers(:'moto_b') where id = :'tr3'), 'comprador recusa');
select tests.ok(public.is_current_owner(:'moto_b'), 'recusa mantém o titular');
reset role;

-- ===== Pedido vencido
select set_config('request.jwt.claim.sub', '', false);
update public.system_settings set value = '0' where key = 'transfer_request_days';
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.create_transfer_request(:'moto_b', 'admin@teste.local') as tr4 \gset
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.system_settings set value = '7' where key = 'transfer_request_days';
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((select count(*) = 0 from public.get_my_incoming_transfers()), 'pedido vencido não aparece para o comprador');
select tests.must_fail(format($$select public.accept_transfer_request(%L)$$, :'tr4'), 'pedido vencido não é aceito');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select status = 'expired' from public.get_motorcycle_transfers(:'moto_b') where id = :'tr4'), 'titular vê o pedido como expirado');
select public.create_transfer_request(:'moto_b', 'admin@teste.local') as tr5 \gset
select tests.ok((select status = 'canceled' from public.get_motorcycle_transfers(:'moto_b') where id = :'tr4'), 'novo pedido encerra o vencido');
select public.cancel_transfer_request(:'tr5');
reset role;

-- ===== Integridade
select set_config('request.jwt.claim.sub', '', false);
select tests.must_fail($$delete from public.transfer_requests$$, 'transferências não são apagadas');
select tests.must_fail(format($$update public.transfer_requests set status = 'pending', decided_at = null where id = %L$$, :'tr'), 'transferência aceita não volta');
select tests.must_fail(format($$update public.transfer_requests set to_email = 'x@y.com' where id = %L$$, :'tr5'), 'destino não muda');
select tests.ok((select count(*) >= 6 from public.audit_logs where entity_type = 'transfer_requests'), 'transferências auditadas');

\echo '=== TODOS OS TESTES DA FASE 4 (TRANSFERÊNCIA) PASSARAM ==='
