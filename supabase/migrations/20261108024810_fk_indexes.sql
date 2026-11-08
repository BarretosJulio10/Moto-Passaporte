-- =============================================================================
-- Índices dos vínculos apontados pelo Supabase (performance advisor, "unindexed foreign keys").
-- Evitam varredura completa ao apagar/atualizar contas referenciadas. Só índices; nenhum dado muda.
-- Rollback: drop index if exists public.attachment_checks_checked_by_idx,
--           public.storage_cleanups_requested_by_idx, public.subscription_plans_updated_by_idx;
-- =============================================================================
create index if not exists attachment_checks_checked_by_idx on public.attachment_checks (checked_by);
create index if not exists storage_cleanups_requested_by_idx on public.storage_cleanups (requested_by);
create index if not exists subscription_plans_updated_by_idx on public.subscription_plans (updated_by);
