-- =============================================================================
-- ROLLBACK de 20261108172328_web_push (v0.41.0, ADR-040). Ver docs/OPERATIONS.md §4.
-- Desliga as notificações no celular. O sino continua funcionando.
-- Depois: reaplicar notify, get_my_notification_preferences e set_my_notification_preference de
-- 20261107225331_notifications.sql (versões sem a coluna push) e publicar o site anterior.
-- =============================================================================
begin;
select cron.unschedule(jobid) from cron.job where jobname = 'moto-passaporte-push';
drop trigger if exists notifications_push_kick on public.notifications;
drop function if exists public.push_kick();
drop function if exists public.push_claim_batch(int);
drop function if exists public.push_report(uuid[], uuid[], uuid[]);
drop function if exists public.push_get_keys();
drop function if exists public.push_store_keys(text, text);
drop function if exists public.get_push_public_key();
drop function if exists public.register_push_subscription(text, text, text, text);
drop function if exists public.unregister_push_subscription(text);
drop function if exists public.get_my_push_devices();
drop function if exists public.delete_my_push_device(uuid);
drop function if exists public.send_my_test_push();
drop table if exists public.push_subscriptions;
drop table if exists public.push_config;
delete from vault.secrets where name = 'push_vapid_private_jwk';
commit;
