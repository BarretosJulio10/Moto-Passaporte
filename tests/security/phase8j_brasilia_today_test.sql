-- =============================================================================
-- "Hoje" no horário de Brasília (KI-049). Banco de TESTE.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
\echo '--- Data de hoje no horário de Brasília'

select tests.ok(
  not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%current_date%'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where lower(c) = 'timezone=america/sao_paulo')
  ),
  'toda função que usa current_date roda no fuso de Brasília');

-- Dentro de uma função com o fuso fixado, current_date é a data de Brasília mesmo com a sessão em UTC.
create function pg_temp.today_probe() returns date language sql set timezone to 'America/Sao_Paulo' as $$ select current_date $$;
set timezone to 'UTC';
select tests.ok(pg_temp.today_probe() = (now() at time zone 'America/Sao_Paulo')::date, 'current_date segue Brasília com a sessão em UTC');
reset timezone;

\echo '--- Esteira e índices (KI-051)'
select tests.ok(pg_get_functiondef('public.workshop_list_orders(uuid,text,text,boolean)'::regprocedure)
                like '%order by (o.status in (''delivered'', ''canceled'')), o.created_at desc%', 'lista de OS traz as abertas primeiro antes do limite');
select tests.ok(not exists (
  select 1 from pg_constraint c
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
                     and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
                     and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey)), 'toda chave estrangeira tem índice');
select tests.ok((select pg_get_expr(polqual, polrelid) from pg_policy where polname = 'owner_expenses_select') like '%SELECT auth.uid()%', 'RLS de gastos avalia auth.uid() uma vez');
