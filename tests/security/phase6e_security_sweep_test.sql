-- =============================================================================
-- Fase 6.4 — varredura de segurança por catálogo (banco de TESTE; roda por último)
-- 1) O banco completo não tem nenhuma violação.
-- 2) A varredura detecta cada tipo de brecha (criadas numa transação desfeita).
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\echo '--- Fase 6.4: varredura de segurança'

\ir sweep_violations.sql.inc
grant select on sweep to public;

\o
select regra, objeto from sweep;
\o /dev/null
select tests.ok((select count(*) = 0 from sweep), 'nenhuma violação no banco completo');

begin;
create table public.t_sem_rls (id int);
create table public.t_aberta (id int);
alter table public.t_aberta enable row level security;
grant insert on public.t_aberta to authenticated;
grant select on public.t_aberta to anon;
create view public.v_definer as select 1 as x;
grant select on public.v_definer to authenticated;
create function public.f_sem_path() returns int language sql security definer as 'select 1';
create function public.f_anon() returns int language sql set search_path = '' as 'select 1';
grant execute on function public.f_anon() to anon;
create function public.billing_teste() returns int language sql set search_path = '' as 'select 1';
grant execute on function public.billing_teste() to authenticated;
create function public.admin_sem_checagem() returns int language sql set search_path = '' as 'select 1';
grant execute on function public.admin_sem_checagem() to authenticated;
create policy p_anon on public.t_aberta for select to anon using (true);
update storage.buckets set public = true where id = 'attachments';

select tests.ok(exists (select 1 from sweep where regra = 'tabela sem RLS' and objeto = 't_sem_rls'), 'detecta tabela sem RLS');
select tests.ok(exists (select 1 from sweep where regra like 'escrita direta%' and objeto like 't_aberta%'), 'detecta escrita direta');
select tests.ok(exists (select 1 from sweep where regra = 'leitura anônima fora da lista' and objeto = 't_aberta'), 'detecta leitura anônima');
select tests.ok(exists (select 1 from sweep where regra = 'visão sem security_invoker exposta' and objeto = 'v_definer'), 'detecta visão que ignora RLS');
select tests.ok(exists (select 1 from sweep where regra = 'SECURITY DEFINER sem search_path' and objeto = 'f_sem_path'), 'detecta função sem search_path');
select tests.ok(exists (select 1 from sweep where regra = 'função executável por anônimo fora da lista' and objeto = 'f_anon'), 'detecta função liberada a anônimo');
select tests.ok(exists (select 1 from sweep where regra = 'função de servidor exposta ao navegador' and objeto = 'billing_teste'), 'detecta função de servidor exposta');
select tests.ok(exists (select 1 from sweep where regra = 'função admin sem checagem de admin' and objeto = 'admin_sem_checagem'), 'detecta função admin sem checagem');
select tests.ok(exists (select 1 from sweep where regra = 'bucket público' and objeto = 'attachments'), 'detecta bucket público');
select tests.ok(exists (select 1 from sweep where regra = 'política para anônimo fora da lista' and objeto = 't_aberta.p_anon'), 'detecta política para anônimo');
rollback;

select tests.ok((select count(*) = 0 from sweep), 'banco volta sem violações');

\echo '=== TODOS OS TESTES DA FASE 6.4 (VARREDURA DE SEGURANÇA) PASSARAM ==='
