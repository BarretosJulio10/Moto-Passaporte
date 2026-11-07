-- =============================================================================
-- Testes da Fase 2 — anexos (banco de TESTE; roda depois dos testes de manutenção)
-- O envio ao Storage é simulado com INSERT em storage.objects (stub).
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'

\echo '--- Fase 2: anexos'
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;

select id as moto_a from public.motorcycles limit 1 \gset
select id as rec from public.maintenance_timeline where status = 'current' and not is_void and category = 'oil_change' limit 1 \gset

select :'moto_a' || '/aaaaaaaa-0000-0000-0000-000000000001.jpg' as path1 \gset
select :'moto_a' || '/aaaaaaaa-0000-0000-0000-000000000002.pdf' as path2 \gset

insert into storage.objects (bucket_id, name, metadata) values ('attachments', :'path1', '{"size": 350000, "mimetype": "image/jpeg"}');
select tests.ok(true, 'A envia arquivo para a pasta da própria moto');
select public.register_attachment(:'moto_a', :'path1', 'nota-fiscal.jpg', 'invoice', :'rec') as att1 \gset
select tests.ok((select file_size = 350000 and mime_type = 'image/jpeg' from public.attachments where id = :'att1'), 'tamanho e tipo vêm do Storage');
select tests.ok((select evidence_level = 'document' and jsonb_array_length(attachments) = 1 from public.maintenance_timeline where id = :'rec'), 'registro com anexo passa a "com comprovante"');
select tests.ok(((public.get_storage_usage() ->> 'used_bytes')::bigint = 350000), 'uso de espaço contabilizado');
select tests.must_fail(format($$select public.register_attachment(%L, %L, 'x.jpg', 'photo')$$, :'moto_a', :'path1'), 'mesmo arquivo não é registrado duas vezes');
select tests.must_fail(format($$select public.register_attachment(%L, %L, 'x.pdf', 'photo')$$, :'moto_a', :'path2'), 'registrar arquivo inexistente falha');

insert into storage.objects (bucket_id, name, metadata) values ('attachments', :'path2', '{"size": 900, "mimetype": "video/mp4"}');
select tests.must_fail(format($$select public.register_attachment(%L, %L, 'video.pdf', 'document')$$, :'moto_a', :'path2'), 'tipo não permitido recusado (vídeo)');

select tests.must_fail(format($$update public.attachments set file_name = 'x' where id = %L$$, :'att1'), 'anexo não pode ser alterado');
select tests.must_fail(format($$delete from public.attachments where id = %L$$, :'att1'), 'anexo não pode ser apagado');
select tests.must_fail(format($$insert into public.attachments (motorcycle_id, storage_path, file_name, mime_type, file_size, kind) values (%L, %L, 'x', 'image/jpeg', 1, 'photo')$$, :'moto_a', :'path2'), 'inserção direta bloqueada');
select tests.must_fail($$insert into storage.objects (bucket_id, name, metadata) values ('attachments', 'nao-e-uuid/arquivo.jpg', '{}')$$, 'pasta fora do padrão recusada');
reset role;

-- Cota: reduz para 1 MB e tenta passar do limite
update public.subscription_plans set storage_quota_mb = 1 where kind = 'free';
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select :'moto_a' || '/aaaaaaaa-0000-0000-0000-000000000003.jpg' as path3 \gset
insert into storage.objects (bucket_id, name, metadata) values ('attachments', :'path3', '{"size": 900000, "mimetype": "image/jpeg"}');
select tests.must_fail(format($$select public.register_attachment(%L, %L, 'grande.jpg', 'photo')$$, :'moto_a', :'path3'), 'cota do plano é respeitada');
reset role;
update public.subscription_plans set storage_quota_mb = 100 where kind = 'free';

-- ===== Isolamento
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select count(*) = 0 from public.attachments), 'B não vê anexos de A');
select tests.ok((select count(*) = 0 from storage.objects where bucket_id = 'attachments'), 'B não lista arquivos de A no Storage');
select tests.must_fail(format($$insert into storage.objects (bucket_id, name, metadata) values ('attachments', %L, '{}')$$, :'moto_a' || '/bbbbbbbb-0000-0000-0000-000000000001.jpg'), 'B não envia para a pasta da moto de A');
select tests.must_fail(format($$select public.register_attachment(%L, %L, 'x.jpg', 'photo')$$, :'moto_a', :'path3'), 'B não registra anexo na moto de A');
select tests.ok(((public.get_storage_usage() ->> 'used_bytes')::bigint = 0), 'uso de espaço de B não inclui A');
reset role;

set role anon;
select tests.must_fail($$select * from public.attachments$$, 'anônimo não lê anexos');
select tests.ok((select count(*) = 0 from storage.objects where bucket_id = 'attachments'), 'anônimo não lista arquivos');
reset role;

select set_config('request.jwt.claim.sub', '', false);
select tests.must_fail($$delete from public.attachments$$, 'anexos não apagáveis (dono do banco)');
select tests.ok((select public = false from storage.buckets where id = 'attachments'), 'bucket é privado');
select tests.ok((select count(*) >= 1 from public.audit_logs where entity_type = 'attachments'), 'anexos auditados');

\echo '=== TODOS OS TESTES DA FASE 2 (ANEXOS) PASSARAM ==='
