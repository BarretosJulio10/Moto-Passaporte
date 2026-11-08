-- Reversão da Fase 5.1 do módulo Oficina (PRD 2.1): vínculo do cliente com a conta, avisos do §23 e logotipo nos documentos.
-- Desfaz os vínculos (os clientes deixam de ver os atendimentos no painel); não apaga orçamentos, OS nem avisos já enviados.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'moto-passaporte-workshop-reminders') then
    perform cron.unschedule('moto-passaporte-workshop-reminders');
  end if;
end $$;
drop trigger if exists workshop_quotes_customer_notify on public.workshop_quotes;
drop trigger if exists workshop_service_orders_customer_notify on public.workshop_service_orders;
drop trigger if exists workshop_appointments_notify on public.workshop_appointments;
drop trigger if exists workshops_sync_logo_url on public.workshops;
drop function if exists public.wl_quote_notify(), public.wl_order_notify(), public.wl_appointment_notify(), public.wl_sync_logo_url(),
  public.system_workshop_reminders(), public.wl_notify_customer(uuid, text, text, text), public.get_my_workshop_records(),
  public.workshop_unlink_customer(uuid, uuid), public.unlink_my_workshop_customer(uuid), public.claim_workshop_customer(text, text),
  public.get_customer_link_preview(text, text), public.wl_customer_by_token(text, text), public.workshop_create_customer_invite(uuid, uuid);
drop table if exists public.workshop_customer_invites;
alter table public.workshop_reminders drop column if exists notified_at;
alter table public.workshop_customers drop column if exists user_id, drop column if exists linked_at, drop column if exists link_source;
update public.workshops set logo_url = null where logo_url like 'storage:%';
-- Recriar notifications_kind_check, notification_kind_optional e get_my_notification_preferences como em
-- 20261108201102_workshop_growth.sql, depois de apagar os avisos dos tipos 'workshop_update', 'workshop_reminder_due', 'appointment_canceled'.
