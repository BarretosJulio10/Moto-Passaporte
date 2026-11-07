-- Varredura de segurança no SUPABASE REAL (Fase 6.4). Gerado de ../sweep_violations.sql.inc — não editar aqui.
-- Resultado esperado: nenhuma linha.
-- Varredura de segurança por catálogo (Fase 6.4, ADR-027). Cada linha devolvida é uma violação.
-- Usada pelo teste local (phase6e) e pelo teste no Supabase real. Atualizar as listas permitidas
-- só com decisão registrada. Cria a visão temporária "sweep" (uma linha por violação).
create temp view sweep as
with
anon_select_ok(t) as (values ('system_settings'), ('workshops')),
anon_exec_ok(f) as (values ('get_payment_public_config'), ('get_public_passport'), ('get_public_plans'), ('get_shared_passport'),
  ('is_org_active'), ('is_valid_plate'), ('mask_email'), ('normalize_plate'), ('setting_spec'), ('transfer_status_of'), ('rls_auto_enable')),
service_only(f) as (values ('payment_access_token'), ('payment_webhook_secret'), ('storage_cleanup_finish'), ('record_payment_check'),
  ('user_storage_used_bytes'), ('upsert_vault_secret'), ('scheduled_job_secret_ok'), ('job_run_start'), ('job_run_finish'),
  ('system_plan_storage_cleanup'), ('notify'), ('moto_label'), ('moto_owner'), ('org_label'), ('system_generate_notifications'), ('chassis_key'), ('moto_owner_is_me')),
column_write_ok(c) as (values ('motorcycles.brand'), ('motorcycles.model'), ('motorcycles.version'), ('motorcycles.manufacturing_year'),
  ('motorcycles.model_year'), ('motorcycles.displacement_cc'), ('motorcycles.color'), ('motorcycles.initial_notes'),
  ('profiles.full_name'), ('profiles.phone'), ('profiles.avatar_url'),
  ('workshops.business_name'), ('workshops.legal_name'), ('workshops.cnpj'), ('workshops.public_slug'), ('workshops.city'), ('workshops.state'),
  ('workshops.address'), ('workshops.phone'), ('workshops.whatsapp'), ('workshops.email'), ('workshops.description'), ('workshops.specialties'),
  ('workshops.opening_hours'), ('workshops.logo_url'), ('workshops.is_public'), ('workshops.responsible_name')),
fns as (
  select p.oid, p.proname, p.prosecdef, p.proconfig, p.prosrc, t.typname as rettype
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
   where n.nspname = 'public' and p.prokind = 'f'
)
select 'tabela sem RLS' as regra, c.relname as objeto
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
union all
select 'escrita direta liberada para ' || g.grantee, g.table_name || ' (' || g.privilege_type || ')'
  from information_schema.role_table_grants g
 where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated')
   and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
union all
select 'escrita por coluna fora da lista (' || g.grantee || ')', g.table_name || '.' || g.column_name || ' (' || g.privilege_type || ')'
  from information_schema.role_column_grants g
 where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated') and g.privilege_type in ('INSERT', 'UPDATE')
   and (g.grantee = 'anon' or g.table_name || '.' || g.column_name not in (select c from column_write_ok))
union all
select 'leitura anônima fora da lista', g.table_name
  from information_schema.role_table_grants g
 where g.table_schema = 'public' and g.grantee = 'anon' and g.privilege_type = 'SELECT'
   and g.table_name not in (select t from anon_select_ok)
union all
select 'visão sem security_invoker exposta', c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'v'
   and not coalesce(c.reloptions @> array['security_invoker=true'], false)
   and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))
union all
select 'SECURITY DEFINER sem search_path', proname
  from fns
 where prosecdef and not exists (select 1 from unnest(coalesce(proconfig, '{}')) x where x like 'search_path=%')
union all
select 'função executável por anônimo fora da lista', proname
  from fns
 where has_function_privilege('anon', oid, 'execute')
   and rettype not in ('trigger', 'event_trigger')
   and proname not in (select f from anon_exec_ok)
union all
select 'função de servidor exposta ao navegador', proname
  from fns
 where (proname like 'billing\_%' or proname in (select f from service_only))
   and (has_function_privilege('authenticated', oid, 'execute') or has_function_privilege('anon', oid, 'execute'))
union all
select 'função admin sem checagem de admin', proname
  from fns
 where proname like 'admin\_%'
   and has_function_privilege('authenticated', oid, 'execute')
   and prosrc !~ '(is_admin\(\)|require_admin_reason\()'
union all
select 'bucket público', b.id
  from storage.buckets b where b.public
union all
select 'política para anônimo fora da lista', p.tablename || '.' || p.policyname
  from pg_policies p
 where p.schemaname = 'public' and 'anon' = any (p.roles)
   and p.tablename not in (select t from anon_select_ok);
select regra, objeto from sweep order by 1, 2;
