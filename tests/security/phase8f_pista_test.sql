-- =============================================================================
-- App da Pista (PWA do mecânico, ADR-057). Banco de TESTE, depois das fases 7 e 8.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'
\echo '--- App da Pista'

select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_c from public.workshops where public_slug = 'oficina-do-carlos' \gset
select customer_id as cust, id as veh from public.workshop_vehicles where organization_id = :'org_c' limit 1 \gset
update public.organization_members set can_execute_orders = true where organization_id = :'org_c' and user_id = :'D';

-- Responsável abre uma OS sem mecânico
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_create_order_manual(:'org_c', :'cust', :'veh', 'presencial', 'Cliente Teste', null,
  '[{"kind":"labor","description":"Trocar óleo","quantity":"1","unit_price_cents":"5000"},{"kind":"part","description":"Filtro","quantity":"1","unit_price_cents":"3000"}]', 20000) as os \gset
reset role;
select id as it1 from public.workshop_service_order_items where order_id = :'os' and position = 1 \gset

-- Mecânico (D)
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.pista_context() as ctx \gset
select tests.ok(exists (select 1 from jsonb_array_elements(:'ctx'::jsonb) e where e ->> 'organization_id' = :'org_c' and not (e ->> 'is_responsible')::boolean),
                'mecânico com "Executar OS" vê a oficina na pista');
select public.pista_list_orders(:'org_c') as l \gset
select tests.ok(exists (select 1 from jsonb_array_elements(:'l'::jsonb) e where e ->> 'id' = :'os'), 'OS sem mecânico aparece para pegar');
select tests.ok(not (:'l'::jsonb::text ~ 'unit_price|subtotal|total_cents|phone|whatsapp'), 'lista da pista sem preços nem contato');
select public.pista_get_order(:'org_c', :'os') as g \gset
select tests.ok(jsonb_array_length(:'g'::jsonb -> 'items') = 2 and not (:'g'::jsonb::text ~ 'unit_price|subtotal|phone|whatsapp|cpf'),
                'OS na pista com itens, sem preços nem contato');
select public.pista_set_status(:'org_c', :'os', 'in_progress');
select tests.must_fail(format($$select public.pista_set_status(%L, %L, 'completed')$$, :'org_c', :'os'), 'pista não conclui nem entrega');
select public.pista_set_item(:'org_c', :'os', :'it1', 'done');
select public.pista_set_item(:'org_c', :'os', :'it1', 'done');
select public.pista_add_note(:'org_c', :'os', 'aaaaaaaa-1111-4111-8111-000000000001', 'Retentor vazando, avisar cliente', :'it1') as n1 \gset
select tests.ok(public.pista_add_note(:'org_c', :'os', 'aaaaaaaa-1111-4111-8111-000000000001', 'Retentor vazando, avisar cliente') = :'n1'::uuid,
                'nota repetida pela fila não duplica');
select tests.must_fail(format($$select public.pista_add_note(%L, %L, 'aaaaaaaa-1111-4111-8111-000000000002', '   ')$$, :'org_c', :'os'), 'nota vazia recusada');
reset role;
select tests.ok((select mechanic_user_id = :'D' and status = 'in_progress' from public.workshop_service_orders where id = :'os'), 'iniciar pela pista pega a OS');
select tests.ok((select status = 'done' and executed_by = :'D' from public.workshop_service_order_items where id = :'it1'), 'item marcado como feito, com autor');
select tests.ok((select count(*) = 1 from public.workshop_os_notes where order_id = :'os'), 'uma nota só');
select tests.ok(not has_table_privilege('authenticated', 'public.workshop_os_notes', 'select')
                and not has_table_privilege('authenticated', 'public.workshop_os_audios', 'insert'), 'tabelas novas só por função');

-- Áudio: arquivo conferido, idempotente, limites
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('workshop-files', :'org_c' || '/aaaaaaaa-2222-4222-8222-000000000001.m4a', :'D', '{"size": 64000, "mimetype": "audio/mp4"}'),
       ('workshop-files', :'org_c' || '/aaaaaaaa-2222-4222-8222-000000000002.jpg', :'D', '{"size": 90000, "mimetype": "image/jpeg"}');
select public.record_attachment_check(:'org_c' || '/aaaaaaaa-2222-4222-8222-000000000001.m4a', :'D', 'audio/mp4', true);
select public.record_attachment_check(:'org_c' || '/aaaaaaaa-2222-4222-8222-000000000002.jpg', :'D', 'image/jpeg', true);
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok(public.can_access_workshop_object(:'org_c' || '/aaaaaaaa-2222-4222-8222-000000000001.m4a', 'execute_orders'), 'mecânico pode enviar áudio no bucket da oficina');
select tests.must_fail(format($$select public.pista_add_audio(%L, %L, %L, 500)$$, :'org_c', :'os', :'org_c' || '/aaaaaaaa-2222-4222-8222-000000000001.m4a'), 'áudio acima de 2 min recusado');
select public.pista_add_audio(:'org_c', :'os', :'org_c' || '/aaaaaaaa-2222-4222-8222-000000000001.m4a', 32, 'barulho na relação') as au1 \gset
select tests.ok(public.pista_add_audio(:'org_c', :'os', :'org_c' || '/aaaaaaaa-2222-4222-8222-000000000001.m4a', 32) = :'au1'::uuid, 'áudio repetido pela fila não duplica');
select public.pista_add_photo(:'org_c', :'os', :'org_c' || '/aaaaaaaa-2222-4222-8222-000000000002.jpg', 'work', null) as ph \gset
select tests.ok(public.pista_add_photo(:'org_c', :'os', :'org_c' || '/aaaaaaaa-2222-4222-8222-000000000002.jpg', 'work', null) = :'ph'::uuid, 'foto repetida pela fila não duplica');
select tests.ok((public.pista_get_order(:'org_c', :'os') -> 'audios' -> 0 ->> 'title') = 'barulho na relação', 'áudio aparece na OS da pista');
select public.pista_mark_ready(:'org_c', :'os', 20150);
select tests.must_fail(format($$select public.pista_mark_ready(%L, %L, 100)$$, :'org_c', :'os'), 'km de saída menor que o de entrada recusado');
reset role;
select tests.ok((select status = 'ready' and km_out = 20150 from public.workshop_service_orders where id = :'os'), 'mecânico marca Pronto com km de saída');

-- Painel: responsável vê notas e áudios; outra oficina não
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.ok(jsonb_array_length(public.workshop_order_media(:'org_c', :'os') -> 'audios') = 1, 'painel vê o áudio da pista');
select public.pista_void_note(:'org_c', :'os', :'n1');
select public.workshop_set_pista_settings(:'org_c', false, false);
select public.workshop_set_order_status(:'org_c', :'os', 'in_progress', null);
reset role;
select tests.ok((select voided_at is not null from public.workshop_os_notes where id = :'n1'), 'responsável anula a nota (não apaga)');

-- Regras da oficina valem para o mecânico
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.pista_mark_ready(%L, %L, 20150)$$, :'org_c', :'os'), 'oficina pode reservar o "Pronto" ao responsável');
select tests.must_fail(format($$select public.workshop_set_pista_settings(%L, true, true)$$, :'org_c'), 'mecânico não muda as regras da pista');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_set_pista_settings(:'org_c', true, true);
reset role;

-- Quem não pode
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.pista_get_order(%L, %L)$$, :'org_c', :'os'), 'outra pessoa não abre a OS pela pista');
select tests.must_fail(format($$select public.pista_list_orders(%L)$$, :'org_c'), 'outra pessoa não lista OS da oficina');
reset role;
update public.organization_members set can_execute_orders = false where organization_id = :'org_c' and user_id = :'D';
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.pista_get_order(%L, %L)$$, :'org_c', :'os'), 'sem "Executar OS", o mecânico perde a pista');
select tests.ok(not exists (select 1 from jsonb_array_elements(public.pista_context()) e where e ->> 'organization_id' = :'org_c'), 'oficina some do contexto da pista');
reset role;
update public.organization_members set can_execute_orders = true where organization_id = :'org_c' and user_id = :'D';

-- Áudio vence 90 dias depois da entrega
alter table public.workshop_service_orders disable trigger workshop_service_orders_protect;
update public.workshop_service_orders set status = 'delivered', delivered_at = now() - interval '91 days' where id = :'os';
alter table public.workshop_service_orders enable trigger workshop_service_orders_protect;
select public.system_expire_workshop_audios();
select tests.ok((select storage_path is null and expired_at is not null from public.workshop_os_audios where id = :'au1'), 'áudio vencido: registro fica, arquivo sai');
select tests.ok(exists (select 1 from public.storage_unlinked_objects where name = 'workshop-files:' || :'org_c' || '/aaaaaaaa-2222-4222-8222-000000000001.m4a'),
                'arquivo do áudio vencido vai para a limpeza automática');
select tests.ok(not exists (select 1 from public.storage_unlinked_objects where name = 'workshop-files:' || :'org_c' || '/aaaaaaaa-2222-4222-8222-000000000002.jpg'),
                'foto registrada não entra na limpeza');
\o
\echo '=== TODOS OS TESTES DA PISTA PASSARAM ==='
