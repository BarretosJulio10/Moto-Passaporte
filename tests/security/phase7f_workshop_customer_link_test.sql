-- =============================================================================
-- PRD 2.1 — Fase 5.1: vínculo do cliente com a conta, avisos do §23 e logotipo (banco de TESTE; após phase7e)
-- Oficina do Carlos (C responsável; D funcionário sem gestão). B = cliente com conta; A = outra conta.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- PRD 2.1 Fase 5.1: vínculo do cliente e avisos'
select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_c from public.workshops where public_slug = 'oficina-do-carlos' \gset
select o.id as os, o.customer_id as cust from public.workshop_service_orders o
 where o.organization_id = :'org_c' and o.final_total_cents is not null order by o.number limit 1 \gset
update public.workshop_service_orders set technical_notes = 'NOTA-INTERNA-SECRETA' where id = :'os';

-- ===== Convite: só quem atende cria; token guardado como hash
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_create_customer_invite(%L, %L)$$, :'org_c', :'cust'), 'funcionário sem atendimento não convida');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_create_customer_invite(:'org_c', :'cust') ->> 'token' as inv \gset
select public.workshop_create_order_link(:'org_c', :'os', 'receipt') ->> 'token' as rc \gset
reset role;
select tests.ok(not exists (select 1 from public.workshop_customer_invites where token_hash = :'inv'), 'convite guardado só como hash');

-- ===== Sem conta não vincula; com conta, prévia mínima e confirmação
set role anon;
select tests.must_fail(format($$select public.claim_workshop_customer('invite', %L)$$, :'inv'), 'sem conta não vincula');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.get_customer_link_preview('invite', :'inv') as pv \gset
select tests.ok(:'pv'::jsonb ->> 'state' = 'open' and not (:'pv'::jsonb ? 'phone') and position('@' in :'pv') = 0,
                'prévia mostra só oficina, primeiro nome e motos');
select tests.ok(public.get_customer_link_preview('invite', 'x') ->> 'state' = 'invalid', 'token inválido não revela nada');
select public.claim_workshop_customer('invite', :'inv');
select tests.ok(public.get_customer_link_preview('invite', :'inv') ->> 'state' = 'invalid', 'convite usado não serve de novo');
select tests.ok(public.get_customer_link_preview('order', :'rc') ->> 'state' = 'mine', 'link do comprovante reconhece o cadastro ligado');
select public.get_my_workshop_records() as rec \gset
reset role;
select tests.ok(jsonb_array_length(:'rec'::jsonb) = 1 and jsonb_array_length(:'rec'::jsonb -> 0 -> 'orders') >= 1,
                'cliente vê os atendimentos da oficina no painel');
select tests.ok(position('NOTA-INTERNA-SECRETA' in :'rec') = 0 and position('cost_cents' in :'rec') = 0, 'painel do cliente sem observações internas nem custos');

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.claim_workshop_customer('order', %L)$$, :'rc'), 'outra conta não toma um cadastro já ligado');
select tests.ok(public.get_my_workshop_records() = '[]'::jsonb, 'outra conta não vê nada');
reset role;
select tests.ok((select count(*) = 0 from public.workshop_customers c join public.workshop_vehicles v on v.customer_id = c.id
                  where c.user_id = :'A'), 'nenhuma ligação automática por placa ou telefone');

-- ===== Avisos ao cliente com conta
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_create_order_manual(:'org_c', :'cust', null, 'presencial', 'Cliente', null,
       '[{"description":"Regulagem de freio","unit_price_cents":3000,"quantity":1}]'::jsonb) as os2 \gset
select public.workshop_set_order_status(:'org_c', :'os2', 'awaiting_parts', '');
reset role;
select tests.ok((select count(*) = 2 from public.notifications where user_id = :'B' and kind = 'workshop_update' and dedupe_key like 'os:' || :'os2' || '%'),
                'cliente com conta é avisado da OS aberta e da mudança de situação');

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_save_appointment(:'org_c', null, jsonb_build_object('customer_id', :'cust', 'starts_at', now() + interval '2 days',
       'service_description', 'Revisão', 'responsible_user_id', :'D')) as ap \gset
select public.workshop_set_appointment_status(:'org_c', :'ap', 'canceled');
reset role;
select tests.ok(exists (select 1 from public.notifications where user_id = :'D' and kind = 'appointment_canceled'), 'responsável é avisado do cancelamento');
select tests.ok(exists (select 1 from public.notifications where user_id = :'B' and dedupe_key = 'appt:' || :'ap' || ':canceled'), 'cliente com conta é avisado do cancelamento');

-- ===== Lembrete vencendo: rotina diária, uma vez só
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_save_reminder(:'org_c', null, jsonb_build_object('customer_id', :'cust', 'kind', 'date', 'title', 'Trocar óleo',
       'due_date', current_date + 1)) as rem \gset
reset role;
select set_config('request.jwt.claim.sub', '', false);
select public.system_workshop_reminders() as n1 \gset
select public.system_workshop_reminders() as n2 \gset
select tests.ok(:n1 >= 1 and :n2 = 0, 'rotina avisa o lembrete vencendo uma única vez');
select tests.ok(exists (select 1 from public.notifications where user_id = :'C' and kind = 'workshop_reminder_due' and dedupe_key like 'reminder:' || :'rem' || '%')
                and exists (select 1 from public.notifications where user_id = :'B' and dedupe_key = 'reminder:' || :'rem'),
                'equipe e cliente com conta recebem o lembrete');

-- ===== Desfazer o vínculo
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_unlink_customer(%L, %L)$$, :'org_c', :'cust'), 'funcionário não desfaz vínculo');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.unlink_my_workshop_customer(:'cust');
select tests.ok(public.get_my_workshop_records() = '[]'::jsonb, 'cliente desfaz o vínculo pelo painel');
reset role;

-- ===== Logotipo do perfil nos documentos
select tests.ok((select logo_url like 'storage:workshop-files/%' from public.workshops where organization_id = :'org_c'),
                'logotipo enviado no perfil vale para orçamento e comprovante');

\o
\echo '=== TODOS OS TESTES DA FASE 5.1 DO MÓDULO OFICINA PASSARAM ==='
