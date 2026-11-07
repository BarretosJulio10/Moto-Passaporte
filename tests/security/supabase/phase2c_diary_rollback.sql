-- =============================================================================
-- Testes do diário — versão para o SUPABASE REAL (transação desfeita no final).
-- O envio é simulado com INSERT em storage.objects (owner_id e metadata como o
-- serviço de Storage gravaria). "FALHOU: ..." indica falha real.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  moto uuid; pub uuid; priv uuid; b_entry uuid; att_pub uuid; att_priv uuid;
  ph1 text; ph2 text; paths text[]; removed text;
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
        case when p_uid is null then '{"role":"anon"}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
      if p_role is not null then execute format('set role %I', p_role); end if;
    end $b$ $f$;
  execute 'grant usage on schema tests to anon, authenticated';
  execute 'grant execute on all functions in schema tests to anon, authenticated';

  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated'),
    (B, 'bruno@teste.invalid', '{"full_name":"Bruno"}', 'authenticated', 'authenticated');

  perform tests.act_as(A, 'authenticated');
  moto := (public.register_motorcycle('Honda', 'CB 500F', 2022, 'WSX2E34', 12000) ->> 'motorcycle_id')::uuid;
  pub := public.create_diary_entry(moto, 'trip', 'Viagem à Serra', current_date - 10, 'Subida linda.', 'Serra', 'shareable');
  priv := public.create_diary_entry(moto, 'customization', 'Escapamento novo', current_date - 5, 'Segredo: custou caro.');
  perform tests.ok((select count(*) = 2 and bool_and(is_mine) from public.motorcycle_diary_feed where motorcycle_id = moto), 'A vê as duas entradas como dele');
  perform tests.ok((select visibility = 'private' from public.motorcycle_diary where id = priv), 'padrão é privado');
  perform tests.must_fail($$select author_id from public.motorcycle_diary$$, 'autor não é exposto');
  perform tests.must_fail(format($$select public.create_diary_entry(%L, 'trip', 'Futuro', current_date + 5)$$, moto), 'data futura recusada');
  perform tests.must_fail(format($$update public.motorcycle_diary set title = 'x' where id = %L$$, pub), 'alteração direta bloqueada');
  perform public.update_diary_entry(priv, 'customization', 'Escapamento esportivo', current_date - 5, 'Segredo: custou caro.', null, 'private');
  perform tests.ok((select title = 'Escapamento esportivo' from public.motorcycle_diary where id = priv), 'A edita a própria entrada');

  ph1 := moto || '/dddddddd-0000-0000-0000-000000000001.jpg';
  ph2 := moto || '/dddddddd-0000-0000-0000-000000000002.jpg';
  insert into storage.objects (bucket_id, name, owner_id, metadata) values
    ('attachments', ph1, A::text, '{"size": 200000, "mimetype": "image/jpeg"}'),
    ('attachments', ph2, A::text, '{"size": 100000, "mimetype": "image/jpeg"}'),
    ('attachments', moto || '/dddddddd-0000-0000-0000-000000000003.pdf', A::text, '{"size": 1000, "mimetype": "application/pdf"}');
  att_pub := public.register_attachment(moto, ph1, 'serra.jpg', 'invoice', null, pub);
  att_priv := public.register_attachment(moto, ph2, 'escape.jpg', 'photo', null, priv);
  perform tests.ok((select kind = 'photo' from public.attachments where id = att_pub), 'foto do diário sempre como foto');
  perform tests.must_fail(format($$select public.register_attachment(%L, %L, 'd.pdf', 'document', null, %L)$$, moto, moto || '/dddddddd-0000-0000-0000-000000000003.pdf', pub), 'PDF recusado no diário');
  perform tests.must_fail(format($$delete from public.attachments where id = %L$$, att_pub), 'foto não é apagada diretamente');

  perform tests.act_as(B, 'authenticated');
  perform tests.ok((select count(*) = 0 from public.motorcycle_diary_feed where motorcycle_id = moto), 'B não vê diário de A');
  perform tests.must_fail(format($$select public.delete_diary_entry(%L)$$, pub), 'B não exclui diário de A');
  perform tests.act_as(null, 'anon');
  perform tests.must_fail($$select * from public.motorcycle_diary_feed$$, 'anônimo não lê diário');

  -- Venda simulada A -> B
  perform tests.act_as(null, null);
  update public.motorcycle_ownerships set ended_at = now(), end_reason = 'transfer' where motorcycle_id = moto and ended_at is null;
  insert into public.motorcycle_ownerships (motorcycle_id, owner_user_id) values (moto, B);

  perform tests.act_as(B, 'authenticated');
  perform tests.ok((select count(*) = 1 and bool_and(id = pub and not is_mine) from public.motorcycle_diary_feed where motorcycle_id = moto), 'novo dono vê só a compartilhável, como de dono anterior');
  perform tests.ok((select count(*) = 1 from public.attachments where diary_entry_id is not null and motorcycle_id = moto), 'novo dono vê só a foto compartilhável');
  perform tests.ok((select count(*) = 0 from storage.objects where name = ph2), 'arquivo privado invisível ao novo dono');
  perform tests.ok((select count(*) = 1 from storage.objects where name = ph1), 'arquivo compartilhável visível ao novo dono');
  perform tests.ok(((public.get_storage_usage() ->> 'used_bytes')::bigint = 0), 'fotos de outro autor fora da cota');
  perform tests.must_fail(format($$select public.update_diary_entry(%L, 'trip', 'x', current_date)$$, pub), 'novo dono não edita entrada do anterior');
  b_entry := public.create_diary_entry(moto, 'first_ride', 'Primeiro passeio', current_date);

  perform tests.act_as(A, 'authenticated');
  perform tests.ok((select count(*) = 2 from public.motorcycle_diary_feed where motorcycle_id = moto), 'antigo dono vê as próprias entradas');
  perform tests.ok((select count(*) = 0 from public.motorcycle_diary_feed where id = b_entry), 'antigo dono não vê entradas do novo');
  perform tests.must_fail(format($$select public.update_diary_entry(%L, 'trip', 'x', current_date)$$, priv), 'antigo dono não edita mais');
  removed := public.delete_diary_photo(att_priv);
  perform tests.ok(removed = ph2, 'antigo dono remove a própria foto');
  -- No Supabase real, exclusão de arquivo só pela API do Storage (SQL direto é bloqueado);
  -- a política de exclusão é testada no banco local (phase2c_diary_test.sql).
  perform tests.ok((select count(*) = 1 from storage.objects where name = ph2), 'arquivo sem registro segue visível a quem enviou (para apagar pela API)');
  paths := public.delete_diary_entry(pub);
  perform tests.ok(paths = array[ph1], 'excluir entrada devolve os arquivos');
  perform tests.ok((select count(*) = 1 from storage.objects where name = ph1), 'arquivo liberado para quem enviou');

  perform tests.act_as(null, null);
  perform tests.ok((select count(*) >= 4 from public.audit_logs where entity_type = 'motorcycle_diary' and motorcycle_id = moto), 'diário auditado');
  perform tests.ok((select count(*) = 0 from public.audit_logs where entity_type = 'motorcycle_diary' and motorcycle_id = moto
                     and (coalesce(new_data, '{}')::text || coalesce(previous_data, '{}')::text) ~ 'Segredo|Escapamento|Serra'), 'auditoria sem conteúdo');

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', current_setting('tests.n');
end
$test$;
