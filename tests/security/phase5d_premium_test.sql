-- =============================================================================
-- Testes da Fase 5.4 — benefícios Premium (banco de TESTE; após phase5c)
-- A: dono de motos (sem Premium no início); B: outro dono; D: administrador.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 5.4: benefícios Premium'

select m.id as moto_a from public.motorcycles m
  join public.motorcycle_ownerships o on o.motorcycle_id = m.id and o.ended_at is null
 where o.owner_user_id = :'A' order by m.created_at limit 1 \gset
select m.id as moto_b from public.motorcycles m
  join public.motorcycle_ownerships o on o.motorcycle_id = m.id and o.ended_at is null
 where o.owner_user_id = :'B' order by m.created_at limit 1 \gset

-- Catálogo
select tests.ok((select entitlements = '{}' and max_share_links = 3 from public.subscription_plans where kind = 'free'),
                'gratuito: sem benefícios extras, 3 links por moto');
select tests.ok((select bool_and(entitlements @> array['pdf_reports', 'maintenance_reminders'] and max_share_links = 10)
                 from public.subscription_plans where code in ('premium_mensal', 'premium_semestral', 'premium_anual')), 'Premium: relatórios, lembretes e 10 links');
select tests.must_fail($$update public.subscription_plans set entitlements = array['voar'] where kind = 'free'$$, 'benefício desconhecido recusado');
set role anon;
select tests.ok(public.get_public_plans() -> 1 -> 'entitlements' ? 'pdf_reports', 'site recebe os benefícios de cada plano');
reset role;

-- Gratuito: sem lembretes nem relatório
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok(not (public.get_my_plan() -> 'entitlements' ? 'maintenance_reminders'), 'painel informa benefícios do plano');
select tests.must_fail(format($$select public.create_reminder(%L, 'Troca de óleo', 'oil_change', 3000)$$, :'moto_a'), 'gratuito não cria lembrete');
select tests.must_fail(format($$select public.register_motorcycle_report(%L)$$, :'moto_a'), 'gratuito não gera relatório');
select tests.ok(jsonb_array_length(public.get_motorcycle_reminders(:'moto_a')) = 0, 'gratuito vê lista vazia');
-- Links: limite do gratuito
reset role;
update public.passport_shares set revoked_at = now() where motorcycle_id = :'moto_a' and revoked_at is null;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.create_passport_share(:'moto_a', 'L1');
select public.create_passport_share(:'moto_a', 'L2');
select public.create_passport_share(:'moto_a', 'L3');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok((select count(*) >= 3 from public.get_motorcycle_shares(:'moto_a') where status = 'active'), 'gratuito cria links até o limite');
select tests.must_fail(format($$select public.create_passport_share(%L, 'L4')$$, :'moto_a'), 'gratuito: 4º link ativo recusado');
reset role;

-- A vira Premium (assinatura com pagamento aprovado)
grant usage on schema tests to service_role;
grant execute on all functions in schema tests to service_role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.admin_set_billing_enabled(true);
reset role;
set role service_role;
select public.billing_prepare_subscription(:'A', 'premium_anual') as prep \gset
select public.billing_attach_checkout((:'prep'::jsonb ->> 'subscription_id')::uuid, 'pre_A2', 'https://www.mercadopago.com.br/x');
select public.billing_apply_payment('pay_A2', 'pre_A2', null, 'approved', 8990, now());
reset role;
select tests.ok((select entitlements @> array['pdf_reports'] and max_share_links = 10 from public.subscriptions
                 where id = (:'prep'::jsonb ->> 'subscription_id')::uuid), 'assinatura guarda os benefícios contratados');
-- Catálogo muda depois: contrato não muda
update public.subscription_plans set entitlements = '{}' where code = 'premium_anual';

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok(public.get_my_plan() -> 'entitlements' ? 'maintenance_reminders', 'benefícios contratados valem mesmo com o catálogo alterado');
select public.create_passport_share(:'moto_a', 'L4') ->> 'id' as l4 \gset
select tests.ok(:'l4' is not null, 'Premium: mais links ativos');

-- Lembretes
select tests.must_fail(format($$select public.create_reminder(%L, 'x', null, 3000)$$, :'moto_a'), 'nome curto demais recusado');
select tests.must_fail(format($$select public.create_reminder(%L, 'Sem gatilho')$$, :'moto_a'), 'lembrete sem gatilho recusado');
select tests.must_fail(format($$select public.create_reminder(%L, 'Dois gatilhos de tempo', null, null, 6, current_date + 10)$$, :'moto_a'), 'data e meses juntos recusados');
select tests.must_fail(format($$select public.create_reminder(%L, 'Km absurdo', null, 50)$$, :'moto_a'), 'intervalo de km fora da faixa recusado');
select public.create_reminder(:'moto_a', 'Troca de óleo', 'oil_change', 3000) as r_oil \gset
select public.create_reminder(:'moto_a', 'Revisão anual', 'revision', null, 12, null, null, null, current_date - 360) as r_rev \gset
select public.create_reminder(:'moto_a', 'Licenciamento', 'other', null, null, current_date - 1) as r_lic \gset
select public.get_motorcycle_reminders(:'moto_a') as list \gset
select tests.ok(jsonb_array_length(:'list'::jsonb) = 3, 'titular lista seus lembretes');
select tests.ok((select v ->> 'status' = 'ok' and (v ->> 'km_left')::int = 3000 from jsonb_array_elements(:'list'::jsonb) v where v ->> 'id' = :'r_oil'),
                'lembrete por km parte da quilometragem atual');
select tests.ok((select v ->> 'status' = 'soon' from jsonb_array_elements(:'list'::jsonb) v where v ->> 'id' = :'r_rev'), 'revisão perto do prazo: em breve');
select tests.ok((select v ->> 'status' = 'due' from jsonb_array_elements(:'list'::jsonb) v where v ->> 'id' = :'r_lic'), 'data passada: vencido');
select tests.ok((:'list'::jsonb -> 0 ->> 'status') = 'due', 'vencidos aparecem primeiro');
select tests.ok((select count(*) = 2 from jsonb_array_elements(public.get_my_due_reminders()) v), 'painel mostra vencidos e próximos');
reset role;

-- Quilometragem avança: lembrete de km vence
insert into public.mileage_records (motorcycle_id, mileage, recorded_at, source_type, created_by)
select :'moto_a', public.motorcycle_current_km(:'moto_a') + 3100, current_date, 'owner', :'A';
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok((select v ->> 'status' = 'due' from jsonb_array_elements(public.get_motorcycle_reminders(:'moto_a')) v where v ->> 'id' = :'r_oil'),
                'rodou além do intervalo: vencido');
select public.complete_reminder(:'r_oil');
select tests.ok((select v ->> 'status' = 'ok' and (v ->> 'km_left')::int = 3000 from jsonb_array_elements(public.get_motorcycle_reminders(:'moto_a')) v where v ->> 'id' = :'r_oil'),
                'concluir reinicia a contagem a partir de agora');
select public.complete_reminder(:'r_lic');
select tests.ok((select v ->> 'status' = 'done' from jsonb_array_elements(public.get_motorcycle_reminders(:'moto_a')) v where v ->> 'id' = :'r_lic'),
                'lembrete de data única fica concluído');
select public.set_reminder_paused(:'r_rev', true);
select tests.ok((select v ->> 'status' = 'paused' from jsonb_array_elements(public.get_motorcycle_reminders(:'moto_a')) v where v ->> 'id' = :'r_rev'), 'pausar');
select tests.ok(jsonb_array_length(public.get_my_due_reminders()) = 0, 'pausado e concluído saem do painel');
select public.update_reminder(:'r_oil', 'Troca de óleo e filtro', 'oil_change', 4000, null, null, 'Óleo 10W40');
select tests.ok((select (v ->> 'every_km')::int = 4000 and v ->> 'title' = 'Troca de óleo e filtro'
                 from jsonb_array_elements(public.get_motorcycle_reminders(:'moto_a')) v where v ->> 'id' = :'r_oil'), 'editar lembrete');
reset role;

-- Isolamento
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.must_fail(format($$select public.get_motorcycle_reminders(%L)$$, :'moto_a'), 'outro usuário não vê lembretes alheios');
select tests.must_fail(format($$select public.complete_reminder(%L)$$, :'r_oil'), 'outro usuário não conclui lembrete alheio');
select tests.must_fail(format($$select public.delete_reminder(%L)$$, :'r_oil'), 'outro usuário não exclui lembrete alheio');
select tests.must_fail($$select * from public.maintenance_reminders$$, 'tabela de lembretes sem acesso direto');
select tests.must_fail(format($$select public.create_reminder(%L, 'Invasão', null, 1000)$$, :'moto_a'), 'não cria lembrete em moto alheia');
reset role;

-- Relatório
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.register_motorcycle_report(:'moto_a') as rep \gset
select tests.ok(length(:'rep'::jsonb ->> 'reference') = 10, 'Premium gera relatório com referência');
select tests.must_fail(format($$select public.register_motorcycle_report(%L)$$, :'moto_b'), 'não gera relatório de moto alheia');
select tests.must_fail($$select * from public.motorcycle_reports$$, 'registro de relatórios sem acesso direto');
reset role;
select tests.ok((select count(*) = 1 from public.motorcycle_reports where motorcycle_id = :'moto_a'), 'geração registrada');

-- Fim do Premium: lembretes ficam visíveis e controláveis, mas não se criam novos
update public.subscriptions set current_period_end = now() - interval '1 day', status = 'canceled'
 where id = (:'prep'::jsonb ->> 'subscription_id')::uuid;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok(jsonb_array_length(public.get_motorcycle_reminders(:'moto_a')) = 3, 'após o Premium, lembretes continuam visíveis');
select tests.must_fail(format($$select public.create_reminder(%L, 'Pneus', 'tires', 8000)$$, :'moto_a'), 'após o Premium, não cria novos');
select tests.must_fail(format($$select public.update_reminder(%L, 'Óleo', 'oil_change', 3000, null, null, null)$$, :'r_oil'), 'após o Premium, não edita');
select public.set_reminder_paused(:'r_oil', true);
select public.delete_reminder(:'r_lic');
select tests.ok(jsonb_array_length(public.get_motorcycle_reminders(:'moto_a')) = 2, 'após o Premium, ainda pausa e exclui');
select tests.must_fail(format($$select public.register_motorcycle_report(%L)$$, :'moto_a'), 'após o Premium, sem novos relatórios');
reset role;

-- Admin edita benefícios
select id as anual from public.subscription_plans where code = 'premium_anual' \gset
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.admin_set_plan_benefits(:'anual', array['maintenance_reminders', 'pdf_reports', 'pdf_reports'], 12);
select tests.ok((select entitlements = array['maintenance_reminders', 'pdf_reports'] and max_share_links = 12 from public.admin_list_plans() where id = :'anual'),
                'admin define benefícios (sem repetição) e limite de links');
select version as vb from public.admin_list_plans() where id = :'anual' \gset
select public.admin_set_plan_benefits(:'anual', array['pdf_reports', 'maintenance_reminders'], null);
select tests.ok((select max_share_links = 12 and version = :vb from public.admin_list_plans() where id = :'anual'), 'sem mudança real não cria versão; limite nulo mantém');
select tests.must_fail(format($$select public.admin_set_plan_benefits(%L, array['voar'], 10)$$, :'anual'), 'benefício inválido recusado');
select tests.must_fail(format($$select public.admin_set_plan_benefits(%L, array['pdf_reports'], 99)$$, :'anual'), 'limite de links fora da faixa recusado');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.admin_set_plan_benefits(%L, array['pdf_reports'], 10)$$, :'anual'), 'usuário comum não altera benefícios');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.admin_set_billing_enabled(false);
reset role;
update public.subscription_plans set max_share_links = 10 where code = 'premium_anual';

\echo '=== TODOS OS TESTES DA FASE 5.4 (BENEFÍCIOS PREMIUM) PASSARAM ==='
