-- =============================================================================
-- Verificação de saúde para o monitor externo (KI-030; ADR-038)
-- Pública (visitante), devolve só sim/não por verificação: nenhum dado, contagem ou nome.
-- Rollback: supabase/rollback/20261108162247_system_health.down.sql
-- =============================================================================
create or replace function public.system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c jsonb;
begin
  c := jsonb_build_object(
    'database', true,
    'jobs_no_failures_24h', not exists (select 1 from public.job_runs where status = 'failed' and started_at > now() - interval '24 hours'),
    'reconcile_recent', exists (select 1 from public.job_runs where job = 'reconcile' and status in ('ok', 'skipped') and started_at > now() - interval '13 hours'),
    'cleanup_recent', exists (select 1 from public.job_runs where job = 'storage_cleanup' and status in ('ok', 'skipped') and started_at > now() - interval '26 hours'),
    'jobs_not_stuck', not exists (select 1 from public.job_runs where status = 'running' and started_at < now() - interval '1 hour'),
    'payments_webhook_ok', (select count(*) from public.payment_events where result in ('error', 'invalid_signature') and received_at > now() - interval '1 hour') <= 5,
    'payments_not_stuck', not exists (select 1 from public.payment_events where result = 'received' and received_at < now() - interval '30 minutes' and received_at > now() - interval '7 days')
  );
  return jsonb_build_object('ok', not exists (select 1 from jsonb_each(c) e where e.value = 'false'::jsonb), 'checks', c, 'at', date_trunc('minute', now()));
end;
$$;
revoke execute on function public.system_health() from public;
grant execute on function public.system_health() to anon, authenticated;
comment on function public.system_health() is 'Monitor externo (ADR-038): só sim/não por verificação.';
