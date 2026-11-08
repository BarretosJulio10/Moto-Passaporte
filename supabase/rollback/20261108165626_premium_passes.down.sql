-- =============================================================================
-- ROLLBACK de 20261108165626_premium_passes (v0.40.0, ADR-039). Ver docs/OPERATIONS.md §4.
-- Antes: desligar o botão "Pix, débito ou boleto" (publicar o site anterior) e exportar
--   select * from public.premium_passes where status = 'paid';
-- Períodos já pagos deixam de liberar o Premium: conceder bônus equivalente (admin_grant_premium)
-- a cada conta paga antes de rodar este rollback.
-- Depois: reaplicar get_my_plan, billing_prepare_subscription e system_generate_notifications de
-- 20261108164415_bonus_billing.sql e user_plan de 20261108161839_premium_grants.sql; republicar as
-- Edge Functions da versão anterior.
-- =============================================================================
begin;
drop function if exists public.admin_list_passes(int);
drop function if exists public.get_my_passes();
drop function if exists public.billing_pass_targets(uuid, int);
drop function if exists public.billing_apply_pass_payment(uuid, text, text, int, timestamptz, text);
drop function if exists public.billing_fail_pass_checkout(uuid);
drop function if exists public.billing_attach_pass_checkout(uuid, text, text);
drop function if exists public.billing_prepare_pass(uuid, text);
-- user_plan depende destas; reaplicar a versão anterior de user_plan ANTES deste commit.
drop function if exists public.user_pass_until(uuid);
drop function if exists public.user_active_pass(uuid);
drop table if exists public.premium_passes;
commit;
