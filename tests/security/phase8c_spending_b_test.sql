-- =============================================================================
-- PRD 2.2 — Controle de Gastos, Fase B (ADR-051): despesas avulsas, km, projeção, todas as motos.
-- Banco de TESTE, depois de phase8b.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set T '88888888-8888-8888-8888-888888888881'
\set A '11111111-1111-1111-1111-111111111111'

\echo '--- PRD 2.2 Fase B: despesas avulsas'
select set_config('request.jwt.claim.sub', '', false);
update public.system_settings set value = '90'::jsonb where key = 'welcome_premium_days';
insert into auth.users (id, email, raw_user_meta_data) values
  (:'T', 'despesas@teste.local', '{"full_name":"Tiago Despesas","terms_accepted":true,"terms_version":"1.0","privacy_version":"1.0"}');

select set_config('request.jwt.claim.sub', :'T', false);
set role authenticated;
select public.register_motorcycle('Honda', 'CG 160', 2022, 'DSP-2B34', 10000) ->> 'motorcycle_id' as moto \gset
select public.record_mileage(:'moto', 12000, current_date);
select public.create_maintenance_record(:'moto', 'oil_change', 'Troca de óleo', current_date, p_service_value_cents => 9000);
select public.save_owner_expense(null, :'moto', 'fuel', current_date, 5000, 'Tanque cheio', 12000) ->> 'id' as e1 \gset
select public.save_owner_expense(null, :'moto', 'insurance', (current_date - interval '20 days')::date, 100000, 'Seguro anual') ->> 'id' as e2 \gset
select tests.must_fail(format($$select public.save_owner_expense(null, %L, 'pizza', current_date, 100)$$, :'moto'), 'categoria inválida recusada');
select tests.must_fail(format($$select public.save_owner_expense(null, %L, 'fuel', current_date + 5, 100)$$, :'moto'), 'data no futuro recusada');
select tests.must_fail(format($$select public.save_owner_expense(null, %L, 'fuel', current_date, 0)$$, :'moto'), 'valor zero recusado');
select tests.must_fail(format($$insert into public.owner_expenses (user_id, motorcycle_id, category, value_cents, expense_date) values (%L, %L, 'fuel', 1, current_date)$$, :'T', :'moto'),
                       'gravação direta na tabela bloqueada');

select public.get_spending_summary(:'moto', (current_date - interval '60 days')::date, current_date) as s \gset
select tests.ok((:'s'::jsonb ->> 'total_cents')::bigint = 114000 and (:'s'::jsonb ->> 'service_cents')::bigint = 9000
                and (:'s'::jsonb ->> 'expense_cents')::bigint = 105000, 'total soma serviços e despesas avulsas');
select tests.ok((:'s'::jsonb ->> 'km')::int = 2000 and (:'s'::jsonb ->> 'cost_per_km_cents')::numeric = 57.00, 'km rodados e custo por km');
select tests.ok((select count(*) from jsonb_array_elements(:'s'::jsonb -> 'by_workshop')) = 1, 'por oficina só tem serviços');
select tests.ok((select x ->> 'kind' from jsonb_array_elements(:'s'::jsonb -> 'by_category') x where x ->> 'category' = 'insurance') = 'expense',
                'categoria de despesa marcada como despesa');
select tests.ok((public.get_spending_summary(:'moto', null, null, 'ownership', null, null, null, false, 'expense') ->> 'total_cents')::bigint = 105000,
                'filtro de tipo: só despesas');
select tests.ok((public.get_spending_summary(:'moto', null, null, 'ownership', null, '', null) ->> 'total_cents')::bigint = 9000,
                'filtro de oficina não mistura despesas');
select tests.ok(jsonb_array_length(public.get_spending_entries(:'moto')) = 3
                and (public.get_spending_entries(:'moto', p_kind => 'expense') -> 0 ->> 'kind') = 'expense', 'lista de lançamentos do recorte');
select tests.ok((public.get_spending_summary(null) -> 'by_motorcycle' -> 0 ->> 'cents')::bigint = 114000, 'todas as motos: total por moto');
-- Km: menos de 2 leituras ou menos de 100 km = dados insuficientes
select tests.ok((public.get_spending_summary(:'moto', '2000-01-01', '2000-12-31') ->> 'km') is null, 'sem leituras no período: km insuficiente');

-- Edição e exclusão auditadas
select public.save_owner_expense(:'e1', :'moto', 'fuel', current_date, 6000, 'Tanque cheio');
select public.delete_owner_expense(:'e2');
select tests.ok((public.get_spending_summary(:'moto', (current_date - interval '60 days')::date, current_date) ->> 'total_cents')::bigint = 15000,
                'edição muda o total; apagada sai do total');
select tests.ok(not exists (select 1 from public.owner_expenses where id = :'e2'), 'despesa apagada some da leitura');
reset role;
select tests.ok((select count(*) from public.audit_logs where entity_type = 'owner_expense' and entity_id = :'e2' and action = 'delete') = 1
                and (select count(*) from public.audit_logs where entity_type = 'owner_expense' and entity_id = :'e1' and action = 'update') = 1,
                'edição e exclusão ficam na auditoria');
select tests.ok(not exists (select 1 from public.audit_logs where entity_type = 'owner_expense' and new_data ? 'description'),
                'auditoria sem a descrição');

-- Comprovante: só na pasta da própria pessoa, conta na cota
select set_config('request.jwt.claim.sub', :'T', false);
set role authenticated;
insert into storage.objects (bucket_id, name, metadata)
values ('expense-receipts', :'T' || '/aaaaaaaa-0000-4000-8000-0000000000e1.jpg', '{"mimetype":"image/jpeg","size":4096}');
select (public.get_storage_usage() ->> 'used_bytes')::bigint as used0 \gset
select public.save_owner_expense(:'e1', :'moto', 'fuel', current_date, 6000, 'Tanque cheio', null,
       :'T' || '/aaaaaaaa-0000-4000-8000-0000000000e1.jpg', 'nota.jpg');
select tests.ok((public.get_storage_usage() ->> 'used_bytes')::bigint = :used0 + 4096, 'comprovante conta na cota');
select tests.ok((public.get_spending_entries(:'moto', p_kind => 'expense') -> 0 ->> 'receipt_name') = 'nota.jpg', 'comprovante aparece na lista');
select tests.must_fail(format($$insert into storage.objects (bucket_id, name, metadata) values ('expense-receipts', %L, '{"mimetype":"image/jpeg","size":1}')$$,
                              :'A' || '/aaaaaaaa-0000-4000-8000-0000000000e2.jpg'), 'não envia para a pasta de outra pessoa');
select public.save_owner_expense(:'e1', :'moto', 'fuel', current_date, 6000, 'Tanque cheio', null, null, null, true) ->> 'remove_path' as rp \gset
select tests.ok(:'rp' = :'T' || '/aaaaaaaa-0000-4000-8000-0000000000e1.jpg', 'remover comprovante devolve o arquivo a apagar');
reset role;

-- Outra pessoa não vê nem mexe
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok((select count(*) from public.owner_expenses) = 0, 'outra conta não lê despesas alheias');
select tests.must_fail(format($$select public.save_owner_expense(null, %L, 'fuel', current_date, 100)$$, :'moto'), 'não lança despesa em moto alheia');
select tests.must_fail(format($$select public.save_owner_expense(%L, %L, 'fuel', current_date, 100)$$, :'e1', :'moto'), 'não edita despesa alheia');
select tests.must_fail(format($$select public.delete_owner_expense(%L)$$, :'e1'), 'não apaga despesa alheia');
select tests.must_fail(format($$select public.get_spending_entries(%L)$$, :'moto'), 'não lista lançamentos de moto alheia');
select tests.ok((select count(*) from storage.objects where bucket_id = 'expense-receipts') = 0, 'não vê comprovantes alheios');
reset role;
set role anon;
select tests.must_fail(format($$select public.save_owner_expense(null, %L, 'fuel', current_date, 100)$$, :'moto'), 'visitante não lança');
reset role;

-- Gratuito: limite por mês e sem análise
update public.premium_grants set revoked_at = now() where user_id = :'T';
update public.system_settings set value = '2'::jsonb where key = 'free_expenses_per_month';
select set_config('request.jwt.claim.sub', :'T', false);
set role authenticated;
select tests.ok((public.get_spending_snapshot(:'moto') ->> 'expenses_left_this_month')::int = 1, 'gratuito vê quantas despesas ainda pode lançar');
select public.save_owner_expense(null, :'moto', 'washing', current_date, 3000);
select tests.must_fail(format($$select public.save_owner_expense(null, %L, 'washing', current_date, 3000)$$, :'moto'), 'gratuito para no limite do mês');
select public.save_owner_expense(:'e1', :'moto', 'fuel', current_date, 7000);
select tests.ok(true, 'editar não conta no limite');
select public.get_spending_summary(:'moto') as f \gset
select tests.ok(not (:'f'::jsonb ? 'km') and not (:'f'::jsonb ? 'by_motorcycle') and not (:'f'::jsonb ? 'year_projection_cents'),
                'gratuito não recebe custo por km, projeção nem todas as motos');
select tests.ok((public.get_spending_snapshot() ->> 'year_cents')::bigint >= 19000, 'cartão do painel soma despesas');
reset role;
update public.system_settings set value = '10'::jsonb where key = 'free_expenses_per_month';

\o
\echo '=== TODOS OS TESTES DA FASE B DE GASTOS PASSARAM ==='
