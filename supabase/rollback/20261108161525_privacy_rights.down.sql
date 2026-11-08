-- =============================================================================
-- ROLLBACK de 20261108161525_privacy_rights (v0.35.0, ADR-036). Ver docs/OPERATIONS.md §4.
-- Remove a cópia dos dados e os pedidos de privacidade. Perde: os pedidos registrados
-- (exportar antes: select * from public.privacy_requests). Contas já anonimizadas continuam anonimizadas.
-- =============================================================================
begin;
drop function if exists public.admin_anonymize_account(uuid, text);
drop function if exists public.admin_resolve_privacy_request(uuid, text, text, text);
drop function if exists public.admin_list_privacy_requests(text, int);
drop function if exists public.export_my_data();
drop function if exists public.cancel_my_privacy_request(uuid);
drop function if exists public.get_my_privacy_requests();
drop function if exists public.create_privacy_request(text, text);
drop table if exists public.privacy_requests;
commit;
