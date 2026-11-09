-- =============================================================================
-- PRD 2.2 — Controle de Gastos, Fase A (ADR-050) — banco de TESTE, depois de phase8a (bônus de boas-vindas ligado).
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set S '77777777-7777-7777-7777-777777777771'
\set A '11111111-1111-1111-1111-111111111111'

\echo '--- PRD 2.2 Fase A: gastos'
select set_config('request.jwt.claim.sub', '', false);
update public.system_settings set value = '90'::jsonb where key = 'welcome_premium_days';
insert into auth.users (id, email, raw_user_meta_data) values
  (:'S', 'gastos@teste.local', '{"full_name":"Sara Gastos","terms_accepted":true,"terms_version":"1.0","privacy_version":"1.0"}');
select tests.ok(exists (select 1 from public.subscription_plans where kind = 'premium' and 'spending_insights' = any (entitlements)),
                'Premium inclui o benefício de análise de gastos');

select set_config('request.jwt.claim.sub', :'S', false);
set role authenticated;
select public.register_motorcycle('Yamaha', 'Fazer 250', 2021, 'GST-1A23', 10000) ->> 'motorcycle_id' as moto \gset
-- Dois serviços no mês passado, um neste mês, um sem valor, um corrigido e um anulado
select public.create_maintenance_record(:'moto', 'tires', 'Pneu traseiro', (date_trunc('month', current_date) - interval '20 days')::date,
       p_workshop_name => 'Pneus Já', p_service_value_cents => 45000) ->> 'id' as r1 \gset
select public.create_maintenance_record(:'moto', 'brakes', 'Pastilhas', (date_trunc('month', current_date) - interval '10 days')::date,
       p_workshop_name => 'Pneus Já', p_service_value_cents => 12000) ->> 'id' as r2 \gset
select public.create_maintenance_record(:'moto', 'oil_change', 'Troca de óleo', current_date,
       p_service_value_cents => 9000) ->> 'id' as r3 \gset
select public.create_maintenance_record(:'moto', 'inspection', 'Revisão sem nota', current_date) ->> 'id' as r4 \gset
select public.create_maintenance_record(:'moto', 'brakes', 'Pastilhas', (date_trunc('month', current_date) - interval '10 days')::date,
       p_workshop_name => 'Pneus Já', p_service_value_cents => 15000, p_corrects_record_id => :'r2', p_correction_reason => 'Valor certo da nota') ->> 'id' as r2b \gset
select public.create_maintenance_record(:'moto', 'accessories', 'Baú errado', current_date, p_service_value_cents => 99900) ->> 'id' as r5 \gset
select public.void_maintenance_record(:'r5', 'Era de outra moto');

select public.get_spending_summary(:'moto', (current_date - interval '60 days')::date, current_date) as s \gset
select tests.ok((:'s'::jsonb ->> 'total_cents')::bigint = 69000, 'total = 450 + 150 (correção) + 90; anulado e substituído fora');
select tests.ok((:'s'::jsonb ->> 'entries')::int = 3 and (:'s'::jsonb ->> 'missing_values')::int = 1, 'conta lançamentos com valor e avisa o sem valor');
select tests.ok((select (x ->> 'cents')::bigint = 60000 from jsonb_array_elements(:'s'::jsonb -> 'by_workshop') x where x ->> 'workshop' = 'Pneus Já'),
                'por oficina soma a correção, não o original');
select tests.ok((:'s'::jsonb -> 'by_category' -> 0 ->> 'category') = 'tires', 'categorias do maior para o menor');
select tests.ok((select sum((m ->> 'cents')::bigint) = 69000 from jsonb_array_elements(:'s'::jsonb -> 'months') m), 'mês a mês fecha com o total');
select tests.ok((public.get_spending_summary(:'moto', null, null, 'ownership', 'brakes') ->> 'total_cents')::bigint = 15000, 'filtro de categoria');
select tests.ok((public.get_spending_summary(:'moto', null, null, 'ownership', null, '') ->> 'total_cents')::bigint = 9000, 'filtro "sem oficina"');
select tests.ok((public.get_spending_snapshot(:'moto') ->> 'month_cents')::bigint = 9000, 'cartão do mês');
select tests.ok((public.get_spending_snapshot() ->> 'year_missing')::int >= 1, 'cartão de todas as motos avisa sem valor');
select tests.must_fail($$select public.get_spending_summary(null, current_date, current_date, 'qualquer')$$, 'escopo inválido recusado');
reset role;

-- Só o dono vê
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.get_spending_summary(%L)$$, :'moto'), 'outra conta não vê os gastos da moto');
select tests.must_fail(format($$select public.get_spending_snapshot(%L)$$, :'moto'), 'outra conta não vê o cartão');
reset role;
set role anon;
select tests.must_fail(format($$select public.get_spending_summary(%L)$$, :'moto'), 'sem conta não vê nada');
reset role;
set role authenticated;
select tests.must_fail($$select public.sp_records('77777777-7777-7777-7777-777777777771', null, 'all')$$, 'função interna fechada');
reset role;

-- Gratuito: só totais
update public.premium_grants set revoked_at = now() where user_id = :'S';
select set_config('request.jwt.claim.sub', :'S', false);
set role authenticated;
select public.get_spending_summary(:'moto', (current_date - interval '60 days')::date, current_date) as f \gset
reset role;
select tests.ok((:'f'::jsonb ->> 'total_cents')::bigint = 69000 and not (:'f'::jsonb ? 'months') and not (:'f'::jsonb ? 'by_category')
                and (:'f'::jsonb ->> 'entitled')::boolean = false, 'gratuito vê o total, sem a análise');

-- Moto cadastrada pelo próprio dono: o histórico antigo lançado por ele conta todo
select set_config('request.jwt.claim.sub', :'S', false);
set role authenticated;
select tests.ok((public.get_spending_summary(:'moto') ->> 'ownership_start') is null, 'primeiro dono não tem corte de data');
reset role;
-- Moto comprada de outra pessoa: "desde a compra" exclui o que veio antes
alter table public.motorcycle_ownerships disable trigger user;
insert into public.motorcycle_ownerships (motorcycle_id, owner_user_id, started_at, ended_at, end_reason)
values (:'moto', :'A', now() - interval '2 years', now() - interval '1 year', 'transfer');
update public.motorcycle_ownerships set acquisition_date = current_date where motorcycle_id = :'moto' and ended_at is null;
alter table public.motorcycle_ownerships enable trigger user;
select set_config('request.jwt.claim.sub', :'S', false);
set role authenticated;
select tests.ok((public.get_spending_summary(:'moto') ->> 'total_cents')::bigint = 9000
                and (public.get_spending_summary(:'moto', null, null, 'all') ->> 'total_cents')::bigint = 69000,
                '"desde a compra" × "todo o histórico"');
reset role;

-- Origem segue a linha do tempo: serviço do dono com anexo conta como "Com comprovante"
alter table public.attachments disable trigger user;
insert into public.attachments (motorcycle_id, maintenance_record_id, storage_path, file_name, mime_type, file_size, kind)
values (:'moto', :'r1', :'moto' || '/' || gen_random_uuid() || '.jpg', 'nota.jpg', 'image/jpeg', 10, 'photo');
alter table public.attachments enable trigger user;
select set_config('request.jwt.claim.sub', :'S', false);
set role authenticated;
select tests.ok((public.get_spending_summary(:'moto', null, null, 'all', null, null, 'document') ->> 'total_cents')::bigint = 45000
                and (public.get_spending_summary(:'moto', null, null, 'all', null, null, 'owner') ->> 'total_cents')::bigint = 24000,
                'origem pela evidência, igual à linha do tempo');
reset role;

\o
\echo '=== TODOS OS TESTES DA FASE A DE GASTOS PASSARAM ==='
