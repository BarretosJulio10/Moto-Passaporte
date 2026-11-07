-- =============================================================================
-- Testes da Fase 2 (manutenção) — versão para o SUPABASE REAL.
-- Roda em uma transação e termina com o erro proposital "RESULTADO: ...",
-- que desfaz todos os dados de teste. "FALHOU: ..." indica falha real.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  moto uuid;
  rec1 uuid; rec2 uuid; rec4 uuid; void4 uuid;
  r jsonb;
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
  moto := (public.register_motorcycle('Honda', 'CB 500F', 2022, 'QAZ1W23', 12000) ->> 'motorcycle_id')::uuid;

  r := public.create_maintenance_record(moto, 'oil_change', 'Troca de óleo e filtro', current_date - 10,
    p_mileage => 16000, p_workshop_name => 'Oficina do Bairro', p_service_value_cents => 25000,
    p_items => '[{"item_name":"Óleo 10W40","brand":"Motul","quantity":3},{"item_name":"Filtro de óleo","part_number":"HF303"}]'::jsonb);
  rec1 := (r ->> 'id')::uuid;
  perform tests.ok(rec1 is not null, 'cria registro com peças');
  perform tests.ok((select count(*) = 2 from public.maintenance_items where maintenance_record_id = rec1), 'peças gravadas');
  perform tests.ok((select source_type = 'owner' from public.maintenance_records where id = rec1), 'origem dono');
  perform tests.ok((select count(*) = 1 from public.mileage_records where motorcycle_id = moto and note like 'Registrada com:%'), 'km vira leitura');
  perform tests.ok((select status = 'current' and jsonb_array_length(items) = 2 from public.maintenance_timeline where id = rec1), 'linha do tempo com peças');
  perform tests.must_fail(format($$update public.maintenance_records set title = 'x' where id = %L$$, rec1), 'não edita');
  perform tests.must_fail(format($$delete from public.maintenance_records where id = %L$$, rec1), 'não apaga');
  perform tests.must_fail(format($$select public.create_maintenance_record(%L, 'other', 'Futuro', current_date + 1)$$, moto), 'data futura');
  perform tests.must_fail(format($$select public.create_maintenance_record(%L, 'other', 'Sem motivo', current_date, p_corrects_record_id => %L)$$, moto, rec1), 'correção exige motivo');

  rec2 := (public.create_maintenance_record(moto, 'oil_change', 'Troca de óleo, filtro e vela', current_date - 10,
    p_mileage => 16000, p_corrects_record_id => rec1, p_correction_reason => 'Esqueci a vela') ->> 'id')::uuid;
  perform tests.ok((select status = 'superseded' from public.maintenance_timeline where id = rec1), 'original substituído');
  perform tests.ok((select status = 'current' from public.maintenance_timeline where id = rec2), 'correção vigente');
  perform tests.ok((select count(*) = 1 from public.mileage_records where motorcycle_id = moto and note like 'Registrada com:%'), 'mesma km não duplica leitura');
  perform tests.must_fail(format($$select public.create_maintenance_record(%L, 'other', 'Outra', current_date, p_corrects_record_id => %L, p_correction_reason => 'de novo')$$, moto, rec1), 'sem segunda correção');

  rec4 := (public.create_maintenance_record(moto, 'accessories', 'Baú lançado por engano', current_date) ->> 'id')::uuid;
  void4 := public.void_maintenance_record(rec4, 'Era de outra moto');
  perform tests.ok((select is_void from public.maintenance_records where id = void4), 'anulação registrada');
  perform tests.ok((select status = 'superseded' from public.maintenance_timeline where id = rec4), 'anulado continua visível');
  perform tests.must_fail(format($$select public.void_maintenance_record(%L, 'de novo')$$, rec4), 'não anula duas vezes');

  perform tests.act_as(B, 'authenticated');
  perform tests.ok((select count(*) = 0 from public.maintenance_records), 'B não vê registros de A');
  perform tests.ok((select count(*) = 0 from public.maintenance_items), 'B não vê peças de A');
  perform tests.ok((select count(*) = 0 from public.maintenance_timeline), 'B não vê linha do tempo de A');
  perform tests.must_fail(format($$select public.create_maintenance_record(%L, 'other', 'Invasão', current_date)$$, moto), 'B não registra');
  perform tests.must_fail(format($$select public.void_maintenance_record(%L, 'Invasão')$$, rec2), 'B não anula');

  perform tests.act_as(null, 'anon');
  perform tests.must_fail($$select * from public.maintenance_records$$, 'anônimo não lê registros');
  perform tests.must_fail($$select * from public.maintenance_timeline$$, 'anônimo não lê linha do tempo');

  perform tests.act_as(null, null);
  perform tests.must_fail($$update public.maintenance_items set item_name = 'x'$$, 'peças imutáveis');
  perform tests.must_fail($$delete from public.maintenance_records$$, 'registros não apagáveis');
  perform tests.ok((select count(*) >= 4 from public.audit_logs where entity_type = 'maintenance_records' and motorcycle_id = moto), 'registros auditados');

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', current_setting('tests.n');
end
$test$;
