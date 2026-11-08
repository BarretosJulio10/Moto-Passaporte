-- =============================================================================
-- ROLLBACK de 20261107231202_attachment_checks + 20261107231411_attachment_checks_enforce
-- (v0.32.0, ADR-033). Ver docs/OPERATIONS.md §4.
-- Volta a registrar anexos sem a conferência de conteúdo no servidor (só a da interface).
-- Perde: histórico das conferências. Arquivos e anexos registrados não mudam.
-- Publicar antes o site anterior (o atual chama a Edge Function attachment-check) e remover a função.
-- =============================================================================
begin;
drop trigger if exists attachments_require_check on public.attachments;
drop function if exists public.require_attachment_check();
drop function if exists public.record_attachment_check(text, uuid, text, boolean);
drop function if exists public.attachment_object_info(text);
drop table if exists public.attachment_checks;
commit;
