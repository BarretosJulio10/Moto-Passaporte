-- ROLLBACK de 20261108175020_care_routines (v0.42.0, ADR-041). Desliga check-up semanal e aviso de óleo.
-- Depois: reaplicar get_my_notification_preferences de 20261108172328_web_push.sql e publicar o site anterior.
begin;
select cron.unschedule(jobid) from cron.job where jobname = 'moto-passaporte-weekly-checkup';
drop trigger if exists mileage_records_care on public.mileage_records;
drop function if exists public.care_after_mileage();
drop function if exists public.system_weekly_checkup();
drop function if exists public.mark_care_done(uuid, text);
drop function if exists public.set_motorcycle_care(uuid, text, int, boolean, int);
drop function if exists public.get_motorcycle_care(uuid);
drop function if exists public.care_check_oil(uuid);
drop function if exists public.care_status(uuid);
delete from public.notifications where kind in ('care_checkup', 'oil_change');
drop table if exists public.motorcycle_care;
drop table if exists public.care_routines;
commit;
