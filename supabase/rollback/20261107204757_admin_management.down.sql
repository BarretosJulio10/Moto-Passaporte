-- =============================================================================
-- ROLLBACK de 20261107204757_admin_management (v0.21.0, ADR-023). Ver docs/OPERATIONS.md §4.
-- Requer os rollbacks posteriores antes (plate_claims, admin_audit_settings, storage_monitoring
-- usam mask_email/require_admin_reason).
-- Reativa no Auth as contas suspensas/bloqueadas por esta tela (sem as colunas, não haveria como
-- reverter depois). Perde: situação e motivo das contas (a auditoria em audit_logs permanece).
-- =============================================================================
begin;
update auth.users u set banned_until = null
  from public.profiles p
 where p.id = u.id and p.account_status in ('suspended', 'blocked') and u.banned_until = 'infinity';
drop function if exists public.admin_set_workshop_verification(uuid, text, text);
drop function if exists public.admin_set_workshop_status(uuid, text, text);
drop function if exists public.admin_list_workshops(text, int);
drop function if exists public.admin_set_user_status(uuid, text, text);
drop function if exists public.admin_get_user(uuid, text);
drop function if exists public.admin_list_users(text, int);
drop function if exists public.admin_get_metrics();
drop function if exists public.require_admin_reason(text);
drop function if exists public.mask_email(text);
drop index if exists public.profiles_status_changed_by_idx;
alter table public.profiles
  drop column if exists status_changed_by, drop column if exists status_changed_at,
  drop column if exists status_reason, drop column if exists account_status;
commit;
