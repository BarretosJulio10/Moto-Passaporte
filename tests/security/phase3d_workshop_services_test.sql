-- =============================================================================
-- Testes da Fase 3 — registro de serviço pela oficina (banco de TESTE; após phase3c)
-- Estado herdado: B é titular de moto_x, com a "Oficina do Carlos" (C) autorizada;
-- a "Oficina da Ana" (A) está autorizada só na outra moto de B.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 3: serviços registrados pela oficina'
select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_c from public.workshops where public_slug = 'oficina-do-carlos' \gset
select organization_id as org_a from public.workshops where public_slug = 'oficina-da-ana' \gset
select a.id as acc_c, a.motorcycle_id as moto_x from public.motorcycle_workshop_access a
 where a.organization_id = :'org_c' and a.status = 'approved' limit 1 \gset

-- Titular registra algo com valor, observação e comprovante (privados para a oficina)
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.create_maintenance_record(:'moto_x', 'tires', 'Pneu comprado pelo dono', current_date - 20,
  p_service_value_cents => 70000, p_notes => 'Segredo do dono') ->> 'id' as rec_owner \gset
select :'moto_x' || '/eeeeeeee-0000-0000-0000-000000000001.pdf' as path_owner \gset
insert into storage.objects (bucket_id, name, metadata) values ('attachments', :'path_owner', '{"size": 5000, "mimetype": "application/pdf"}');
select public.register_attachment(:'moto_x', :'path_owner', 'nf-dono.pdf', 'invoice', :'rec_owner');
reset role;

-- ===== Oficina registra
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.create_workshop_service(:'org_c', :'moto_x', 'revision', 'Revisão dos 30 mil km', current_date - 1,
  p_description => 'Troca de óleo, filtro e ajuste de corrente', p_mileage => 30500, p_service_value_cents => 45000,
  p_notes => 'Cliente pediu orçamento de pneus',
  p_items => '[{"item_name":"Óleo 10W40","brand":"Motul","quantity":3},{"item_name":"Filtro de óleo"}]') ->> 'id' as rec_ws \gset
reset role;
select set_config('request.jwt.claim.sub', '', false);
select tests.ok((select source_type = 'workshop' and organization_id = :'org_c' and workshop_name = 'Oficina do Carlos'
                   and recorded_by_name = 'Carlos' and created_by = :'C' from public.maintenance_records where id = :'rec_ws'),
                'serviço registrado como oficina, com oficina e funcionário');
select tests.ok((select count(*) = 2 from public.maintenance_items where maintenance_record_id = :'rec_ws'), 'peças registradas');
select tests.ok((select source_type = 'workshop' and organization_id = :'org_c' and mileage = 30500
                   from public.mileage_records where id = (select mileage_record_id from public.maintenance_records where id = :'rec_ws')),
                'km entra no histórico como leitura da oficina');

-- Visão da oficina: técnico de todos; valor, observações e comprovantes só dos próprios
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.ok((select is_own and service_value_cents = 45000 and notes is not null and recorded_by_name = 'Carlos' and evidence_level = 'workshop'
                   from public.get_workshop_timeline(:'org_c', :'moto_x') where id = :'rec_ws'), 'oficina vê tudo do próprio registro');
select tests.ok((select not is_own and service_value_cents is null and notes is null and attachments = '[]'::jsonb and title = 'Pneu comprado pelo dono'
                   from public.get_workshop_timeline(:'org_c', :'moto_x') where id = :'rec_owner'), 'registro do dono: só dados técnicos');
select tests.ok((select count(*) = 0 from public.attachments where maintenance_record_id = :'rec_owner'), 'oficina não vê comprovante do dono');
select tests.ok((select count(*) = 0 from storage.objects where name = :'path_owner'), 'oficina não lê arquivo do dono');
select tests.ok((select count(*) = 0 from public.maintenance_records), 'oficina não lê a tabela diretamente');

-- Comprovante da oficina
select :'moto_x' || '/eeeeeeee-0000-0000-0000-000000000002.jpg' as path_ws \gset
insert into storage.objects (bucket_id, name, metadata) values ('attachments', :'path_ws', '{"size": 80000, "mimetype": "image/jpeg"}');
select tests.ok(true, 'oficina autorizada envia arquivo para a pasta da moto');
select public.register_workshop_attachment(:'org_c', :'path_ws', 'os-123.jpg', 'service_order', :'rec_ws') as att_ws \gset
select tests.ok((select organization_id = :'org_c' from public.attachments where id = :'att_ws'), 'comprovante marcado com a oficina');
select tests.ok(((public.get_workshop_storage_usage(:'org_c') ->> 'used_bytes')::bigint = 80000), 'conta na cota da oficina');
select tests.ok((select jsonb_array_length(attachments) = 1 from public.get_workshop_timeline(:'org_c', :'moto_x') where id = :'rec_ws'), 'oficina vê o próprio comprovante');
select tests.ok((select count(*) = 1 from storage.objects where name = :'path_ws'), 'oficina lê o próprio arquivo');
select tests.must_fail(format($$select public.register_workshop_attachment(%L, %L, 'x.pdf', 'invoice', %L)$$, :'org_c', :'path_owner', :'rec_owner'), 'oficina não anexa em registro do dono');

-- Correção só pela própria oficina
select public.create_workshop_service(:'org_c', :'moto_x', 'revision', 'Revisão dos 30 mil km', current_date - 1,
  p_mileage => 30500, p_items => '[]', p_corrects_record_id => :'rec_ws', p_correction_reason => 'Faltou a vela') ->> 'id' as rec_ws2 \gset
select tests.ok((select status = 'superseded' from public.get_workshop_timeline(:'org_c', :'moto_x') where id = :'rec_ws'), 'correção preserva o original');
select tests.must_fail(format($$select public.create_workshop_service(%L, %L, 'revision', 'X', current_date, p_corrects_record_id => %L, p_correction_reason => 'tentativa')$$, :'org_c', :'moto_x', :'rec_owner'), 'oficina não corrige registro do dono');
reset role;

-- Titular vê o serviço confirmado, com oficina e funcionário, e o comprovante
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select evidence_level = 'workshop' and workshop_name = 'Oficina do Carlos' and recorded_by_name = 'Carlos'
                   from public.maintenance_timeline where id = :'rec_ws2'), 'titular vê "confirmado por oficina" com oficina e funcionário');
select tests.ok((select count(*) = 1 from public.attachments where id = :'att_ws'), 'titular vê comprovante da oficina');
select tests.ok(((public.get_storage_usage() ->> 'used_bytes')::bigint =
                 (select coalesce(sum(file_size), 0) from public.attachments where organization_id is null and diary_entry_id is null)),
                'comprovante da oficina fora da cota do titular');
select tests.must_fail(format($$select public.create_maintenance_record(%L, 'revision', 'X', current_date, p_corrects_record_id => %L, p_correction_reason => 'tentativa')$$, :'moto_x', :'rec_ws2'), 'titular não corrige registro da oficina');
select tests.must_fail(format($$select public.create_workshop_service(%L, %L, 'revision', 'X', current_date)$$, :'org_c', :'moto_x'), 'titular não registra como oficina');
reset role;

-- Outras oficinas e funcionários sem permissão
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.create_workshop_service(%L, %L, 'revision', 'X', current_date)$$, :'org_a', :'moto_x'), 'oficina sem autorização na moto não registra');
select tests.must_fail(format($$select public.create_workshop_service(%L, %L, 'revision', 'X', current_date)$$, :'org_c', :'moto_x'), 'não membro não registra pela oficina');
select tests.must_fail(format($$select * from public.get_workshop_timeline(%L, %L)$$, :'org_a', :'moto_x'), 'oficina sem autorização não vê histórico');
select tests.must_fail(format($$insert into storage.objects (bucket_id, name, metadata) values ('attachments', %L, '{}')$$, :'moto_x' || '/eeeeeeee-0000-0000-0000-000000000009.jpg'), 'oficina sem autorização não envia arquivo');
reset role;

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.create_org_invite(:'org_c', 'admin@teste.local', true, false) ->> 'token' as tok_d \gset
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.accept_org_invite(:'tok_d');
select tests.ok((select count(*) >= 1 from public.get_workshop_timeline(:'org_c', :'moto_x')), 'funcionário vê o histórico da moto autorizada');
select tests.must_fail(format($$select public.create_workshop_service(%L, %L, 'revision', 'X', current_date)$$, :'org_c', :'moto_x'), 'funcionário sem permissão não registra');
reset role;

-- Revogação corta na hora
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.revoke_workshop_access(:'acc_c');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.create_workshop_service(%L, %L, 'revision', 'X', current_date)$$, :'org_c', :'moto_x'), 'revogada não registra');
select tests.must_fail(format($$select * from public.get_workshop_timeline(%L, %L)$$, :'org_c', :'moto_x'), 'revogada não vê histórico');
select tests.ok((select count(*) = 0 from storage.objects where name = :'path_ws'), 'revogada não abre mais os arquivos');
reset role;

select set_config('request.jwt.claim.sub', '', false);
select tests.ok((select count(*) = 2 from public.maintenance_records where organization_id = :'org_c'), 'registros da oficina continuam após a revogação');
select tests.must_fail(format($$delete from public.maintenance_records where id = %L$$, :'rec_ws'), 'registros da oficina não são apagados');

\echo '=== TODOS OS TESTES DA FASE 3 (SERVIÇOS DA OFICINA) PASSARAM ==='
