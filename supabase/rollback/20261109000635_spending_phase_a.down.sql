-- Reversão da Fase A do Controle de Gastos (PRD 2.2, ADR-050). Só leitura/cálculo: não apaga nenhum dado.
drop function if exists public.get_spending_snapshot(uuid), public.get_spending_summary(uuid, date, date, text, text, text, text, boolean),
  public.sp_records(uuid, uuid, text), public.sp_ownership_start(uuid);
update public.subscription_plans set entitlements = array_remove(entitlements, 'spending_insights');
update public.subscriptions set entitlements = array_remove(entitlements, 'spending_insights');
update public.premium_passes set entitlements = array_remove(entitlements, 'spending_insights');
alter table public.subscription_plans drop constraint if exists subscription_plans_entitlements_check;
alter table public.subscription_plans add constraint subscription_plans_entitlements_check
  check (entitlements <@ array['pdf_reports', 'maintenance_reminders']::text[]);
