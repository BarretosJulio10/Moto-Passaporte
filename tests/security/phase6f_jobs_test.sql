-- =============================================================================
-- Rotinas automáticas (ADR-029; KI-024, KI-029) — banco de TESTE; após phase6e
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Rotinas automáticas'

select tests.ok((select count(*) = 1 from vault.secrets where name = 'scheduled_jobs_secret' and char_length(secret) = 64), 'segredo das rotinas gerado no banco');
select decrypted_secret as secret from vault.decrypted_secrets where name = 'scheduled_jobs_secret' \gset

-- Navegador não chega a nada
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail($$select public.scheduled_job_secret_ok('x')$$, 'usuário não testa o segredo');
select tests.must_fail($$select public.job_run_start('reconcile')$$, 'usuário não inicia rotina');
select tests.must_fail($$select public.system_plan_storage_cleanup()$$, 'usuário não planeja limpeza automática');
select tests.must_fail($$select * from public.job_runs$$, 'execuções fechadas para o navegador');
select tests.must_fail($$select * from public.admin_job_status()$$, 'usuário não vê o estado das rotinas');
reset role;

set role service_role;
select tests.ok(public.scheduled_job_secret_ok(:'secret'), 'segredo certo aceito');
select tests.ok(not public.scheduled_job_secret_ok(repeat('0', 64)) and not public.scheduled_job_secret_ok('') and not public.scheduled_job_secret_ok(null), 'segredo errado recusado');

-- Uma execução por vez; presa há mais de 1 hora é encerrada
select public.job_run_start('reconcile') as run1 \gset
select tests.ok(public.job_run_start('reconcile') is null, 'não roda duas conciliações ao mesmo tempo');
select public.job_run_finish(:run1, 'ok', 'Nenhuma assinatura para conferir.');
select tests.ok((select status = 'ok' and finished_at is not null from public.job_runs where id = :run1), 'execução concluída registrada');
reset role;
insert into public.job_runs (job, started_at) values ('storage_cleanup', now() - interval '2 hours');
set role service_role;
select public.job_run_start('storage_cleanup') as run2 \gset
select tests.ok(:run2 is not null and (select count(*) = 1 from public.job_runs where job = 'storage_cleanup' and status = 'failed'
                and detail like 'Interrompida%'), 'execução presa é encerrada como falha e a nova começa');

-- Limpeza automática: só arquivos sem vínculo fora da retenção, sem autor
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
insert into storage.objects (bucket_id, name, metadata, created_at)
  values ('attachments', gen_random_uuid() || '/' || gen_random_uuid() || '.pdf', '{"size": 4000}', now() - interval '5 days')
  returning name as auto_orphan \gset
set role service_role;
select public.system_plan_storage_cleanup()::text as plan \gset
select tests.ok(:'plan'::jsonb -> 'paths' ? :'auto_orphan'
                and not exists (select 1 from jsonb_array_elements_text(:'plan'::jsonb -> 'paths') p where p in (select storage_path from public.attachments))
                and not exists (select 1 from jsonb_array_elements_text(:'plan'::jsonb -> 'paths') p join storage.objects o on o.name = p
                                 where o.created_at > now() - interval '1 hour'), 'plano automático só com arquivos sem vínculo e fora da retenção');
select tests.ok((public.system_plan_storage_cleanup() ->> 'busy')::boolean, 'não planeja duas limpezas ao mesmo tempo');
select public.storage_cleanup_finish((:'plan'::jsonb ->> 'cleanup_id')::uuid, array[:'auto_orphan'], 0);
select public.job_run_finish(:run2, 'ok', '1 arquivo(s) apagado(s).');
reset role;
select tests.ok((select requested_by is null and status = 'done' and deleted_files = 1 from public.storage_cleanups
                  where id = (:'plan'::jsonb ->> 'cleanup_id')::uuid), 'limpeza automática concluída sem autor');
select tests.ok((select count(*) = 2 from public.audit_logs where entity_type = 'storage_cleanup' and entity_id = :'plan'::jsonb ->> 'cleanup_id'
                 and actor_user_id is null), 'limpeza automática auditada como sistema');

-- Admin acompanha
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((select count(*) = 2 from public.admin_job_status()), 'admin vê as duas rotinas');
select tests.ok((select last_status = 'ok' and failures_24h = 1 and runs_24h = 2 from public.admin_job_status() where job = 'storage_cleanup'),
                'admin vê última execução e falhas nas últimas 24 h');
reset role;
\echo '=== TODOS OS TESTES DAS ROTINAS AUTOMÁTICAS PASSARAM ==='
