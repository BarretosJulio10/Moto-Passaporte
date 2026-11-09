-- =============================================================================
-- PRD 2.2 — Controle de Gastos, Fase C (ADR-052): CSV, "Meus dados", limpeza de comprovantes.
-- Banco de TESTE, depois de phase8c (usuário T, hoje no gratuito).
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set T '88888888-8888-8888-8888-888888888881'
\echo '--- PRD 2.2 Fase C: exportar gastos'

select set_config('request.jwt.claim.sub', :'T', false);
set role authenticated;
select tests.must_fail($$select public.get_spending_export(null)$$, 'gratuito não exporta CSV');
select public.export_my_data() as d \gset
select tests.ok(jsonb_array_length(:'d'::jsonb -> 'expenses') >= 2 and (:'d'::jsonb -> 'expenses' -> 0) ? 'value_cents', '"Meus dados" traz as despesas avulsas');
reset role;

update public.premium_grants set revoked_at = null where user_id = :'T';
select set_config('request.jwt.claim.sub', :'T', false);
set role authenticated;
select public.get_spending_export(null) as x \gset
select tests.ok(jsonb_array_length(:'x'::jsonb) >= 3 and (:'x'::jsonb -> 0 ->> 'motorcycle') = 'Honda CG 160', 'Premium exporta com o nome da moto');
select tests.ok((select sum((e ->> 'value_cents')::bigint) from jsonb_array_elements(:'x'::jsonb) e where e ->> 'value_cents' is not null)
                = (public.get_spending_summary(null, null, null, 'ownership') ->> 'total_cents')::bigint, 'total do CSV = total da tela');
-- Comprovante enviado e não gravado vira órfão da limpeza
insert into storage.objects (bucket_id, name, metadata) values ('expense-receipts', :'T' || '/aaaaaaaa-0000-4000-8000-0000000000f9.jpg', '{"mimetype":"image/jpeg","size":10}');
reset role;
update storage.objects set created_at = now() - interval '3 days' where bucket_id = 'expense-receipts' and name = :'T' || '/aaaaaaaa-0000-4000-8000-0000000000f9.jpg';
select tests.ok(exists (select 1 from public.storage_unlinked_objects where name = 'expense-receipts:' || :'T' || '/aaaaaaaa-0000-4000-8000-0000000000f9.jpg' and is_orphan),
                'comprovante sem despesa entra na limpeza, marcado pelo bucket');
select tests.ok(not exists (select 1 from public.storage_unlinked_objects u join public.owner_expenses e on 'expense-receipts:' || e.receipt_path = u.name),
                'comprovante em uso nunca entra na limpeza');
set role anon;
select tests.must_fail($$select public.get_spending_export(null)$$, 'visitante não exporta');
reset role;

-- Regressão: o Supabase (pg_safeupdate) recusa DELETE/UPDATE sem WHERE em chamadas do site.
select tests.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc ~* '\mdelete\s+from\s+[a-z_.]+\s*;'),
  'nenhuma função com DELETE sem WHERE');

\o
\echo '=== TODOS OS TESTES DA FASE C DE GASTOS PASSARAM ==='
