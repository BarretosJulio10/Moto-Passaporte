-- =============================================================================
-- Rotinas automáticas (PRD 8.3, 7.6, 20; KI-024, KI-029; ADR-029)
-- - Conciliação com o Mercado Pago a cada 6 horas (notificações perdidas, status divergentes).
-- - Limpeza diária de arquivos sem vínculo (mesma regra da limpeza manual, ADR-026).
-- - Cada execução fica registrada em job_runs (monitoramento, sem dados pessoais nem segredos).
-- O pg_cron chama a Edge Function scheduled-jobs com um segredo gerado aqui, guardado no Vault
-- (ninguém o vê; a função confere por storage_job_secret_ok). Sem pg_cron/pg_net (banco de teste),
-- o agendamento é pulado e o resto é criado normalmente.
-- Rollback: supabase/rollback/<versão>_scheduled_jobs.down.sql (remove agendamentos, funções,
--           tabela e segredo; nenhum dado de cobrança ou arquivo é alterado).
-- =============================================================================

create table if not exists public.job_runs (
  id           bigint generated always as identity primary key,
  job          text not null check (job in ('reconcile', 'storage_cleanup')),
  triggered_by text not null default 'schedule' check (triggered_by in ('schedule', 'manual')),
  status       text not null default 'running' check (status in ('running', 'ok', 'failed', 'skipped')),
  detail       text check (char_length(detail) <= 1000),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index if not exists job_runs_job_idx on public.job_runs (job, started_at desc);
alter table public.job_runs enable row level security;
revoke all on public.job_runs from public, anon, authenticated;
comment on table public.job_runs is 'Execuções das rotinas automáticas (ADR-029). Sem dados pessoais nem segredos.';

insert into public.system_settings (key, value, description, is_public) values
  ('functions_base_url', '"https://ripgenhykaajcnzdxoid.supabase.co/functions/v1"',
   'Endereço das Edge Functions chamado pelas rotinas agendadas. Atualizar ao restaurar em outro projeto (OPERATIONS.md §3)', false)
on conflict (key) do nothing;

-- Segredo das rotinas: gerado no banco, nunca exibido.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'scheduled_jobs_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'scheduled_jobs_secret',
                                'Autentica o pg_cron na Edge Function scheduled-jobs (ADR-029)');
  end if;
end $$;

create or replace function public.scheduled_job_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_secret is not null and char_length(p_secret) = 64
     and exists (select 1 from vault.decrypted_secrets where name = 'scheduled_jobs_secret' and decrypted_secret = p_secret);
$$;

create or replace function public.job_run_start(p_job text, p_trigger text default 'schedule')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  -- Execução anterior presa há mais de 1 hora é encerrada como falha.
  update public.job_runs set status = 'failed', finished_at = now(), detail = 'Interrompida (sem conclusão em 1 hora).'
   where job = p_job and status = 'running' and started_at < now() - interval '1 hour';
  if exists (select 1 from public.job_runs where job = p_job and status = 'running') then
    return null; -- já há uma em andamento
  end if;
  insert into public.job_runs (job, triggered_by) values (p_job, coalesce(p_trigger, 'schedule')) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.job_run_finish(p_id bigint, p_status text, p_detail text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.job_runs set status = p_status, detail = left(p_detail, 1000), finished_at = now()
   where id = p_id and status = 'running';
$$;

-- Limpeza automática: mesmas regras do plano manual (só sem registro e fora da retenção), sem autor.
create or replace function public.system_plan_storage_cleanup(p_limit int default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := 'Limpeza automática diária de envios sem registro';
  v_files jsonb;
  v_n int;
  v_bytes bigint;
  v_id uuid;
begin
  if exists (select 1 from public.storage_cleanups where status = 'planned' and created_at > now() - interval '10 minutes') then
    return jsonb_build_object('cleanup_id', null, 'paths', '[]'::jsonb, 'bytes', 0, 'busy', true);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('path', name, 'size', size_bytes)), '[]'::jsonb), count(*), coalesce(sum(size_bytes), 0)
    into v_files, v_n, v_bytes
    from (select name, size_bytes from public.storage_unlinked_objects where is_orphan
           order by created_at limit least(greatest(coalesce(p_limit, 500), 1), 1000)) s;
  if v_n = 0 then
    return jsonb_build_object('cleanup_id', null, 'paths', '[]'::jsonb, 'bytes', 0);
  end if;
  insert into public.storage_cleanups (requested_by, reason, planned, planned_files, planned_bytes)
  values (null, v_reason, v_files, v_n, v_bytes) returning id into v_id;
  insert into public.audit_logs (actor_user_id, entity_type, entity_id, action, new_data)
  values (null, 'storage_cleanup', v_id::text, 'admin_storage_cleanup_planned', jsonb_build_object('reason', v_reason, 'files', v_n, 'bytes', v_bytes));
  return jsonb_build_object('cleanup_id', v_id,
    'paths', (select jsonb_agg(f ->> 'path') from jsonb_array_elements(v_files) f), 'bytes', v_bytes);
end;
$$;

create or replace function public.admin_job_status()
returns table (job text, last_status text, last_detail text, last_started_at timestamptz, last_finished_at timestamptz,
               last_ok_at timestamptz, failures_24h int, runs_24h int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select j.job,
           l.status, l.detail, l.started_at, l.finished_at,
           (select max(r.finished_at) from public.job_runs r where r.job = j.job and r.status in ('ok', 'skipped')),
           (select count(*)::int from public.job_runs r where r.job = j.job and r.status = 'failed' and r.started_at > now() - interval '24 hours'),
           (select count(*)::int from public.job_runs r where r.job = j.job and r.started_at > now() - interval '24 hours')
      from (values ('reconcile'), ('storage_cleanup')) j(job)
      left join lateral (select r.status, r.detail, r.started_at, r.finished_at from public.job_runs r
                          where r.job = j.job order by r.started_at desc limit 1) l on true;
end;
$$;

revoke execute on function public.scheduled_job_secret_ok(text) from public, anon, authenticated;
revoke execute on function public.job_run_start(text, text) from public, anon, authenticated;
revoke execute on function public.job_run_finish(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.system_plan_storage_cleanup(int) from public, anon, authenticated;
revoke execute on function public.admin_job_status() from public, anon;
grant execute on function public.scheduled_job_secret_ok(text) to service_role;
grant execute on function public.job_run_start(text, text) to service_role;
grant execute on function public.job_run_finish(bigint, text, text) to service_role;
grant execute on function public.system_plan_storage_cleanup(int) to service_role;
grant execute on function public.admin_job_status() to authenticated;

-- Agendamento (só onde pg_cron e pg_net existem — no Supabase).
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron/pg_net indisponíveis: agendamento não criado (banco de teste).';
    return;
  end if;
  create extension if not exists pg_cron with schema pg_catalog;
  create extension if not exists pg_net with schema extensions;
  perform cron.schedule('moto-passaporte-reconcile', '23 */6 * * *', $cmd$
    select net.http_post(
      url := (select value #>> '{}' from public.system_settings where key = 'functions_base_url') || '/scheduled-jobs',
      headers := jsonb_build_object('Content-Type', 'application/json',
                   'x-job-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_jobs_secret')),
      body := '{"job":"reconcile"}'::jsonb,
      timeout_milliseconds := 60000)
  $cmd$);
  perform cron.schedule('moto-passaporte-storage-cleanup', '41 7 * * *', $cmd$
    select net.http_post(
      url := (select value #>> '{}' from public.system_settings where key = 'functions_base_url') || '/scheduled-jobs',
      headers := jsonb_build_object('Content-Type', 'application/json',
                   'x-job-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'scheduled_jobs_secret')),
      body := '{"job":"storage_cleanup"}'::jsonb,
      timeout_milliseconds := 120000)
  $cmd$);
end $$;
