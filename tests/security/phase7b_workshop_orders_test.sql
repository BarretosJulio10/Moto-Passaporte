-- =============================================================================
-- PRD 2.1 — Fase 2 do módulo Oficina: ordens de serviço (banco de TESTE; após phase7a)
-- Herdado da 7a: Oficina do Carlos (C responsável; D funcionário sem orçamento/preço),
-- orçamento q1 aprovado em parte (itens 1 e 2 sim, 3 recusado), complementar recusado.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- PRD 2.1 Fase 2: ordens de serviço'
select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_c from public.workshops where public_slug = 'oficina-do-carlos' \gset
select organization_id as org_a from public.workshops where public_slug = 'oficina-da-ana' \gset
select count(*) as maint_before from public.maintenance_records \gset
select id as q1, customer_id as cust, vehicle_id as veh from public.workshop_quotes
 where organization_id = :'org_c' and status = 'partially_approved' and parent_quote_id is null order by number limit 1 \gset
select id as q_rej from public.workshop_quotes where organization_id = :'org_c' and status = 'rejected' limit 1 \gset

-- ===== OS a partir do orçamento aprovado
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_create_order_from_quote(%L, %L)$$, :'org_c', :'q_rej'), 'orçamento recusado não vira OS');
select public.workshop_create_order_from_quote(:'org_c', :'q1') as os1 \gset
select tests.ok(public.workshop_create_order_from_quote(:'org_c', :'q1') = :'os1'::uuid, 'uma OS por orçamento (repetir devolve a mesma)');
reset role;
select tests.ok((select count(*) = 2 and bool_and(source = 'quote') and not bool_or(description = 'Revisão de freios')
                   from public.workshop_service_order_items where order_id = :'os1'), 'só os itens aprovados entram; o recusado fica de fora');
select tests.ok((select sum(subtotal_cents - discount_cents) = 27450 from public.workshop_service_order_items where order_id = :'os1'),
                'desconto do orçamento distribuído nos itens (total = aprovado)');
select tests.ok((select status = 'awaiting_execution' and number >= 1 and km_in = 18200 from public.workshop_service_orders where id = :'os1'),
                'OS numerada, aguardando execução, com km do orçamento');
select tests.must_fail(format($$update public.workshop_service_order_items set unit_price_cents = 1 where order_id = %L$$, :'os1'),
                       'valor e origem do item não mudam');
select tests.must_fail(format($$delete from public.workshop_service_order_items where order_id = %L$$, :'os1'), 'item da OS não é apagado');

-- Manual exige autorização registrada
set role authenticated;
select tests.must_fail(format($$select public.workshop_create_order_manual(%L, %L, %L, null, null, null, '[{"description":"Lavar","unit_price_cents":"2000"}]')$$, :'org_c', :'cust', :'veh'),
                       'OS sem orçamento exige forma e autor da autorização');
select public.workshop_create_order_manual(:'org_c', :'cust', :'veh', 'telefone', 'João da Silva', 'Ligou às 10h',
  '[{"kind":"labor","description":"Regular embreagem","quantity":"1","unit_price_cents":"3000"}]', 18300) as os2 \gset
select tests.must_fail(format($$select public.workshop_add_order_item(%L, %L, '{"description":"Extra"}', null, null, null)$$, :'org_c', :'os1'),
                       'item extra sem autorização é bloqueado');
select public.workshop_add_order_item(:'org_c', :'os1', '{"kind":"part","description":"Parafuso da coroa","quantity":"4","unit_price_cents":"250"}', 'presencial', 'João da Silva', null);
reset role;
select tests.ok((select source = 'manual' and auth_method = 'presencial' and subtotal_cents = 1000 from public.workshop_service_order_items
                   where order_id = :'os1' and description = 'Parafuso da coroa'), 'item extra fica com a autorização registrada');

-- ===== Equipe: mecânico e permissões (D ainda sem orçamento; com execução)
set role authenticated;
select tests.must_fail(format($$select public.workshop_update_order(%L, %L, '{"mechanic_user_id":"%s"}')$$, :'org_c', :'os1', :'A'),
                       'mecânico precisa ser da equipe');
select public.workshop_update_order(:'org_c', :'os1', format('{"mechanic_user_id":"%s","due_date":"%s"}', :'D', current_date + 2)::jsonb);
reset role;
select tests.ok((select count(*) = 1 from public.notifications where user_id = :'D' and kind = 'service_order_assigned'), 'mecânico avisado da OS');

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok(jsonb_array_length(public.workshop_list_orders(:'org_c')) = 1, 'mecânico sem gestão vê só as OS dele');
select tests.must_fail(format($$select public.workshop_complete_order(%L, %L, 19000, null)$$, :'org_c', :'os1'), 'mecânico não conclui nem fecha valores');
select id as it1 from public.workshop_service_order_items where order_id = :'os1' and position = 1 \gset
select id as it2 from public.workshop_service_order_items where order_id = :'os1' and position = 2 \gset
select id as it3 from public.workshop_service_order_items where order_id = :'os1' and position = 3 \gset
select public.workshop_update_order_item(:'org_c', :'os1', :'it1', '{"status":"done","part_brand":"Motul","notes":"Óleo 10W30"}');
select public.workshop_save_inspection(:'org_c', :'os1', 'entry',
  '{"items":{"carenagem":{"state":"avaria","note":"Risco no tanque"},"pneus":{"state":"ok"}},"fuel_level":"1/2","keys_count":"1","km":"18210"}');
select tests.must_fail(format($$select public.workshop_save_inspection(%L, %L, 'entry', '{"items":{"x":{"state":"quebrado"}}}')$$, :'org_c', :'os1'),
                       'estado inválido no checklist é recusado');
-- Foto: envio ao bucket privado + conferência simulada + registro
insert into storage.objects (bucket_id, name, metadata)
values ('workshop-files', :'org_c' || '/eeeeeeee-0000-0000-0000-0000000000a1.jpg', '{"size": 120000, "mimetype": "image/jpeg"}');
select public.workshop_register_os_photo(:'org_c', :'os1', :'org_c' || '/eeeeeeee-0000-0000-0000-0000000000a1.jpg', 'entry', 'Lado esquerdo') as ph1 \gset
reset role;
select tests.ok((select status = 'in_progress' from public.workshop_service_orders where id = :'os1'), 'primeiro item executado põe a OS em execução');
select tests.ok((select executed_by = :'D' and part_brand = 'Motul' from public.workshop_service_order_items where id = :'it1'), 'execução registra quem fez e a peça');

-- Isolamento: oficina A
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_get_order(%L, %L)$$, :'org_c', :'os1'), 'oficina A não abre OS de B');
select tests.must_fail(format($$select public.workshop_get_order(%L, %L)$$, :'org_a', :'os1'), 'nem trocando o id da oficina');
select tests.ok((select count(*) = 0 from public.workshop_service_orders) and (select count(*) = 0 from public.workshop_os_photos), 'tabelas de OS fechadas para outra oficina');
select tests.must_fail(format($$insert into storage.objects (bucket_id, name, metadata) values ('workshop-files', '%s/eeeeeeee-0000-0000-0000-0000000000b2.jpg', '{}')$$, :'org_c'),
                       'oficina A não envia arquivo na pasta de B');
select tests.must_fail(format($$select public.workshop_register_os_photo(%L, %L, '%s/eeeeeeee-0000-0000-0000-0000000000a1.jpg', 'entry')$$, :'org_a', :'os1', :'org_c'),
                       'oficina A não registra foto em OS de B');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select count(*) = 0 from public.workshop_service_orders) and (select count(*) = 0 from public.workshop_inspections),
                'proprietário não vê as OS da oficina');
reset role;

-- ===== Ciência do cliente na entrada
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_create_order_link(:'org_c', :'os1', 'entry_ack') ->> 'token' as tok_in \gset
select tests.must_fail(format($$select public.workshop_create_order_link(%L, %L, 'receipt')$$, :'org_c', :'os1'), 'comprovante só depois da conclusão');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tests.ok((public.get_service_order_by_token(:'tok_in') ->> 'purpose') = 'entry_ack'
                and public.get_service_order_by_token(:'tok_in') -> 'items' = 'null'::jsonb, 'cliente vê o checklist de entrada, sem valores');
select tests.must_fail(format($$select public.ack_service_order_entry(%L, 'João da Silva', false)$$, :'tok_in'), 'ciência exige confirmação');
select public.ack_service_order_entry(:'tok_in', 'João da Silva', true);
select tests.must_fail(format($$select public.ack_service_order_entry(%L, 'João da Silva', true)$$, :'tok_in'), 'ciência é registrada uma vez');
select tests.must_fail($$select * from public.workshop_service_orders$$, 'anônimo não lê a tabela de OS');
reset role;
select tests.ok((select customer_ack_name = 'João da Silva' and customer_ack_at is not null from public.workshop_inspections
                   where order_id = :'os1' and phase = 'entry'), 'ciência registrada com nome e hora');
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_save_inspection(%L, %L, 'entry', '{"items":{}}')$$, :'org_c', :'os1'),
                       'checklist de entrada trava depois da ciência');

-- ===== Conclusão
select tests.must_fail(format($$select public.workshop_complete_order(%L, %L, 19000, null)$$, :'org_c', :'os1'), 'não conclui com item pendente');
select public.workshop_update_order_item(:'org_c', :'os1', :'it2', '{"status":"not_done","notes":"Cliente vai trazer a peça"}');
select public.workshop_update_order_item(:'org_c', :'os1', :'it3', '{"status":"done"}');
select tests.must_fail(format($$select public.workshop_complete_order(%L, %L, 100, null)$$, :'org_c', :'os1'), 'km final menor que a entrada é recusado');
select tests.must_fail(format($$select public.workshop_complete_order(%L, %L, 18300, null, -500, '')$$, :'org_c', :'os1'), 'ajuste exige motivo');
select public.workshop_save_inspection(:'org_c', :'os1', 'exit', '{"items":{"teste_rodagem":{"state":"ok"}},"km":"18300"}');
select public.workshop_complete_order(:'org_c', :'os1', 18300, 'Relação fica para a próxima visita', -100, 'Arredondamento') as done \gset
reset role;
select tests.ok((:'done'::jsonb ->> 'final_total_cents')::int = 4950 + 1000 - 100, 'valor final = executados (com desconto) + ajuste');
select tests.ok((select status = 'completed' and receipt_code is not null and km_out = 18300 from public.workshop_service_orders where id = :'os1'),
                'OS concluída com comprovante e km final');
select tests.ok((select km = 18300 from public.workshop_vehicles where id = :'veh'), 'km da moto da oficina atualizado');
select tests.must_fail(format($$update public.workshop_service_order_items set status = 'done' where id = %L$$, :'it2'), 'itens travam depois de concluída');
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_cancel_order(%L, %L, 'teste')$$, :'org_c', :'os1'), 'OS concluída não é cancelada');
select public.workshop_create_order_link(:'org_c', :'os1', 'receipt') ->> 'token' as tok_rc \gset
select public.workshop_notify_pickup(:'org_c', :'os1');
select tests.must_fail(format($$select public.workshop_deliver_order(%L, %L, '')$$, :'org_c', :'os1'), 'entrega exige quem retirou');
select public.workshop_deliver_order(:'org_c', :'os1', 'João da Silva');
select public.workshop_cancel_order(:'org_c', :'os2', 'Cliente desistiu');
reset role;
set role anon;
select public.get_service_order_by_token(:'tok_rc') as rc \gset
select tests.ok((:'rc'::jsonb ->> 'final_total_cents')::int = 5850
                and (select count(*) = 1 from jsonb_array_elements(:'rc'::jsonb -> 'items') e where e ->> 'status' = 'not_done')
                and position('"ip"' in :'rc') = 0 and position(:'cust' in :'rc') = 0, 'comprovante mostra executados e não executados, sem ids nem IP');
reset role;
select tests.ok((select status = 'delivered' and delivered_to_name = 'João da Silva' from public.workshop_service_orders where id = :'os1'), 'entrega registrada');
select tests.ok((select count(*) >= 10 from public.workshop_service_order_events where order_id = :'os1'), 'cada passo fica no histórico da OS');
select tests.must_fail(format($$delete from public.workshop_service_order_events where order_id = %L$$, :'os1'), 'histórico da OS é imutável');
select tests.ok((select count(*) from public.maintenance_records) = :maint_before, 'OS concluída não cria manutenção nesta fase');

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.ok((public.workshop_orders_summary(:'org_c') ->> 'completed_period')::int >= 1, 'painel conta OS concluídas');
reset role;

\o
\echo '=== TODOS OS TESTES DA FASE 2 DO MÓDULO OFICINA PASSARAM ==='
