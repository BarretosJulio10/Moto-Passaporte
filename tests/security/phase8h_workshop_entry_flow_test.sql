-- =============================================================================
-- Fluxo da oficina, Fase B (ADR-060): entrada antes do orçamento. Banco de TESTE.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'
\echo '--- Entrada antes do orçamento'

select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_c from public.workshops where public_slug = 'oficina-do-carlos' \gset
select id as cust from public.workshop_customers where organization_id = :'org_c' and status = 'active' limit 1 \gset
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_save_vehicle(:'org_c', null, :'cust', '{"brand":"Honda","model":"Bros 160","plate":"ENT1A23"}') as veh \gset

-- Entrada: OS sem itens e sem autorização
select public.workshop_create_entry(:'org_c', :'cust', :'veh', 21000, 'Barulho na suspensão dianteira', null, true) as os \gset
select tests.must_fail(format($$select public.workshop_create_entry(%L, %L, %L)$$, :'org_c', :'cust', :'veh'), 'moto que já está na oficina não ganha segunda entrada');
select tests.must_fail(format($$select public.workshop_set_order_status(%L, %L, 'in_progress')$$, :'org_c', :'os'), 'entrada sem serviço autorizado não vai para execução');
select tests.must_fail(format($$select public.workshop_quote_from_order(%L, %L)$$, :'org_c', gen_random_uuid()), 'orçamento só de OS existente');
reset role;
select tests.ok((select opened_at_entry and status = 'awaiting_diagnosis' and km_in = 21000 and quote_id is null and auth_method is null
                   from public.workshop_service_orders where id = :'os'), 'entrada criada aguardando diagnóstico, sem autorização');
select tests.ok((select km = 21000 from public.workshop_vehicles where id = :'veh'), 'km da moto atualizado na entrada');

-- Diagnóstico pelo mecânico (D, com Executar OS) na pista
update public.organization_members set can_execute_orders = true, status = 'active' where organization_id = :'org_c' and user_id = :'D';
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.pista_mark_ready(%L, %L, 21010)$$, :'org_c', :'os'), 'pista não marca Pronto sem serviço autorizado');
select public.pista_mark_diagnosed(:'org_c', :'os', 'Retentor da bengala vazando');
reset role;
select tests.ok((select diagnosed_at is not null and mechanic_user_id = :'D' and technical_notes like '%Retentor%'
                   from public.workshop_service_orders where id = :'os'), 'diagnóstico registrado com autor e texto');

-- Orçamento a partir da entrada
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_quote_from_order(:'org_c', :'os') as q \gset
select tests.ok(public.workshop_quote_from_order(:'org_c', :'os') = :'q'::uuid, 'segundo clique abre o mesmo orçamento');
select (public.workshop_list_orders(:'org_c') -> 0) as row0 \gset
select tests.ok(exists (select 1 from jsonb_array_elements(public.workshop_list_orders(:'org_c')) e
                         where e ->> 'id' = :'os' and (e -> 'entry_quote' ->> 'id') = :'q' and (e ->> 'opened_at_entry')::boolean),
                'lista de OS traz o orçamento da entrada');
reset role;
select tests.ok((select entry_order_id = :'os' and v.problem like 'Barulho%' and v.diagnosis like '%Retentor%'
                   from public.workshop_quotes q join public.workshop_quote_versions v on v.quote_id = q.id and v.version_no = 1 where q.id = :'q'),
                'orçamento já nasce com problema e diagnóstico da entrada');
set role authenticated;
select public.workshop_save_quote_draft(:'org_c', :'q', '{"km":"21000","items":[{"kind":"labor","description":"Trocar retentores","quantity":"1","unit_price_cents":"12000"},{"kind":"part","description":"Retentor","quantity":"2","unit_price_cents":"3000"}]}');
select public.workshop_send_quote(:'org_c', :'q') ->> 'token' as tok \gset
reset role;
select tests.ok((select status = 'awaiting_approval' from public.workshop_service_orders where id = :'os'), 'OS aguarda aprovação do cliente');
set role anon;
select public.decide_quote_by_token(:'tok', '{1}', 'Cliente Teste', true, null, 'sessao-entrada') ;
reset role;

-- Aprovado: itens entram na MESMA OS
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_create_order_from_quote(:'org_c', :'q') as os2 \gset
select tests.ok(:'os2'::uuid = :'os'::uuid, 'aprovado entra na OS da entrada (sem OS nova)');
select tests.ok(public.workshop_create_order_from_quote(:'org_c', :'q') = :'os'::uuid, 'repetir não duplica');
select tests.ok((public.workshop_order_entry_info(:'org_c', :'os') ->> 'has_work')::boolean, 'tela da OS sabe que já há serviço');
select public.workshop_set_order_status(:'org_c', :'os', 'in_progress');
reset role;
select tests.ok((select status = 'in_progress' and quote_id = :'q' from public.workshop_service_orders where id = :'os'), 'com item autorizado a OS vai para execução');
select tests.ok((select count(*) = 1 and bool_and(source = 'quote' and quote_id = :'q') from public.workshop_service_order_items where order_id = :'os'),
                'só o item aprovado entrou, ligado ao orçamento');
select tests.ok((select count(*) = 1 from public.workshop_service_orders where quote_id = :'q'), 'uma OS só para o orçamento');
select tests.ok((select array_agg(kind order by created_at)::text[] @> array['created', 'diagnosed', 'quote_created', 'quote_items_added']
                   from public.workshop_service_order_events where order_id = :'os'), 'histórico da OS registra cada etapa');

-- O caminho antigo continua: OS manual exige autorização
select tests.must_fail(format($$insert into public.workshop_service_orders (organization_id, number, customer_id, status) values (%L, 99999, %L, 'open')$$, :'org_c', :'cust'),
                       'OS fora da entrada continua exigindo orçamento ou autorização');
select tests.ok(not has_function_privilege('authenticated', 'public.wo_has_work(uuid)', 'execute'), 'funções internas fechadas');


-- Fase D: hora em que entrou na etapa, WhatsApp na lista e tempo médio por etapa
select tests.ok((select status_changed_at >= created_at from public.workshop_service_orders where id = :'os'), 'OS guarda quando entrou na etapa atual');
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.ok(exists (select 1 from jsonb_array_elements(public.workshop_list_orders(:'org_c')) e where e ->> 'id' = :'os' and e ? 'status_changed_at' and e ? 'customer_whatsapp'),
                'lista traz hora da etapa e WhatsApp do cliente');
select tests.ok((public.workshop_stage_times(:'org_c', current_date - 30, current_date) ? 'total_hours'), 'relatório de tempo por etapa responde');
reset role;
update public.organization_members set can_manage_quotes = false, can_manage_finance = false where organization_id = :'org_c' and user_id = :'D';
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_stage_times(%L, current_date - 30, current_date)$$, :'org_c'), 'mecânico sem relatórios não vê tempos');
reset role;

\o
\echo 'Entrada antes do orçamento: ok'
