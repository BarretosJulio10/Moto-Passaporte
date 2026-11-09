-- =============================================================================
-- PRD 2.1 — Fase 1 do módulo Oficina: clientes, preços, orçamentos e aprovação (banco de TESTE)
-- Estado herdado: Oficina do Carlos (C responsável, D funcionário), Oficina da Ana (A),
-- B titular de motos. Duas oficinas diferentes para provar o isolamento (§26.4).
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- PRD 2.1 Fase 1: clientes, catálogo, orçamentos e aprovação'
select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_c from public.workshops where public_slug = 'oficina-do-carlos' \gset
select organization_id as org_a from public.workshops where public_slug = 'oficina-da-ana' \gset
select count(*) as maint_before from public.maintenance_records \gset
select (select motorcycle_id from public.motorcycle_workshop_access where organization_id = :'org_c' and status = 'approved' limit 1) as moto_ok,
       (select m.id from public.motorcycles m where not exists (select 1 from public.motorcycle_workshop_access a
          where a.motorcycle_id = m.id and a.organization_id = :'org_c' and a.status = 'approved') limit 1) as moto_no \gset

-- ===== Permissões
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.ok((public.get_my_workshop_permissions(:'org_c') ->> 'manage_prices')::boolean, 'responsável tem todas as permissões');
select public.workshop_save_customer(:'org_c', null,
  '{"full_name":"João da Silva","whatsapp":"(17) 99999-1234","email":"JOAO@EXEMPLO.COM","cpf":"123.456.789-01","source":"whatsapp"}') as cust \gset
select public.workshop_save_vehicle(:'org_c', null, :'cust',
  '{"brand":"Honda","model":"CG 160","year":"2022","displacement_cc":"160","plate":"abc-1d23","km":"18000"}') as veh \gset
select public.workshop_save_service(:'org_c', null, '{"name":"Troca de óleo","category":"lubrificacao","default_price_cents":"5000"}') as svc \gset
select public.workshop_save_service(:'org_c', null, '{"name":"Troca de relação","category":"transmissao"}') as svc2 \gset
select public.workshop_save_price_table(:'org_c', null, 'Tabela padrão', null, true, true) as tbl \gset
select public.workshop_save_price_rule(:'org_c', null, format('{"table_id":"%s","service_id":"%s","cc_min":"100","cc_max":"300","price_cents":"6000"}', :'tbl', :'svc')::jsonb);
select public.workshop_save_price_rule(:'org_c', null, format('{"table_id":"%s","service_id":"%s","brand":"Honda","model":"CG 160","price_cents":"5500"}', :'tbl', :'svc')::jsonb);
select public.workshop_save_price_rule(:'org_c', null, format('{"table_id":"%s","service_id":"%s","brand":"Yamaha","model":"Fazer","price_cents":"9999"}', :'tbl', :'svc')::jsonb);
reset role;
select tests.ok((select whatsapp = '17999991234' and email = 'joao@exemplo.com' and cpf = '12345678901' and created_by = :'C'
                   from public.workshop_customers where id = :'cust'), 'cliente salvo com telefone/CPF só dígitos e autor');
select tests.ok((select plate = 'ABC1D23' and motorcycle_id is null from public.workshop_vehicles where id = :'veh'),
                'moto da oficina sem vínculo automático com passaporte');

set role authenticated;
select tests.ok((public.workshop_suggest_price(:'org_c', :'svc', :'veh') ->> 'price_cents')::int = 5500, 'preço: marca+modelo vence a faixa de cilindrada');
select tests.ok((public.workshop_suggest_price(:'org_c', :'svc', null) ->> 'source') = 'default', 'preço: sem moto usa o valor padrão');
select tests.ok((public.workshop_suggest_price(:'org_c', :'svc2', :'veh') ->> 'source') = 'none', 'preço: sem regra nem padrão fica em aberto');

-- Vínculo com passaporte só com autorização aprovada
select tests.must_fail(format($$select public.workshop_link_vehicle_passport(%L, %L, %L)$$, :'org_c', :'veh', :'moto_no'),
                       'vínculo com passaporte sem autorização é bloqueado');
reset role;

-- Funcionário: orçamento sim, preço não
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok(public.workshop_save_customer(:'org_c', null, '{"full_name":"Maria Funcionária Cadastrou"}') is not null, 'atendente cadastra cliente');
select tests.must_fail(format($$select public.workshop_save_service(%L, null, '{"name":"Serviço X"}')$$, :'org_c'), 'atendente sem permissão não mexe em preços');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select id as mem_d from public.get_org_members(:'org_c') where not is_me limit 1 \gset
select public.set_org_member_extra_permissions(:'mem_d', false, false);
select tests.must_fail(format($$select public.set_org_member_extra_permissions(id, true, true) from public.get_org_members(%L) where is_me$$, :'org_c'),
                       'ninguém muda as próprias permissões');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_save_customer(%L, null, '{"full_name":"Bloqueado"}')$$, :'org_c'), 'sem permissão de orçamento não cadastra');
select tests.ok(jsonb_array_length(public.workshop_list_customers(:'org_c')) >= 2, 'mas continua consultando os clientes da oficina');
reset role;

-- ===== Isolamento entre oficinas
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_list_customers(%L)$$, :'org_c'), 'oficina A não lista clientes da oficina B');
select tests.must_fail(format($$select public.workshop_get_customer(%L, %L)$$, :'org_c', :'cust'), 'oficina A não abre cliente da oficina B');
select tests.ok((select count(*) = 0 from public.workshop_customers), 'oficina A não lê a tabela de clientes de B');
select tests.ok((select count(*) = 0 from public.workshop_service_prices), 'oficina A não lê preços de B');
select tests.must_fail(format($$select public.workshop_create_quote(%L, %L)$$, :'org_a', :'cust'), 'oficina A não usa cliente de B no próprio orçamento');
select tests.must_fail(format($$select public.workshop_save_vehicle(%L, %L, %L, '{"brand":"X","model":"Y"}')$$, :'org_a', :'veh', :'cust'),
                       'oficina A não altera moto de B');
select tests.must_fail($$insert into public.workshop_customers (organization_id, full_name) values (gen_random_uuid(), 'Direto')$$,
                       'gravação direta na tabela é bloqueada');
reset role;
select tests.must_fail(format($$update public.workshop_customers set organization_id = %L where id = %L$$, :'org_a', :'cust'),
                       'a oficina de um registro não pode ser trocada');

-- ===== Orçamento
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_create_quote(:'org_c', :'cust', :'veh') as q1 \gset
select public.workshop_save_quote_draft(:'org_c', :'q1', format('{
  "km":"18200","problem":"Barulho na corrente","diagnosis":"Relação gasta","payment_terms":"Pix ou cartão","estimated_days":"2",
  "discount_type":"percent","discount_value":"10",
  "items":[{"kind":"labor","description":"Troca de óleo","service_id":"%s","quantity":"1","unit_price_cents":"5500"},
           {"kind":"part","description":"Kit relação","quantity":"1","unit_price_cents":"25000"},
           {"kind":"labor","description":"Revisão de freios","quantity":"1","unit_price_cents":"8000"}]}', :'svc')::jsonb) as tot \gset
select tests.ok((:'tot'::jsonb ->> 'subtotal_cents')::int = 38500 and (:'tot'::jsonb ->> 'discount_cents')::int = 3850
                and (:'tot'::jsonb ->> 'total_cents')::int = 34650, 'totais e desconto calculados no servidor');
select tests.ok((select number >= 1 and status = 'draft' from public.workshop_quotes where id = :'q1'), 'orçamento numerado em rascunho');
select public.workshop_send_quote(:'org_c', :'q1') ->> 'token' as tok1 \gset
select tests.must_fail(format($$select public.workshop_save_quote_draft(%L, %L, '{"items":[]}')$$, :'org_c', :'q1'),
                       'orçamento enviado não é editado em silêncio');
reset role;
select tests.must_fail(format($$update public.workshop_quote_versions set total_cents = 1 where quote_id = %L$$, :'q1'),
                       'versão enviada é imutável até para o banco');
select tests.must_fail(format($$update public.workshop_quote_items set unit_price_cents = 1 where version_id in (select id from public.workshop_quote_versions where quote_id = %L)$$, :'q1'),
                       'itens enviados são imutáveis');
select tests.ok((select count(*) = 0 from public.workshop_quote_shares where token_hash = :'tok1'), 'o banco guarda só o hash do token');

-- Página pública (anônimo)
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select tests.ok((public.get_quote_by_token('x') ->> 'state') = 'not_found', 'token inválido não revela nada');
select tests.ok((public.get_quote_by_token(:'tok1') ->> 'state') = 'open', 'cliente abre o link sem conta');
select tests.ok(position('cpf' in public.get_quote_by_token(:'tok1')::text) = 0
                and position(:'cust' in public.get_quote_by_token(:'tok1')::text) = 0, 'link sem CPF nem ids internos');
select tests.must_fail($$select * from public.workshop_quotes$$, 'anônimo não lê tabela de orçamentos');
reset role;
select tests.ok((select status = 'viewed' from public.workshop_quotes where id = :'q1'), 'abertura marca como visualizado');
select tests.ok((select count(*) = 1 from public.notifications where user_id = :'C' and kind = 'quote_viewed'), 'oficina avisada uma vez da visualização');

-- Nova versão invalida o link antigo
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_revise_quote(%L, %L, '')$$, :'org_c', :'q1'), 'nova versão exige motivo');
select public.workshop_revise_quote(:'org_c', :'q1', 'Cliente pediu pastilha original') as v2 \gset
select public.workshop_send_quote(:'org_c', :'q1') ->> 'token' as tok2 \gset
reset role;
select tests.ok(:'v2'::int = 2 and (select status = 'superseded' from public.workshop_quote_versions where quote_id = :'q1' and version_no = 1),
                'versão 1 preservada como substituída');
set role anon;
select tests.ok((public.get_quote_by_token(:'tok1') ->> 'state') = 'replaced', 'link da versão antiga não vale mais');
select tests.must_fail(format($$select public.decide_quote_by_token(%L, '{1}', 'João da Silva', true)$$, :'tok1'), 'versão antiga não pode ser aprovada');
select tests.must_fail(format($$select public.decide_quote_by_token(%L, '{1}', 'João da Silva', false)$$, :'tok2'), 'aprovação exige confirmação explícita');
select tests.must_fail(format($$select public.decide_quote_by_token(%L, '{9}', 'João da Silva', true)$$, :'tok2'), 'item inexistente recusado');
-- Aprovação parcial: óleo e relação sim, freios não
select public.decide_quote_by_token(:'tok2', '{1,2}', 'João da Silva', true, null, 'sessao-teste-123') as dec \gset
select tests.ok((:'dec'::jsonb -> 'decision' ->> 'decision') = 'partial'
                and (:'dec'::jsonb -> 'decision' ->> 'approved_total_cents')::int = 27450
                and (:'dec'::jsonb -> 'decision' ->> 'receipt_code') ~ '^[0-9A-F]{10}$', 'aprovação parcial recalcula o total e gera comprovante');
select tests.must_fail(format($$select public.decide_quote_by_token(%L, '{1,2,3}', 'João da Silva', true)$$, :'tok2'), 'token não é reutilizado');
reset role;
select tests.ok((select status = 'partially_approved' and approved_total_cents = 27450 from public.workshop_quotes where id = :'q1'), 'orçamento parcialmente aprovado');
select tests.ok((select approved_positions = '{1,2}' and rejected_positions = '{3}' and terms_version = 'orcamento-v1'
                   and session_id = 'sessao-teste-123' and signer_name = 'João da Silva' from public.workshop_quote_approvals where quote_id = :'q1'),
                'aceite registra itens, pessoa, termos e sessão');
select tests.must_fail(format($$update public.workshop_quote_approvals set approved_total_cents = 0 where quote_id = %L$$, :'q1'), 'aceite é imutável');
select tests.ok((select count(*) = 1 from public.notifications where user_id = :'C' and kind = 'quote_decided'), 'oficina avisada da decisão');
select tests.ok((select count(*) = 0 from public.notifications where user_id = :'D' and kind = 'quote_decided'), 'funcionário sem permissão de orçamento não recebe');

-- Complementar (§7.6)
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_revise_quote(%L, %L, 'mudar')$$, :'org_c', :'q1'), 'aprovado não vira nova versão: só complementar');
select public.workshop_create_quote(:'org_c', :'cust', null, :'q1', 'Rolamento da roda com folga') as q2 \gset
select public.workshop_save_quote_draft(:'org_c', :'q2', '{"items":[{"kind":"part","description":"Rolamento","quantity":"2","unit_price_cents":"3000"}]}');
select public.workshop_send_quote(:'org_c', :'q2') ->> 'token' as tok3 \gset
reset role;
select tests.ok((select vehicle_id = :'veh' and parent_quote_id = :'q1' and status = 'sent' from public.workshop_quotes where id = :'q2'),
                'complementar herda a moto e aguarda nova aprovação');
select tests.ok((select status = 'partially_approved' from public.workshop_quotes where id = :'q1'), 'original continua como estava');
set role anon;
select tests.ok((public.get_quote_by_token(:'tok3') ->> 'is_complement')::boolean, 'cliente vê que é complementar');
select public.decide_quote_by_token(:'tok3', '{}', 'João da Silva', true, 'Vou ver depois');
reset role;
select tests.ok((select status = 'rejected' and approved_total_cents = 0 from public.workshop_quotes where id = :'q2'), 'recusa integral com motivo');

-- Vencimento e revogação
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_create_quote(:'org_c', :'cust', :'veh') as q3 \gset
select public.workshop_save_quote_draft(:'org_c', :'q3', '{"items":[{"kind":"labor","description":"Lavagem","quantity":"1","unit_price_cents":"4000"}]}');
select public.workshop_send_quote(:'org_c', :'q3') ->> 'token' as tok4 \gset
select public.workshop_create_quote(:'org_c', :'cust', :'veh') as q4 \gset
select public.workshop_save_quote_draft(:'org_c', :'q4', '{"items":[{"kind":"labor","description":"Ajuste","quantity":"1","unit_price_cents":"2000"}]}');
select public.workshop_send_quote(:'org_c', :'q4') ->> 'token' as tok5 \gset
select public.workshop_revoke_quote_link(:'org_c', :'q4');
reset role;
alter table public.workshop_quote_versions disable trigger workshop_quote_versions_protect;
update public.workshop_quote_versions set valid_until = (now() at time zone 'America/Sao_Paulo')::date - 1 where quote_id = :'q3';
alter table public.workshop_quote_versions enable trigger workshop_quote_versions_protect;
select tests.ok(public.workshop_expire_quotes() >= 1, 'rotina diária vence orçamentos sem resposta');
set role anon;
select tests.ok((public.get_quote_by_token(:'tok4') ->> 'state') = 'expired', 'link vencido mostra que expirou');
select tests.must_fail(format($$select public.decide_quote_by_token(%L, '{1}', 'João da Silva', true)$$, :'tok4'), 'token vencido não aprova');
select tests.ok((public.get_quote_by_token(:'tok5') ->> 'state') = 'revoked', 'link revogado não abre');
select tests.must_fail(format($$select public.decide_quote_by_token(%L, '{1}', 'João da Silva', true)$$, :'tok5'), 'link revogado não aprova');
reset role;

-- Trilha e painel
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_log_quote_event(:'org_c', :'q1', 'whatsapp_prepared');
select public.workshop_get_quote(:'org_c', :'q1') as full_q \gset
select tests.ok(jsonb_array_length(:'full_q'::jsonb -> 'versions') = 2
                and (select count(*) >= 6 from jsonb_array_elements(:'full_q'::jsonb -> 'events'))
                and position('"ip"' in :'full_q') = 0 and position('"cpf"' in :'full_q') = 0, 'histórico com versões e eventos, sem IP nem CPF');
select public.workshop_dashboard(:'org_c') as dash \gset
select tests.ok((:'dash'::jsonb ->> 'approved_cents_period')::int >= 27450 and (:'dash'::jsonb ->> 'customers')::int >= 2, 'painel soma o aprovado do período');
select tests.ok(jsonb_array_length(public.workshop_list_quotes(:'org_c', 'won')) >= 1 and
                jsonb_array_length(public.workshop_list_quotes(:'org_c', null, 'abc1d')) >= 1, 'lista filtra por situação e por placa');
reset role;

-- Titular e outra oficina não enxergam
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select count(*) = 0 from public.workshop_quotes) and (select count(*) = 0 from public.workshop_quote_approvals),
                'proprietário não acessa dados comerciais da oficina');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_get_quote(%L, %L)$$, :'org_c', :'q1'), 'oficina A não abre orçamento de B');
select tests.must_fail(format($$select public.workshop_get_quote(%L, %L)$$, :'org_a', :'q1'), 'nem trocando o id da oficina');
reset role;

select tests.ok((select count(*) from public.maintenance_records) = :maint_before, 'orçamento (criado, enviado ou aprovado) não gera manutenção');

\o
\echo '=== TODOS OS TESTES DA FASE 1 DO MÓDULO OFICINA PASSARAM ==='
