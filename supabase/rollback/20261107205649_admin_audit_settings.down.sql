-- =============================================================================
-- ROLLBACK de 20261107205649_admin_audit_settings (v0.22.0, ADR-024). Ver docs/OPERATIONS.md §4.
-- ATENÇÃO: NÃO devolve a escrita direta em system_settings ao admin — aquilo era uma falha de
-- segurança corrigida nesta migração. Depois do rollback, configurações só mudam pelo SQL Editor.
-- Requer o rollback de storage_monitoring antes (que também usa setting_spec).
-- =============================================================================
begin;
drop function if exists public.admin_audit_facets();
drop function if exists public.admin_get_audit_entry(bigint, text);
drop function if exists public.admin_search_audit(text, text, uuid, uuid, uuid, timestamptz, timestamptz, int, bigint);
drop function if exists public.admin_update_setting(text, jsonb, text);
drop function if exists public.admin_list_settings();
drop function if exists public.setting_spec(text);
commit;
