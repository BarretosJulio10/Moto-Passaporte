-- =============================================================================
-- Testes de segurança da Fase 1 — versão para rodar NO SUPABASE REAL.
-- Tudo roda em um único bloco (uma transação). Ao final, o bloco lança um erro
-- proposital "RESULTADO: ..." que DESFAZ todos os dados de teste.
-- Uma falha real aparece como "FALHOU: ...".
-- Pode ser colado no SQL Editor do Supabase ou enviado via execute_sql.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  C uuid := '33333333-3333-3333-3333-333333333333';
  D uuid := '44444444-4444-4444-4444-444444444444';
  r      jsonb;
  moto_a uuid;
  pub_a  text;
  org_c  uuid;
  n      int;
begin
  -- Infraestrutura de teste (desfeita no final)
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
      begin
        execute p_sql;
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

  -- Usuários de teste
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid',    '{"full_name":"Ana","terms_accepted":true,"terms_version":"1.0","privacy_version":"1.0"}', 'authenticated', 'authenticated'),
    (B, 'bruno@teste.invalid',  '{"full_name":"Bruno","terms_accepted":true}', 'authenticated', 'authenticated'),
    (C, 'carlos@teste.invalid', '{"full_name":"Carlos","terms_accepted":true}', 'authenticated', 'authenticated'),
    (D, 'admin@teste.invalid',  '{"full_name":"Admin"}', 'authenticated', 'authenticated');

  perform tests.ok((select count(*) = 4 from public.profiles where id in (A, B, C, D)), 'perfil criado no cadastro');
  perform tests.ok((select count(*) = 4 from public.user_roles where user_id in (A, B, C, D) and role = 'owner'), 'papel owner no cadastro');
  perform tests.ok((select terms_accepted_at is not null from public.profiles where id = A), 'aceite dos termos registrado');
  insert into public.user_roles (user_id, role) values (D, 'admin');

  -- ===== Usuária A
  perform tests.act_as(A, 'authenticated');
  r := public.register_motorcycle('Honda', 'CB 500F', 2022, 'abc-1d23', 12000,
         p_model_year => 2023, p_displacement_cc => 471, p_color => 'Preta', p_chassis => '9c2pc4500nr000001');
  moto_a := (r->>'motorcycle_id')::uuid;
  pub_a  := r->>'public_id';
  perform tests.ok(r->>'status' = 'created', 'A cadastra a moto');
  perform tests.ok((select count(*) = 1 from public.my_motorcycles), 'moto em my_motorcycles');
  perform tests.ok((select current_plate = 'ABC1D23' and latest_mileage = 12000 from public.my_motorcycles), 'placa normalizada e km inicial');
  perform tests.ok((select chassis = '9C2PC4500NR000001' from public.motorcycle_private where motorcycle_id = moto_a), 'A vê o próprio chassi');
  perform tests.must_fail($$select public.register_motorcycle('Yamaha','MT-03',2021,'XYZ1234',5000)$$, 'limite do plano gratuito');
  perform tests.must_fail(format($$update public.motorcycles set public_id = 'x' where id = %L$$, moto_a), 'public_id imutável');
  perform tests.must_fail(format($$delete from public.motorcycles where id = %L$$, moto_a), 'moto não excluível');
  perform tests.must_fail(format($$insert into public.user_roles (user_id, role) values (%L, 'admin')$$, A), 'não vira admin');
  perform tests.must_fail($$update public.profiles set email = 'x@x.com'$$, 'não altera e-mail do perfil');
  perform tests.must_fail($$select public.write_audit('x','x','x')$$, 'não escreve auditoria');
  perform tests.must_fail(format($$insert into public.motorcycle_ownerships (motorcycle_id, owner_user_id) values (%L, %L)$$, moto_a, A), 'não cria titularidade');
  update public.motorcycles set color = 'Vermelha' where id = moto_a;
  perform tests.ok(found, 'A edita dados básicos');
  update public.profiles set full_name = 'Ana Souza' where id = A;
  perform tests.ok(found, 'A edita o próprio nome');
  perform tests.ok((public.record_mileage(moto_a, 15000)->>'below_previous')::boolean = false, 'km maior sem alerta');
  perform tests.ok((public.record_mileage(moto_a, 9000, p_note => 'teste')->>'below_previous')::boolean = true, 'km menor gera alerta');
  perform tests.must_fail($$update public.mileage_records set mileage = 1$$, 'km não sobrescrita');
  perform tests.must_fail($$delete from public.mileage_records$$, 'km não excluída');
  perform public.change_motorcycle_plate(moto_a, 'ABC1234');
  perform tests.ok((select count(*) = 2 from public.motorcycle_plates where motorcycle_id = moto_a), 'troca de placa preserva histórico');
  perform tests.ok((select count(*) = 1 from public.motorcycles), 'troca de placa não cria moto');
  update public.motorcycle_private set chassis = '9C2PC4500NR000002' where motorcycle_id = moto_a;
  perform tests.ok((select count(*) = 0 from public.audit_logs), 'comum não lê auditoria');

  -- ===== Usuário B
  perform tests.act_as(B, 'authenticated');
  perform tests.ok((select count(*) = 0 from public.motorcycles), 'B não vê moto de A');
  perform tests.ok((select count(*) = 0 from public.motorcycle_plates), 'B não vê placas');
  perform tests.ok((select count(*) = 0 from public.motorcycle_private), 'B não vê chassi');
  perform tests.ok((select count(*) = 0 from public.mileage_records), 'B não vê km');
  perform tests.ok((select count(*) = 0 from public.motorcycle_ownerships), 'B não vê titularidade');
  perform tests.ok((select count(*) = 1 from public.profiles), 'B vê só o próprio perfil');
  perform tests.ok((public.register_motorcycle('Honda','CB 500F',2022,'ABC-1234',100)->>'status') = 'verification_required', 'duplicidade gera verificação');
  perform tests.ok((select count(*) = 0 from public.motorcycles), 'verificação não revela moto');
  perform tests.must_fail($$select motorcycle_id from public.motorcycle_claim_requests$$, 'B não vê moto do pedido');
  perform tests.ok((select count(*) = 1 from public.motorcycle_claim_requests), 'B acompanha o pedido');
  perform tests.ok((public.register_motorcycle('Yamaha','Fazer 250',2019,'ABC1D23',30000)->>'status') = 'created', 'placa antiga reutilizável');
  update public.motorcycles set color = 'Hackeada' where id = moto_a;
  perform tests.ok(not found, 'B não edita moto de A');
  update public.motorcycle_private set chassis = 'XXXXX' where motorcycle_id = moto_a;
  perform tests.ok(not found, 'B não altera chassi de A');
  perform tests.must_fail(format($$select public.change_motorcycle_plate(%L, 'QWE1234')$$, moto_a), 'B não troca placa de A');
  perform tests.must_fail(format($$select public.record_mileage(%L, 99999)$$, moto_a), 'B não registra km de A');

  -- ===== Anônimo
  perform tests.act_as(null, 'anon');
  perform tests.ok((public.get_public_passport(pub_a)->>'brand') = 'Honda', 'passaporte público responde');
  perform tests.ok(not (public.get_public_passport(pub_a) ?| array['plate','chassis','owner','current_plate']), 'passaporte sem dados privados');
  perform tests.ok(public.get_public_passport('00000000000000000000000000000000') is null, 'public_id inexistente vazio');
  perform tests.ok(public.get_public_passport(moto_a::text) is null, 'id interno não é link público');
  perform tests.must_fail($$select * from public.motorcycles$$, 'anônimo não lê motos');
  perform tests.must_fail($$select * from public.profiles$$, 'anônimo não lê perfis');
  perform tests.must_fail($$select public.register_motorcycle('a','b',2020,'AAA1111',1)$$, 'anônimo não cadastra');
  perform tests.ok((select count(*) >= 1 and bool_and(is_public) from public.system_settings), 'anônimo vê só configs públicas');

  -- ===== Oficina C
  perform tests.act_as(C, 'authenticated');
  org_c := public.create_workshop('Oficina do Carlos', 'oficina-do-carlos-teste', 'Barretos', 'sp', p_cnpj => '12.345.678/0001-90');
  perform tests.ok(public.has_role('workshop'), 'oficina recebe papel workshop');
  perform tests.ok(public.is_org_responsible(org_c), 'criador é responsável');
  perform tests.ok((select cnpj = '12345678000190' and state = 'SP' from public.workshops where organization_id = org_c), 'CNPJ e UF normalizados');
  perform tests.ok((select count(*) = 0 from public.motorcycles), 'oficina não vê motos');
  update public.workshops set description = 'Especialista' where organization_id = org_c;
  perform tests.ok(found, 'responsável edita perfil');
  perform tests.must_fail(format($$update public.workshops set verification_status = 'verified' where organization_id = %L$$, org_c), 'não se autoverifica');

  perform tests.act_as(A, 'authenticated');
  perform tests.ok((select count(*) >= 1 from public.workshops where organization_id = org_c), 'perfil público visível');
  perform tests.ok((select count(*) = 0 from public.organizations), 'A não vê organização');
  perform tests.ok((select count(*) = 0 from public.organization_members), 'A não vê membros');
  update public.workshops set description = 'invadido' where organization_id = org_c;
  perform tests.ok(not found, 'A não edita oficina alheia');

  perform tests.act_as(null, 'anon');
  perform tests.ok((select count(*) >= 1 from public.workshops where organization_id = org_c), 'anônimo vê perfil público');

  -- ===== Admin D
  perform tests.act_as(D, 'authenticated');
  perform tests.ok((select count(*) > 0 from public.audit_logs), 'admin lê auditoria');
  perform tests.ok((select count(*) >= 2 from public.motorcycles), 'admin vê dados básicos');
  perform tests.ok((select count(*) = 0 from public.motorcycle_private), 'admin não vê chassi');
  perform tests.ok((select count(*) = 0 from public.motorcycle_plates), 'admin não vê placas');
  perform tests.must_fail($$update public.audit_logs set action = 'x'$$, 'admin não altera auditoria');

  -- ===== Integridade (privilégio máximo)
  perform tests.act_as(null, null);
  perform tests.must_fail($$delete from public.audit_logs$$, 'auditoria não apagável');
  perform tests.must_fail($$truncate public.audit_logs$$, 'auditoria não truncável');
  perform tests.must_fail($$delete from public.motorcycles$$, 'motos não apagáveis');
  perform tests.must_fail($$delete from public.motorcycle_ownerships$$, 'titularidades não apagáveis');
  perform tests.must_fail($$delete from public.motorcycle_plates$$, 'placas não apagáveis');
  perform tests.must_fail($$update public.mileage_records set mileage = 1$$, 'km não sobrescrita (dono do banco)');
  perform tests.must_fail(format($$delete from auth.users where id = %L$$, A), 'excluir conta não apaga história');
  perform tests.ok((select count(*) = 0 from public.audit_logs where action = 'chassis_changed' and new_data is not null), 'auditoria de chassi sem valor');
  perform tests.ok((select count(*) >= 1 from public.audit_logs where action = 'duplicate_plate_claim'), 'duplicidade auditada');

  n := current_setting('tests.n')::int;
  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
