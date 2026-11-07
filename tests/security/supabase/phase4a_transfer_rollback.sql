-- =============================================================================
-- Testes da transferência do passaporte — versão para o SUPABASE REAL
-- (transação desfeita no final). "FALHOU: ..." indica falha real.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  C uuid := '33333333-3333-3333-3333-333333333333';
  moto uuid; org uuid; acc uuid; rec uuid; tr uuid; tr2 uuid;
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
    (B, 'bruno@teste.invalid', '{"full_name":"Bruno"}', 'authenticated', 'authenticated'),
    (C, 'carlos@teste.invalid', '{"full_name":"Carlos"}', 'authenticated', 'authenticated');

  perform tests.act_as(A, 'authenticated');
  moto := (public.register_motorcycle('Honda', 'CB 500F', 2022, 'WSX2E34', 12000) ->> 'motorcycle_id')::uuid;
  rec := (public.create_maintenance_record(moto, 'revision', 'Revisão', current_date - 5) ->> 'id')::uuid;
  perform tests.act_as(C, 'authenticated');
  org := public.create_workshop('Transfer Teste', 'transfer-teste-x9', 'Barretos', 'SP');
  acc := (public.request_workshop_access(org, 'WSX2E34', null, true) ->> 'id')::uuid;
  perform tests.act_as(A, 'authenticated');
  perform public.decide_workshop_access(acc, true, true);

  perform tests.must_fail(format($$select public.create_transfer_request(%L, 'ana@teste.invalid')$$, moto), 'não transfere para si');
  tr := public.create_transfer_request(moto, ' Bruno@Teste.INVALID ', 'Vendida');
  perform tests.must_fail(format($$select public.create_transfer_request(%L, 'x@y.com')$$, moto), 'um pedido aberto por moto');
  perform tests.must_fail($$select * from public.transfer_requests$$, 'tabela não lida diretamente');

  perform tests.act_as(C, 'authenticated');
  perform tests.must_fail(format($$select public.accept_transfer_request(%L)$$, tr), 'outra conta não aceita');
  perform tests.ok((select count(*) = 0 from public.get_my_incoming_transfers()), 'outra conta não vê');

  perform tests.act_as(B, 'authenticated');
  perform tests.ok((select count(*) = 1 and bool_and(from_name = 'Ana' and plate = 'WSX2E34' and maintenance_count = 1 and latest_mileage = 12000)
                      from public.get_my_incoming_transfers()), 'comprador vê o pedido');
  perform tests.ok(public.accept_transfer_request(tr, current_date) = moto, 'comprador aceita');
  perform tests.ok(public.is_current_owner(moto), 'comprador é o titular');
  perform tests.ok((select count(*) = 1 from public.maintenance_timeline where id = rec), 'histórico acompanha a moto');
  perform tests.must_fail(format($$select public.accept_transfer_request(%L)$$, tr), 'não aceita duas vezes');

  perform tests.act_as(null, null);
  perform tests.ok((select status = 'ended' and end_reason = 'transfer' and access_type = 'origin' from public.motorcycle_workshop_access where id = acc), 'Oficina de Origem encerrada');
  perform tests.act_as(C, 'authenticated');
  perform tests.ok(not public.workshop_has_access(moto), 'oficina sem acesso após a transferência');

  perform tests.act_as(A, 'authenticated');
  perform tests.ok(not public.is_current_owner(moto), 'antigo titular deixa de ser titular');
  perform tests.ok((select count(*) = 0 from public.maintenance_timeline where motorcycle_id = moto), 'antigo titular não vê histórico');
  perform tests.ok((select count(*) = 1 from public.get_my_previous_motorcycles() where motorcycle_id = moto), 'motos anteriores');

  perform tests.act_as(B, 'authenticated');
  tr2 := public.create_transfer_request(moto, 'carlos@teste.invalid');
  perform tests.act_as(C, 'authenticated');
  perform public.reject_transfer_request(tr2);
  perform tests.act_as(B, 'authenticated');
  perform tests.ok((select status = 'rejected' from public.get_motorcycle_transfers(moto) where id = tr2), 'recusa registrada');
  perform tests.ok(public.is_current_owner(moto), 'recusa mantém o titular');

  perform tests.act_as(null, null);
  perform tests.must_fail($$delete from public.transfer_requests$$, 'transferências não são apagadas');
  perform tests.ok((select count(*) >= 3 from public.audit_logs where entity_type = 'transfer_requests' and motorcycle_id = moto), 'transferências auditadas');

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', current_setting('tests.n');
end
$test$;
