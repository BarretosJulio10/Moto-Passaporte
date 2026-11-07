-- =============================================================================
-- Testes da Oficina de Origem — versão para o SUPABASE REAL (transação desfeita no final).
-- O envio é simulado com INSERT em storage.objects (owner_id e metadata como o
-- serviço de Storage gravaria). "FALHOU: ..." indica falha real.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  C uuid := '33333333-3333-3333-3333-333333333333';
  D uuid := '44444444-4444-4444-4444-444444444444';
  moto uuid; org_c uuid; org_d uuid; acc_c uuid; acc_d uuid;
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
    (C, 'carlos@teste.invalid', '{"full_name":"Carlos"}', 'authenticated', 'authenticated'),
    (D, 'davi@teste.invalid', '{"full_name":"Davi"}', 'authenticated', 'authenticated');

  perform tests.act_as(A, 'authenticated');
  moto := (public.register_motorcycle('Honda', 'CB 500F', 2022, 'WSX2E34', 12000) ->> 'motorcycle_id')::uuid;
  perform tests.act_as(C, 'authenticated');
  org_c := public.create_workshop('Oficina Origem Teste', 'oficina-origem-teste-x9', 'Barretos', 'SP');
  perform tests.ok((public.search_motorcycle_by_plate(org_c, 'WSX2E34') ->> 'origin_available') = 'true', 'passaporte novo aceita Origem');
  acc_c := (public.request_workshop_access(org_c, 'WSX2E34', 'Ajudamos no cadastro', true) ->> 'id')::uuid;
  perform tests.must_fail(format($$select public.set_origin_workshop(%L, true)$$, acc_c), 'oficina não se define como Origem');
  perform tests.act_as(D, 'authenticated');
  org_d := public.create_workshop('Segunda Oficina Teste', 'segunda-oficina-teste-x9', 'Franca', 'SP');

  perform tests.act_as(A, 'authenticated');
  perform public.decide_workshop_access(acc_c, true);
  perform tests.ok((select access_type = 'origin' and status = 'approved' from public.motorcycle_workshop_access where id = acc_c), 'titular aprova como Origem');
  perform tests.ok((select bool_and(not origin_available) from public.get_motorcycle_workshop_access(moto)), 'só uma Origem');

  perform tests.act_as(D, 'authenticated');
  perform tests.must_fail(format($$select public.request_workshop_access(%L, 'WSX2E34', null, true)$$, org_d), 'segundo pedido de Origem recusado');
  acc_d := (public.request_workshop_access(org_d, 'WSX2E34') ->> 'id')::uuid;
  perform tests.act_as(A, 'authenticated');
  perform public.decide_workshop_access(acc_d, true);
  perform tests.must_fail(format($$select public.set_origin_workshop(%L, true)$$, acc_d), 'não define segunda Origem');
  perform public.set_origin_workshop(acc_c, false);
  perform tests.ok((select access_type = 'regular' and status = 'approved' from public.motorcycle_workshop_access where id = acc_c), 'tira o título sem cortar acesso');
  perform public.set_origin_workshop(acc_d, true);
  perform tests.ok((select access_type = 'origin' from public.motorcycle_workshop_access where id = acc_d), 'define outra autorizada como Origem');
  perform public.revoke_workshop_access(acc_d);
  perform tests.act_as(D, 'authenticated');
  perform tests.ok(not public.workshop_has_access(moto), 'Origem revogada perde acesso');

  perform tests.act_as(null, null);
  update public.system_settings set value = '0' where key = 'origin_workshop_window_days';
  perform tests.act_as(A, 'authenticated');
  perform tests.must_fail(format($$select public.set_origin_workshop(%L, true)$$, acc_c), 'fora do prazo não define Origem');
  perform tests.must_fail(format($$update public.motorcycle_workshop_access set access_type = 'origin' where id = %L$$, acc_c), 'alteração direta bloqueada');
  perform tests.act_as(null, null);
  perform tests.must_fail(format($$update public.motorcycle_workshop_access set access_type = 'regular' where id = %L$$, acc_d), 'encerrada não muda de tipo');
  perform tests.ok((select count(*) >= 3 from public.audit_logs where entity_type = 'motorcycle_workshop_access' and motorcycle_id = moto and new_data ->> 'access_type' = 'origin'), 'Origem auditada');

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', current_setting('tests.n');
end
$test$;
