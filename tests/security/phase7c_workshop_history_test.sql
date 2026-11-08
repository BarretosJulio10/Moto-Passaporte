-- =============================================================================
-- PRD 2.1 — Fase 3 do módulo Oficina: OS concluída vira registro no histórico (banco de TESTE; após phase7b)
-- Oficina da Ana (W = A) tem autorização aprovada numa moto; Oficina do Carlos (C) é a outra oficina.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'
\set W '11111111-1111-1111-1111-111111111111'

\echo '--- PRD 2.1 Fase 3: histórico permanente'
select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_w from public.workshops where public_slug = 'oficina-da-ana' \gset
select motorcycle_id as moto from public.motorcycle_workshop_access where organization_id = :'org_w' and status = 'approved' limit 1 \gset
select id as acc from public.motorcycle_workshop_access where organization_id = :'org_w' and status = 'approved' limit 1 \gset
select public.moto_owner(:'moto') as owner \gset
select count(*) as recs_before from public.maintenance_records where motorcycle_id = :'moto' \gset
select coalesce(max(mileage), 0) + 100 as km0 from public.mileage_records where motorcycle_id = :'moto' \gset

select set_config('request.jwt.claim.sub', :'W', false);
set role authenticated;
-- Cliente, moto vinculada ao passaporte, catálogo com categoria
select public.workshop_save_customer(:'org_w', null, '{"full_name":"Titular da Moto"}') as cust \gset
select public.workshop_save_vehicle(:'org_w', null, :'cust', '{"brand":"Honda","model":"CB 500F"}') as veh \gset
select public.workshop_save_vehicle(:'org_w', null, :'cust', '{"brand":"Yamaha","model":"Fazer"}') as veh_free \gset
select public.workshop_link_vehicle_passport(:'org_w', :'veh', :'moto');
select public.workshop_save_service(:'org_w', null, '{"name":"Troca de óleo e filtro","category":"lubrificacao"}') as svc \gset

-- Orçamento aprovado em parte → OS → conclusão com registro automático
select public.workshop_create_quote(:'org_w', :'cust', :'veh') as q \gset
select public.workshop_save_quote_draft(:'org_w', :'q', format('{"items":[
  {"kind":"labor","description":"Troca de óleo e filtro","service_id":"%s","quantity":"1","unit_price_cents":"6000"},
  {"kind":"part","description":"Filtro de óleo","service_id":"%s","quantity":"1","unit_price_cents":"4000"},
  {"kind":"labor","description":"Regular válvulas","quantity":"1","unit_price_cents":"20000"}]}', :'svc', :'svc')::jsonb);
select public.workshop_send_quote(:'org_w', :'q') ->> 'token' as tok \gset
reset role;
set role anon;
select public.decide_quote_by_token(:'tok', '{1,2,3}', 'Titular da Moto', true);
reset role;
set role authenticated;
select public.workshop_create_order_from_quote(:'org_w', :'q') as os \gset
select (public.workshop_order_history(:'org_w', :'os') ->> 'state') as st0 \gset
reset role;
select tests.ok(:'st0' = 'not_completed', 'OS aberta não vai para o histórico');
select tests.ok((select count(*) from public.maintenance_records where motorcycle_id = :'moto') = :recs_before,
                'orçamento aprovado e OS aberta não geram manutenção');
set role authenticated;
select tests.must_fail(format($$select public.workshop_publish_order_to_history(%L, %L)$$, :'org_w', :'os'), 'não publica antes de concluir');
select id as i1 from public.workshop_service_order_items where order_id = :'os' and position = 1 \gset
select id as i2 from public.workshop_service_order_items where order_id = :'os' and position = 2 \gset
select id as i3 from public.workshop_service_order_items where order_id = :'os' and position = 3 \gset
select public.workshop_update_order_item(:'org_w', :'os', :'i1', '{"status":"done"}');
select public.workshop_update_order_item(:'org_w', :'os', :'i2', '{"status":"done","part_brand":"Fram","part_code":"PH6017"}');
select public.workshop_update_order_item(:'org_w', :'os', :'i3', '{"status":"not_done","notes":"Cliente vai decidir depois"}');
select tests.ok((public.workshop_order_history(:'org_w', :'os') ->> 'suggested_category') = 'oil_change', 'categoria sugerida pelo catálogo');
select public.workshop_complete_order(:'org_w', :'os', :km0, 'Óleo 10W30', 0, null, '{"include_value": true}') as done \gset
reset role;
select tests.ok((:'done'::jsonb ->> 'history_state') = 'published' and (:'done'::jsonb ->> 'record_id') is not null, 'conclusão gera o registro no histórico');
select (:'done'::jsonb ->> 'record_id') as rec \gset
select tests.ok((select source_type = 'workshop' and organization_id = :'org_w' and created_by = :'W' and mileage = :km0
                   and category = 'oil_change' and service_value_cents = 10000 and description like '%OS nº%'
                   and description not like '%Regular válvulas%'
                   from public.maintenance_records where id = :'rec'), 'registro da oficina, com autor, km, valor só dos executados');
select tests.ok((select count(*) = 1 and bool_and(item_name = 'Filtro de óleo' and brand = 'Fram' and part_number = 'PH6017')
                   from public.maintenance_items where maintenance_record_id = :'rec'), 'peça executada com fabricante e código');
select tests.ok((select count(*) = 1 from public.notifications where user_id = :'owner' and kind = 'workshop_service' and dedupe_key = 'service:' || :'rec'),
                'titular avisado do novo registro');
select tests.ok((select maintenance_record_id = :'rec' from public.workshop_service_orders where id = :'os'), 'OS ligada ao registro');
select tests.ok((select evidence_level = 'workshop' from public.maintenance_timeline where id = :'rec'), 'classificação "confirmado por prestador" preservada');

set role authenticated;
select tests.must_fail(format($$select public.workshop_publish_order_to_history(%L, %L)$$, :'org_w', :'os'), 'uma OS gera um registro só');
reset role;
select tests.must_fail(format($$update public.workshop_service_orders set maintenance_record_id = null where id = %L$$, :'os'), 'OS concluída não muda');

-- Correção: registro novo, original preservado
set role authenticated;
select public.create_workshop_service(:'org_w', :'moto', 'oil_change', 'Troca de óleo e filtro (corrigido)', current_date, 'Corrigido',
  :km0, 10000, null, '[]', :'rec', 'Marca do filtro errada') ->> 'id' as rec2 \gset
reset role;
select tests.ok((select status = 'superseded' from public.maintenance_timeline where id = :'rec') and
                (select status = 'current' and correction_reason = 'Marca do filtro errada' from public.maintenance_timeline where id = :'rec2'),
                'correção gera evento novo e preserva o original com o motivo');

-- Moto sem passaporte: conclui, mas fica só no registro da oficina
set role authenticated;
select public.workshop_create_order_manual(:'org_w', :'cust', :'veh_free', 'presencial', 'Titular da Moto', null,
  '[{"kind":"labor","description":"Lavagem","unit_price_cents":"3000"}]') as os2 \gset
select id as j1 from public.workshop_service_order_items where order_id = :'os2' \gset
select public.workshop_update_order_item(:'org_w', :'os2', :'j1', '{"status":"done"}');
select public.workshop_complete_order(:'org_w', :'os2', 500, null) as done2 \gset
reset role;
select tests.ok((:'done2'::jsonb ->> 'history_state') = 'not_linked' and (select maintenance_record_id is null from public.workshop_service_orders where id = :'os2'),
                'moto sem passaporte: atendimento fica só na oficina');

-- Escolher não publicar e publicar depois; autorização revogada bloqueia
set role authenticated;
select public.workshop_create_order_manual(:'org_w', :'cust', :'veh', 'telefone', 'Titular da Moto', null,
  '[{"kind":"labor","description":"Ajuste de corrente","unit_price_cents":"2000"}]') as os3 \gset
select id as k1 from public.workshop_service_order_items where order_id = :'os3' \gset
select public.workshop_update_order_item(:'org_w', :'os3', :'k1', '{"status":"done"}');
select public.workshop_complete_order(:'org_w', :'os3', :km0 + 10, null, 0, null, '{"publish": false}') as done3 \gset
reset role;
select tests.ok((:'done3'::jsonb ->> 'history_state') = 'ready', 'oficina pode deixar para registrar depois');
select set_config('request.jwt.claim.sub', :'owner', false);
set role authenticated;
select public.revoke_workshop_access(:'acc');
reset role;
select set_config('request.jwt.claim.sub', :'W', false);
set role authenticated;
select tests.ok((public.workshop_order_history(:'org_w', :'os3') ->> 'state') = 'no_access', 'revogação aparece na OS');
select tests.must_fail(format($$select public.workshop_publish_order_to_history(%L, %L)$$, :'org_w', :'os3'), 'sem autorização vigente não registra no histórico');
reset role;
select tests.ok((select count(*) = 1 from public.maintenance_records where id = :'rec'), 'registros anteriores continuam preservados após a revogação');

-- Outra oficina e o titular
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_order_history(%L, %L)$$, :'org_w', :'os'), 'outra oficina não vê o histórico das OS');
reset role;

\o
\echo '=== TODOS OS TESTES DA FASE 3 DO MÓDULO OFICINA PASSARAM ==='
