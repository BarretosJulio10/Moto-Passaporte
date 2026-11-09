-- Varredura de segurança por catálogo (Fase 6.4, ADR-027). Cada linha devolvida é uma violação.
-- Usada pelo teste local (phase6e) e pelo teste no Supabase real. Atualizar as listas permitidas
-- só com decisão registrada. Cria a visão temporária "sweep" (uma linha por violação).
create temp view sweep as
with
anon_select_ok(t) as (values ('system_settings'), ('workshops')),
anon_exec_ok(f) as (values ('get_payment_public_config'), ('get_public_passport'), ('get_public_plans'), ('get_shared_passport'),
  ('is_org_active'), ('is_valid_plate'), ('mask_email'), ('normalize_plate'), ('setting_spec'), ('transfer_status_of'), ('rls_auto_enable'), ('system_health'), ('get_quote_by_token'), ('decide_quote_by_token'), ('get_service_order_by_token'), ('ack_service_order_entry'), ('get_public_workshop'), ('get_public_booking_slots'), ('request_public_appointment'), ('submit_workshop_review'), ('is_public_workshop_file'), ('wp_valid_hours'), ('pista_request_guard'), ('pista_workshop_by_code')),
service_only(f) as (values ('payment_access_token'), ('payment_webhook_secret'), ('storage_cleanup_finish'), ('record_payment_check'),
  ('user_storage_used_bytes'), ('upsert_vault_secret'), ('scheduled_job_secret_ok'), ('job_run_start'), ('job_run_finish'),
  ('system_plan_storage_cleanup'), ('notify'), ('moto_label'), ('moto_owner'), ('org_label'), ('system_generate_notifications'), ('chassis_key'), ('moto_owner_is_me'), ('attachment_object_info'), ('record_attachment_check'), ('shared_attachment_for_download'), ('anon_rate_limit_ok'), ('user_active_grant'), ('user_active_pass'), ('user_pass_until'), ('push_get_keys'), ('push_store_keys'), ('push_claim_batch'), ('push_report'), ('push_kick'), ('care_status'), ('care_check_oil'), ('care_after_mileage'), ('system_weekly_checkup'), ('workshop_expire_quotes'), ('wq_assert'), ('wq_next_number'), ('wq_event'), ('wq_notify_team'), ('wq_recalc'), ('wq_issue_link'), ('wq_share_by_token'), ('wq_public_payload'), ('wq_actor_label'), ('workshop_file_object_info'), ('wo_event'), ('wo_lock'), ('wo_copy_quote_items'), ('wo_share_by_token'), ('wo_history_category'), ('wo_history_state'), ('wo_publish'), ('wq_only_user_nulled'), ('wr_display_name'), ('wp_free_slots'), ('wp_public_org'), ('wp_campaign_audience'), ('wr_protect_review'), ('wl_customer_by_token'), ('wl_notify_customer'), ('wl_quote_notify'), ('wl_order_notify'), ('wl_appointment_notify'), ('wl_sync_logo_url'), ('system_workshop_reminders'), ('welcome_premium_plan'), ('grant_welcome_premium'), ('profiles_welcome_premium'), ('sp_records'), ('sp_ownership_start'), ('sp_entries'), ('sp_km'), ('audit_owner_expense'), ('admin_mfa_required'), ('user_has_full_history'), ('vault_applies_to'), ('vault_open_records'), ('vault_notice_text'), ('vault_service_suffix'), ('share_in_vault_mode'), ('pista_is_responsible'), ('pista_lock'), ('pista_order_notes'), ('pista_order_audios'), ('system_expire_workshop_audios'), ('pista_new_code'), ('organizations_pista_code'), ('pista_assert_actor'), ('pista_account_prepare'), ('pista_account_register'), ('pista_account_manage')),
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
