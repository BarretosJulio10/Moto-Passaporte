-- =============================================================================
-- Testes de anexos — versão para o SUPABASE REAL (transação desfeita no final).
-- O envio é simulado com INSERT em storage.objects (owner_id e metadata como o
-- serviço de Storage gravaria). "FALHOU: ..." indica falha real.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  moto uuid; rec uuid; att uuid;
  p1 text; p2 text; p3 text;
begin
  execute 'create schema tests';
  execute $f$
    create function tests.ok(p_cond boolean, p_label text) returns void language plpgsql as $b$
    begin
      if p_cond is distinct from true then raise exception 'FALHOU: %', p_label; end if;
      perform set_config('tests.n', (coalesce(nullif(current_setting('tests.n', true), ''), '0')::int + 1)::text, true);
    end $b$ $f$;
  execute $f$
    create function tests.must_fail(p_sql text, p_label text) returns void language plpgsql as $b$
    begin
      begin execute p_sql;
      exception when others then
        perform set_config('tests.n', (coalesce(nullif(current_setting('tests.n', true), ''), '0')::int + 1)::text, true);
        return;
      end;
      raise exception 'FALHOU: % — deveria ter sido bloqueado', p_label;
    end $b$ $f$;
  execute $f$
    create function tests.act_as(p_uid uuid, p_role text) returns void language plpgsql as $b$
    begin
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
      perform set_config('request.jwt.claims',
        case when p_uid is null then '{"role":"anon"}' else json_build_object('sub', p_uid, 'role', p_role, 'aal', 'aal2')::text end, true);
      if p_role is not null then execute format('set role %I', p_role); end if;
    end $b$ $f$;
  execute 'grant usage on schema tests to anon, authenticated';
  execute 'grant execute on all functions in schema tests to anon, authenticated';

  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated'),
    (B, 'bruno@teste.invalid', '{"full_name":"Bruno"}', 'authenticated', 'authenticated');

  perform tests.act_as(A, 'authenticated');
  moto := (public.register_motorcycle('Honda', 'CB 500F', 2022, 'WSX2E34', 12000) ->> 'motorcycle_id')::uuid;
  rec := (public.create_maintenance_record(moto, 'oil_change', 'Troca de óleo', current_date) ->> 'id')::uuid;
  p1 := moto || '/aaaaaaaa-0000-0000-0000-000000000001.jpg';
  p2 := moto || '/aaaaaaaa-0000-0000-0000-000000000002.pdf';
  p3 := moto || '/aaaaaaaa-0000-0000-0000-000000000003.jpg';

  insert into storage.objects (bucket_id, name, owner_id, metadata) values ('attachments', p1, A::text, '{"size": 350000, "mimetype": "image/jpeg"}');
  perform tests.ok(true, 'A envia para a pasta da própria moto');
  att := public.register_attachment(moto, p1, 'nota-fiscal.jpg', 'invoice', rec);
  perform tests.ok((select file_size = 350000 and mime_type = 'image/jpeg' from public.attachments where id = att), 'tamanho e tipo do Storage');
  perform tests.ok((select evidence_level = 'document' and jsonb_array_length(attachments) = 1 from public.maintenance_timeline where id = rec), 'com comprovante');
  perform tests.ok(((public.get_storage_usage() ->> 'used_bytes')::bigint = 350000), 'uso contabilizado');
  perform tests.must_fail(format($$select public.register_attachment(%L, %L, 'x.jpg', 'photo')$$, moto, p1), 'sem registro duplicado');
  perform tests.must_fail(format($$select public.register_attachment(%L, %L, 'x.pdf', 'photo')$$, moto, p2), 'arquivo inexistente');
  insert into storage.objects (bucket_id, name, owner_id, metadata) values ('attachments', p2, A::text, '{"size": 900, "mimetype": "video/mp4"}');
  perform tests.must_fail(format($$select public.register_attachment(%L, %L, 'v.pdf', 'document')$$, moto, p2), 'vídeo recusado');
  perform tests.must_fail(format($$update public.attachments set file_name = 'x' where id = %L$$, att), 'anexo não alterável');
  perform tests.must_fail(format($$delete from public.attachments where id = %L$$, att), 'anexo não apagável');
  perform tests.must_fail($$insert into storage.objects (bucket_id, name, metadata) values ('attachments', 'nao-e-uuid/x.jpg', '{}')$$, 'pasta fora do padrão');

  perform tests.act_as(null, null);
  update public.subscription_plans set storage_quota_mb = 1 where kind = 'free';
  perform tests.act_as(A, 'authenticated');
  insert into storage.objects (bucket_id, name, owner_id, metadata) values ('attachments', p3, A::text, '{"size": 900000, "mimetype": "image/jpeg"}');
  perform tests.must_fail(format($$select public.register_attachment(%L, %L, 'grande.jpg', 'photo')$$, moto, p3), 'cota respeitada');

  perform tests.act_as(B, 'authenticated');
  perform tests.ok((select count(*) = 0 from public.attachments), 'B não vê anexos');
  perform tests.ok((select count(*) = 0 from storage.objects where bucket_id = 'attachments' and name like moto || '/%'), 'B não lista arquivos de A');
  perform tests.must_fail(format($$insert into storage.objects (bucket_id, name, metadata) values ('attachments', %L, '{}')$$, moto || '/bbbbbbbb-0000-0000-0000-000000000001.jpg'), 'B não envia para pasta de A');
  perform tests.must_fail(format($$select public.register_attachment(%L, %L, 'x.jpg', 'photo')$$, moto, p3), 'B não registra anexo de A');
  perform tests.ok(((public.get_storage_usage() ->> 'used_bytes')::bigint = 0), 'uso de B separado');

  perform tests.act_as(null, 'anon');
  perform tests.must_fail($$select * from public.attachments$$, 'anônimo não lê anexos');
  perform tests.ok((select count(*) = 0 from storage.objects where bucket_id = 'attachments'), 'anônimo não lista arquivos');

  perform tests.act_as(null, null);
  perform tests.must_fail($$delete from public.attachments$$, 'anexos não apagáveis (dono do banco)');
  perform tests.ok((select public = false and file_size_limit = 10485760 from storage.buckets where id = 'attachments'), 'bucket privado com limite');
  perform tests.ok((select count(*) >= 1 from public.audit_logs where entity_type = 'attachments' and motorcycle_id = moto), 'anexos auditados');

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', current_setting('tests.n');
end
$test$;
