-- =============================================================================
-- ROLLBACK de 20261107225331_notifications (v0.29.0, ADR-031). Ver docs/OPERATIONS.md §4.
-- Perde: avisos e preferências de notificação. Não altera motos, oficinas, transferências nem cobranças.
-- Publicar antes o site anterior (o atual mostra o sino e /painel/notificacoes).
-- =============================================================================
begin;
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'moto-passaporte-notifications';
  end if;
end $$;
drop trigger if exists notify_workshop_access on public.motorcycle_workshop_access;
drop trigger if exists notify_workshop_service on public.maintenance_records;
drop trigger if exists notify_transfer on public.transfer_requests;
drop trigger if exists notify_payment on public.payments;
drop trigger if exists notify_claim on public.motorcycle_claim_requests;
drop function if exists public.admin_send_notice(uuid, text, text, text);
drop function if exists public.set_my_notification_preference(text, boolean, boolean);
drop function if exists public.get_my_notification_preferences();
drop function if exists public.mark_my_notifications_read(uuid[]);
drop function if exists public.count_my_unread_notifications();
drop function if exists public.get_my_notifications(int, timestamptz);
drop function if exists public.system_generate_notifications();
drop function if exists public.trg_notify_claim();
drop function if exists public.trg_notify_payment();
drop function if exists public.trg_notify_transfer();
drop function if exists public.trg_notify_workshop_service();
drop function if exists public.trg_notify_workshop_access();
drop function if exists public.org_label(uuid);
drop function if exists public.moto_owner(uuid);
drop function if exists public.moto_label(uuid);
drop function if exists public.notify(uuid, text, text, text, text, text);
drop function if exists public.notification_kind_optional(text);
drop table if exists public.notification_preferences;
drop table if exists public.notifications;
commit;
