-- =============================================================================
-- PRD 2.1 — Fase 4 do módulo Oficina: peças, financeiro, agenda, lembretes, relacionamento, relatórios
-- (banco de TESTE; após phase7c). Oficina do Carlos (C responsável; D funcionário sem gestão).
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'
\set E '55555555-5555-5555-5555-555555555555'

\echo '--- PRD 2.1 Fase 4: gestão da oficina'
select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_c from public.workshops where public_slug = 'oficina-do-carlos' \gset
select organization_id as org_a from public.workshops where public_slug = 'oficina-da-ana' \gset
select o.id as os, o.customer_id as cust, o.final_total_cents as due from public.workshop_service_orders o
 where o.organization_id = :'org_c' and o.final_total_cents is not null order by o.number limit 1 \gset

-- ===== Peças
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_save_part(:'org_c', null, '{"name":"Filtro de óleo","internal_code":"FO-160","manufacturer":"Fram","compatible_brand":"Honda","compatible_models":"CG 160, Bros 160","cost_cents":"1500","sale_cents":"3500"}') as part \gset
select tests.must_fail(format($$select public.workshop_save_part(%L, null, '{"name":"Outro","internal_code":"fo-160"}')$$, :'org_c'), 'código de peça não se repete na oficina');
select tests.ok((public.workshop_list_parts(:'org_c', 'bros') -> 0 ->> 'cost_cents')::int = 1500, 'busca por modelo compatível; custo visível para quem cuida de preços');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok(not (public.workshop_list_parts(:'org_c') -> 0 ? 'cost_cents'), 'custo da peça escondido de quem não cuida de preços');
select tests.must_fail(format($$select public.workshop_save_part(%L, null, '{"name":"Pastilha"}')$$, :'org_c'), 'sem permissão de preços não cadastra peça');

-- ===== Financeiro: só com a permissão
select tests.must_fail(format($$select public.workshop_record_payment(%L, %L, 100, 'pix')$$, :'org_c', :'os'), 'sem permissão financeira não registra recebimento');
select tests.must_fail(format($$select public.workshop_finance(%L, current_date - 30, current_date)$$, :'org_c'), 'sem permissão financeira não vê o financeiro');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_record_payment(:'org_c', :'os', 3000, 'pix', current_date, 'Sinal') as pay1 \gset
select tests.must_fail(format($$select public.workshop_record_payment(%L, %L, %s, 'dinheiro')$$, :'org_c', :'os', :due), 'não recebe mais do que o total da OS');
select tests.must_fail(format($$select public.workshop_record_payment(%L, %L, 100, 'pix', current_date + 1)$$, :'org_c', :'os'), 'data de recebimento no futuro é recusada');
select public.workshop_record_payment(:'org_c', :'os', :due - 3000, 'dinheiro') as pay2 \gset
select tests.ok((public.workshop_order_payments(:'org_c', :'os') ->> 'pending_cents')::int = 0, 'OS quitada');
select tests.must_fail(format($$select public.workshop_void_payment(%L, %L, '')$$, :'org_c', :'pay2'), 'estorno exige motivo');
select public.workshop_void_payment(:'org_c', :'pay2', 'Cliente pagou no cartão');
select public.workshop_finance(:'org_c', current_date - 30, current_date) as fin \gset
reset role;
select tests.ok((:'fin'::jsonb ->> 'received_cents')::int = 3000 and (:'fin'::jsonb -> 'by_method' ->> 'pix')::int = 3000
                and (select count(*) >= 1 from jsonb_array_elements(:'fin'::jsonb -> 'receivables') r where r ->> 'order_id' = :'os'),
                'recebido só sem estornos; OS volta para a lista de pendentes');
select tests.must_fail(format($$update public.workshop_payments set amount_cents = 1 where id = %L$$, :'pay1'), 'recebimento não é editado');
select tests.must_fail(format($$delete from public.workshop_payments where id = %L$$, :'pay1'), 'recebimento não é apagado');
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((select count(*) = 0 from public.workshop_payments), 'funcionário sem permissão não lê recebimentos');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select count(*) = 0 from public.workshop_payments), 'proprietário não lê o financeiro da oficina');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select id as mem_d from public.get_org_members(:'org_c') where not is_me limit 1 \gset
select public.set_org_member_extra_permissions(:'mem_d', null, null, null, true);
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((select count(*) >= 2 from public.workshop_payments), 'papel Financeiro libera os recebimentos');
reset role;

-- ===== Agenda
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_save_appointment(:'org_c', null, format('{"customer_id":"%s","starts_at":"%s","service_description":"Revisão","responsible_user_id":"%s"}',
  :'cust', (now() + interval '1 day')::text, :'D')::jsonb) as ap \gset
select tests.must_fail(format($$select public.workshop_save_appointment(%L, null, '{"starts_at":"%s","service_description":"X"}')$$, :'org_c', now()),
                       'agendamento exige cliente ou nome do contato');
select public.workshop_save_appointment(:'org_c', null, format('{"contact_name":"Pessoa Nova","contact_phone":"(17) 98888-0000","starts_at":"%s","service_description":"Orçamento de pneu"}',
  (now() + interval '2 days')::text)::jsonb);
select tests.ok(jsonb_array_length(public.workshop_list_appointments(:'org_c', now(), now() + interval '7 days')) = 2, 'agenda da semana');
select public.workshop_set_appointment_status(:'org_c', :'ap', 'no_show');
select tests.must_fail(format($$select public.workshop_save_appointment(%L, %L, '{"starts_at":"%s","service_description":"Y","contact_name":"Zé"}')$$, :'org_c', :'ap', now()),
                       'agendamento encerrado não é editado');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_list_appointments(%L, now() - interval '1 year', now() + interval '1 year')$$, :'org_c'), 'outra oficina não vê a agenda');
select tests.must_fail(format($$select public.workshop_record_payment(%L, %L, 100, 'pix')$$, :'org_a', :'os'), 'outra oficina não registra recebimento na OS alheia');
reset role;

-- ===== Lembretes, relacionamento e contatos
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_save_reminder(:'org_c', null, format('{"customer_id":"%s","kind":"date","title":"Trocar o óleo","due_date":"%s"}', :'cust', current_date + 3)::jsonb) as rem \gset
select tests.must_fail(format($$select public.workshop_save_reminder(%L, null, '{"customer_id":"%s","title":"Sem data"}')$$, :'org_c', :'cust'), 'lembrete precisa de data ou km');
select public.workshop_log_contact(:'org_c', :'cust', 'reminder', :'rem');
select public.workshop_relationship(:'org_c', 0, 0) as rel \gset
select tests.ok((select bool_or((r ->> 'id') = :'rem' and (r ->> 'due')::boolean and r ->> 'last_contact_at' is not null)
                   from jsonb_array_elements(:'rel'::jsonb -> 'reminders') r), 'lembrete vencendo aparece com o último contato');
select tests.ok(jsonb_array_length(:'rel'::jsonb -> 'inactive_customers') >= 1, 'clientes sem retorno no período configurado');
select tests.ok(jsonb_array_length(public.workshop_customer_contacts(:'org_c', :'cust') -> 'contacts') = 1, 'últimos contatos na ficha do cliente');
reset role;
select tests.must_fail($$update public.workshop_contact_log set note = 'x'$$, 'registro de contato é imutável');

-- ===== Relatórios
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_reports(:'org_c', current_date - 30, current_date) as rep \gset
reset role;
select tests.ok((:'rep'::jsonb -> 'commercial' ->> 'created')::int >= 1 and (:'rep'::jsonb -> 'operational' ->> 'completed')::int >= 1
                and (:'rep'::jsonb -> 'financial' ->> 'received_cents')::int = 3000 and jsonb_array_length(:'rep'::jsonb -> 'top_services') >= 1,
                'relatórios comercial, operacional e financeiro');

-- ===== Exclusão de conta de um funcionário: autoria vira vazia, registros ficam
insert into auth.users (id, email) values (:'E', 'eva@teste.local');
insert into public.organization_members (organization_id, user_id, role, status, can_manage_quotes)
values (:'org_c', :'E', 'staff', 'active', true);
select set_config('request.jwt.claim.sub', :'E', false);
set role authenticated;
select public.workshop_log_contact(:'org_c', :'cust', 'return');
reset role;
delete from auth.users where id = :'E';
select tests.ok((select count(*) = 1 from public.workshop_contact_log where reason = 'return' and created_by is null),
                'exclusão de conta preserva o registro e só tira o autor');

\o
\echo '=== TODOS OS TESTES DA FASE 4 DO MÓDULO OFICINA PASSARAM ==='
