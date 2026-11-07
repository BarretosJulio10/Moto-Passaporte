-- =============================================================================
-- Testes de pesquisa por placa e autorizações — versão para o SUPABASE REAL (transação desfeita no final).
-- O envio é simulado com INSERT em storage.objects (owner_id e metadata como o
-- serviço de Storage gravaria). "FALHOU: ..." indica falha real.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  C uuid := '33333333-3333-3333-3333-333333333333';
  X uuid := '55555555-5555-5555-5555-555555555555';
  moto uuid; org uuid; res jsonb; acc uuid; acc2 uuid;
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
    (C, 'carlos@teste.invalid', '{"full_name":"Carlos"}', 'authenticated', 'authenticated'),
    (X, 'xavier@teste.invalid', '{"full_name":"Xavier"}', 'authenticated', 'authenticated');

  perform tests.act_as(A, 'authenticated');
  moto := (public.register_motorcycle('Honda', 'CB 500F', 2022, 'WSX2E34', 12000) ->> 'motorcycle_id')::uuid;
  perform tests.act_as(C, 'authenticated');
  org := public.create_workshop('Oficina Teste Rollback', 'oficina-teste-rollback-x9', 'Barretos', 'SP');

  perform tests.ok((public.search_motorcycle_by_plate(org, 'ZZZ9Z98') ->> 'found') = 'false', 'placa inexistente');
  res := public.search_motorcycle_by_plate(org, 'wsx2e34');
  perform tests.ok((res ->> 'found') = 'true' and res ->> 'brand' = 'Honda', 'placa encontrada');
  perform tests.ok(not (res ?| array['owner', 'plate', 'chassis', 'latest_mileage', 'public_id']) and res ->> 'motorcycle_id' is null, 'só o mínimo antes da autorização');
  perform tests.ok((select count(*) = 0 from public.plate_search_log), 'oficina não lê registro de pesquisas');
  acc := (public.request_workshop_access(org, 'WSX2E34', 'Revisão') ->> 'id')::uuid;
  perform tests.ok((public.request_workshop_access(org, 'WSX2E34') ->> 'id')::uuid = acc, 'pedido repetido devolve o mesmo');
  perform tests.must_fail(format($$select public.decide_workshop_access(%L, true)$$, acc), 'oficina não aprova o próprio pedido');
  perform tests.must_fail(format($$update public.motorcycle_workshop_access set status = 'approved' where id = %L$$, acc), 'alteração direta bloqueada');
  perform tests.ok((select plate is null and motorcycle_id is null from public.get_workshop_access_list(org) where id = acc), 'pendente sem placa nem id');

  perform tests.act_as(X, 'authenticated');
  perform tests.must_fail(format($$select public.search_motorcycle_by_plate(%L, 'WSX2E34')$$, org), 'não membro não pesquisa');
  perform tests.must_fail(format($$select * from public.get_motorcycle_workshop_access(%L)$$, moto), 'não titular não vê autorizações');
  perform tests.ok((select count(*) = 0 from public.motorcycle_workshop_access where id = acc), 'X não vê pedidos');
  perform tests.act_as(null, 'anon');
  perform tests.must_fail(format($$select public.search_motorcycle_by_plate(%L, 'WSX2E34')$$, org), 'anônimo não pesquisa');

  perform tests.act_as(A, 'authenticated');
  perform tests.ok((select count(*) = 1 from public.get_my_pending_access_requests() where workshop_name = 'Oficina Teste Rollback'), 'titular vê pendência');
  perform public.decide_workshop_access(acc, true);
  perform tests.act_as(C, 'authenticated');
  perform tests.ok(public.workshop_has_access(moto, org), 'aprovado dá acesso');
  perform tests.ok((select plate = 'WSX2E34' and latest_mileage = 12000 and motorcycle_id = moto from public.get_workshop_access_list(org) where id = acc), 'aprovado vê placa, km e id');

  perform tests.act_as(A, 'authenticated');
  perform public.revoke_workshop_access(acc);
  perform tests.act_as(C, 'authenticated');
  perform tests.ok(not public.workshop_has_access(moto), 'revogação bloqueia na hora');
  perform tests.ok((select plate is null from public.get_workshop_access_list(org) where id = acc), 'revogada sem placa');
  acc2 := (public.request_workshop_access(org, 'WSX2E34') ->> 'id')::uuid;
  perform tests.ok(acc2 <> acc, 'novo acesso exige novo pedido');
  perform tests.act_as(A, 'authenticated');
  perform public.decide_workshop_access(acc2, false);
  perform tests.act_as(C, 'authenticated');
  perform tests.must_fail(format($$select public.request_workshop_access(%L, 'WSX2E34')$$, org), 'espera após recusa');

  perform tests.act_as(null, null);
  perform tests.ok((select count(*) = 2 and bool_and(plate_hash ~ '^[0-9a-f]{64}$') from public.plate_search_log where organization_id = org), 'pesquisas registradas só com hash');
  perform tests.must_fail($$delete from public.motorcycle_workshop_access$$, 'autorizações não são apagadas');
  perform tests.ok((select count(*) >= 5 from public.audit_logs where entity_type = 'motorcycle_workshop_access' and motorcycle_id = moto), 'autorizações auditadas');

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', current_setting('tests.n');
end
$test$;
