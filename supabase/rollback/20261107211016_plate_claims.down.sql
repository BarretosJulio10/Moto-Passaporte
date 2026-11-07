-- =============================================================================
-- ROLLBACK de 20261107211016_plate_claims + 20261107211152_plate_claims_notice_fix (v0.23.0, ADR-025).
-- Ver docs/OPERATIONS.md §4. Pedidos de verificação continuam guardados (tabela de origem é anterior).
-- Perde: respostas já registradas continuam nas linhas, mas sem tela; avisos ao titular deixam de existir.
-- =============================================================================
begin;
drop function if exists public.admin_resolve_claim(uuid, text, text, boolean, text);
drop function if exists public.admin_list_claims(text, int);
drop function if exists public.dismiss_ownership_notice(uuid);
drop function if exists public.get_my_ownership_notices();
drop function if exists public.cancel_my_claim(uuid);
drop function if exists public.update_my_claim_note(uuid, text);
drop function if exists public.get_my_claims();
drop trigger if exists motorcycle_claim_requests_audit on public.motorcycle_claim_requests;
alter table public.motorcycle_claim_requests drop column if exists owner_notice_dismissed_at, drop column if exists owner_notified_at;
commit;
