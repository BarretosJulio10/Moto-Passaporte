-- =============================================================================
-- Testes da Fase 2 — registros de manutenção (banco de TESTE, após a Fase 1)
-- Uso: depois de phase1_rls_test.sql (reaproveita schema tests e usuários A/B).
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 2: registros de manutenção'
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;

select id as moto_a from public.motorcycles limit 1 \gset

select r->>'id' as rec1, (r->>'below_previous')::boolean as below1
from (select public.create_maintenance_record(
  :'moto_a', 'oil_change', 'Troca de óleo e filtro', current_date - 10,
  p_mileage => 16000, p_workshop_name => 'Oficina do Bairro', p_service_value_cents => 25000,
  p_items => '[{"item_name":"Óleo 10W40","brand":"Motul","quantity":3},{"item_name":"Filtro de óleo","part_number":"HF303"}]'::jsonb
) r) s \gset
select tests.ok(:'rec1' is not null, 'A cria registro com peças');
select tests.ok((select count(*) = 2 from public.maintenance_items where maintenance_record_id = :'rec1'), 'peças gravadas');
select tests.ok((select source_type = 'owner' from public.maintenance_records where id = :'rec1'), 'origem: informado pelo dono');
select tests.ok((select count(*) = 1 from public.mileage_records where note like 'Registrada com: Troca de óleo%'), 'km do serviço vira leitura de quilometragem');
select tests.ok((select status = 'current' and jsonb_array_length(items) = 2 from public.maintenance_timeline where id = :'rec1'), 'linha do tempo mostra registro vigente com peças');

select tests.must_fail(format($$update public.maintenance_records set title = 'x' where id = %L$$, :'rec1'), 'registro não pode ser editado');
select tests.must_fail(format($$delete from public.maintenance_records where id = %L$$, :'rec1'), 'registro não pode ser apagado');
select tests.must_fail($$insert into public.maintenance_records (motorcycle_id, category, title, service_date, source_type) values (gen_random_uuid(), 'other', 'xx', current_date, 'owner')$$, 'inserção direta bloqueada');
select tests.must_fail(format($$select public.create_maintenance_record(%L, 'other', 'Futuro', current_date + 1)$$, :'moto_a'), 'data futura recusada');
select tests.must_fail(format($$select public.create_maintenance_record(%L, 'other', 'Sem motivo', current_date, p_corrects_record_id => %L)$$, :'moto_a', :'rec1'), 'correção exige motivo');

-- Correção mantendo a mesma km: não duplica leitura
select (public.create_maintenance_record(
  :'moto_a', 'oil_change', 'Troca de óleo, filtro e vela', current_date - 10,
  p_mileage => 16000, p_items => '[{"item_name":"Óleo 10W40","quantity":3}]'::jsonb,
  p_corrects_record_id => :'rec1', p_correction_reason => 'Esqueci de incluir a vela')->>'id') as rec2 \gset
select tests.ok((select status = 'superseded' from public.maintenance_timeline where id = :'rec1'), 'original fica marcado como substituído');
select tests.ok((select status = 'current' and corrects_record_id = :'rec1' from public.maintenance_timeline where id = :'rec2'), 'correção é a versão vigente');
select tests.ok((select count(*) = 1 from public.mileage_records where note like 'Registrada com: Troca de óleo%'), 'correção com mesma km reaproveita a leitura');
select tests.must_fail(format($$select public.create_maintenance_record(%L, 'other', 'Outra', current_date, p_corrects_record_id => %L, p_correction_reason => 'de novo')$$, :'moto_a', :'rec1'), 'registro já corrigido não aceita segunda correção');

-- Correção mudando a km: leitura de correção
select public.create_maintenance_record(:'moto_a', 'oil_change', 'Troca de óleo, filtro e vela', current_date - 10,
  p_mileage => 16100, p_corrects_record_id => :'rec2', p_correction_reason => 'Km digitada errada') ->> 'id' as rec3 \gset
select tests.ok((select count(*) = 1 from public.mileage_records where note = 'Correção: Km digitada errada' and corrects_record_id is not null), 'km corrigida gera leitura de correção');

-- Anulação
select public.create_maintenance_record(:'moto_a', 'accessories', 'Baú lançado por engano', current_date) ->> 'id' as rec4 \gset
select public.void_maintenance_record(:'rec4', 'Era de outra moto') as void4 \gset
select tests.ok((select is_void and corrects_record_id = :'rec4' from public.maintenance_records where id = :'void4'), 'anulação registrada');
select tests.ok((select status = 'superseded' from public.maintenance_timeline where id = :'rec4'), 'registro anulado continua visível como substituído');
select tests.must_fail(format($$select public.void_maintenance_record(%L, 'de novo')$$, :'rec4'), 'não anula duas vezes');
select tests.must_fail(format($$select public.void_maintenance_record(%L, 'x')$$, :'void4'), 'anulação não pode ser anulada');

reset role;

-- ===== Isolamento
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select count(*) = 0 from public.maintenance_records where motorcycle_id = :'moto_a'), 'B não vê registros de A');
select tests.ok((select count(*) = 0 from public.maintenance_items), 'B não vê peças de A');
select tests.ok((select count(*) = 0 from public.maintenance_timeline where motorcycle_id = :'moto_a'), 'B não vê linha do tempo de A');
select tests.must_fail(format($$select public.create_maintenance_record(%L, 'other', 'Invasão', current_date)$$, :'moto_a'), 'B não registra na moto de A');
select tests.must_fail(format($$select public.void_maintenance_record(%L, 'Invasão')$$, :'rec2'), 'B não anula registro de A');
reset role;

set role anon;
select tests.must_fail($$select * from public.maintenance_records$$, 'anônimo não lê registros');
select tests.must_fail($$select * from public.maintenance_timeline$$, 'anônimo não lê linha do tempo');
reset role;

-- ===== Integridade com privilégio máximo
select set_config('request.jwt.claim.sub', '', false);
select tests.must_fail($$update public.maintenance_items set item_name = 'x'$$, 'peças imutáveis (dono do banco)');
select tests.must_fail($$delete from public.maintenance_records$$, 'registros não apagáveis (dono do banco)');
select tests.ok((select count(*) >= 5 from public.audit_logs where entity_type = 'maintenance_records'), 'registros auditados');

\echo '=== TODOS OS TESTES DA FASE 2 (MANUTENÇÃO) PASSARAM ==='
