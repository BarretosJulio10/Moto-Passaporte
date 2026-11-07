-- =============================================================================
-- Testes da Fase 6.3 — monitoramento de armazenamento (banco de TESTE; após phase6c)
-- A: titular com anexos; D: administrador.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 6.3: armazenamento'
grant usage on schema tests to service_role;
grant execute on all functions in schema tests to service_role;

-- Envios sem registro: um recente (temporário) e um antigo (sem vínculo)
select set_config('request.jwt.claim.sub', :'A', false);
insert into storage.objects (bucket_id, name, metadata, created_at) values
  ('attachments', gen_random_uuid() || '/' || gen_random_uuid() || '.jpg', '{"size": 1000}', now());
insert into storage.objects (bucket_id, name, metadata, created_at) values
  ('attachments', gen_random_uuid() || '/' || gen_random_uuid() || '.pdf', '{"size": 5000}', now() - interval '3 days')
  returning name as old_orphan \gset

-- Usuário comum não vê nada
set role authenticated;
select tests.must_fail($$select public.admin_storage_overview()$$, 'usuário não vê o painel de armazenamento');
select tests.must_fail($$select * from public.admin_storage_top_users()$$, 'usuário não vê consumo por usuário');
select tests.must_fail($$select * from public.admin_list_unlinked_files()$$, 'usuário não vê arquivos sem vínculo');
select tests.must_fail($$select public.admin_plan_storage_cleanup('Limpeza pedida por usuário comum')$$, 'usuário não pede limpeza');
select tests.must_fail($$select * from public.storage_cleanups$$, 'tabela de limpezas fechada');
select tests.must_fail($$select * from public.storage_unlinked_objects$$, 'visão interna fechada');
select tests.must_fail(format($$select public.storage_cleanup_finish(gen_random_uuid(), array[%L], 0)$$, :'old_orphan'), 'usuário não conclui limpeza');
reset role;

-- Admin
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.admin_storage_overview()::text as ov \gset
select tests.ok((:'ov'::jsonb ->> 'temporary_files')::int >= 1 and (:'ov'::jsonb ->> 'orphan_files')::int >= 1
                and (:'ov'::jsonb ->> 'orphan_bytes')::bigint >= 5000 and (:'ov'::jsonb ->> 'retention_hours')::int = 24
                and (:'ov'::jsonb ->> 'bucket_files')::int >= (:'ov'::jsonb ->> 'linked_files')::int, 'visão geral separa temporários e sem vínculo');
select tests.ok(jsonb_array_length(:'ov'::jsonb -> 'by_kind') >= 1 and jsonb_array_length(:'ov'::jsonb -> 'by_context') >= 1, 'consumo por categoria e por origem');
select tests.ok(exists (select 1 from public.admin_storage_top_users() where user_id = :'A' and used_bytes > 0 and quota_bytes > 0
                        and email_masked like '%•••@%'), 'consumo por usuário com e-mail mascarado');
select tests.ok(exists (select 1 from public.admin_storage_top_motorcycles() where bytes > 0), 'consumo por moto');
select tests.ok((select count(*) = 1 from public.admin_list_unlinked_files() where storage_path = :'old_orphan' and is_orphan), 'arquivo antigo marcado como sem vínculo');
select tests.ok((select bool_and(not is_orphan) from public.admin_list_unlinked_files() where created_at > now() - interval '1 hour'), 'envio recente segue temporário');

-- Configurações de armazenamento editáveis pelo catálogo
select public.admin_update_setting('storage_orphan_retention_hours', '48', 'Retenção de envios sem registro: 2 dias');
select public.admin_update_setting('storage_orphan_retention_hours', '24', 'Retenção volta para 1 dia');
select tests.must_fail($$select public.admin_update_setting('storage_alert_percent', '10', 'Alerta abaixo do mínimo')$$, 'alerta fora da faixa recusado');

-- Limpeza planejada só com arquivos sem vínculo
select tests.must_fail($$select public.admin_plan_storage_cleanup('curto')$$, 'limpeza exige motivo');
select public.admin_plan_storage_cleanup('Limpeza de envios que falharam')::text as plan \gset
select tests.ok(:'plan'::jsonb -> 'paths' ? :'old_orphan'
                and not exists (select 1 from jsonb_array_elements_text(:'plan'::jsonb -> 'paths') p
                                 where p in (select storage_path from public.attachments)), 'plano contém só arquivos sem vínculo');
select tests.ok(not exists (select 1 from jsonb_array_elements_text(:'plan'::jsonb -> 'paths') p
                             join storage.objects o on o.name = p where o.created_at > now() - interval '1 hour'), 'plano não inclui envios recentes');
select tests.must_fail($$select public.admin_plan_storage_cleanup('Segunda limpeza ao mesmo tempo')$$, 'uma limpeza por vez');
reset role;

-- Edge Function (service_role) apaga e conclui
set role service_role;
select public.storage_cleanup_finish((:'plan'::jsonb ->> 'cleanup_id')::uuid, array[:'old_orphan', 'caminho/fora-do-plano.jpg'], 0)::text as fin \gset
reset role;
select tests.ok((:'fin'::jsonb ->> 'deleted_files')::int = 1 and (:'fin'::jsonb ->> 'deleted_bytes')::bigint = 5000, 'só conta o que estava no plano');
set role service_role;
select tests.must_fail(format($$select public.storage_cleanup_finish(%L, array[]::text[], 0)$$, :'plan'::jsonb ->> 'cleanup_id'), 'limpeza não é concluída duas vezes');
reset role;
select tests.ok((select count(*) = 2 from public.audit_logs where entity_type = 'storage_cleanup' and actor_user_id = :'D'
                 and new_data ->> 'reason' = 'Limpeza de envios que falharam'), 'planejamento e conclusão auditados com o admin');

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok(exists (select 1 from public.admin_list_storage_cleanups() where status = 'done' and deleted_files = 1), 'histórico de limpezas');
reset role;
\echo '=== TODOS OS TESTES DA FASE 6.3 (ARMAZENAMENTO) PASSARAM ==='
