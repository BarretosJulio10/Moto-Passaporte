-- =============================================================================
-- ROLLBACK de 20261107223027_scheduled_jobs (v0.27.0, ADR-029). Ver docs/OPERATIONS.md §4.
-- Desliga a conciliação e a limpeza automáticas (voltam a ser só manuais, pelo admin).
-- Perde: histórico de execuções (job_runs). Não altera cobranças, arquivos nem auditoria.
-- Mantém as extensões pg_cron/pg_net instaladas (inofensivas). Remover antes a Edge Function scheduled-jobs.
-- =============================================================================
begin;
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('moto-passaporte-reconcile', 'moto-passaporte-storage-cleanup');
  end if;
end $$;
drop function if exists public.admin_job_status();
drop function if exists public.system_plan_storage_cleanup(int);
drop function if exists public.job_run_finish(bigint, text, text);
drop function if exists public.job_run_start(text, text);
drop function if exists public.scheduled_job_secret_ok(text);
drop table if exists public.job_runs;
delete from public.system_settings where key = 'functions_base_url';
delete from vault.secrets where name = 'scheduled_jobs_secret';
commit;
