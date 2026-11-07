-- =============================================================================
-- Testes dos serviços registrados pela oficina — versão para o SUPABASE REAL
-- (transação desfeita no final). "FALHOU: ..." indica falha real.
-- O envio é simulado com INSERT em storage.objects (owner_id e metadata).
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  C uuid := '33333333-3333-3333-3333-333333333333';
  X uuid := '55555555-5555-5555-5555-555555555555';
  moto uuid; org uuid; org_x uuid; acc uuid; rec_owner uuid; rec_ws uuid; att uuid; p_owner text; p_ws text;
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
    (X, 'xavier@teste.invalid', '{"full_name":"Xavier"}', 'authenticated', 'authenticated');

  perform tests.act_as(A, 'authenticated');
  moto := (public.register_motorcycle('Honda', 'CB 500F', 2022, 'WSX2E34', 12000) ->> 'motorcycle_id')::uuid;
  rec_owner := (public.create_maintenance_record(moto, 'tires', 'Pneu do dono', current_date - 20, p_service_value_cents => 70000, p_notes => 'Segredo') ->> 'id')::uuid;
  p_owner := moto || '/eeeeeeee-0000-0000-0000-000000000001.pdf';
  insert into storage.objects (bucket_id, name, owner_id, metadata) values ('attachments', p_owner, A::text, '{"size": 5000, "mimetype": "application/pdf"}');
  perform public.register_attachment(moto, p_owner, 'nf-dono.pdf', 'invoice', rec_owner);

  perform tests.act_as(C, 'authenticated');
  org := public.create_workshop('Servicos Teste', 'servicos-teste-x9', 'Barretos', 'SP');
  acc := (public.request_workshop_access(org, 'WSX2E34') ->> 'id')::uuid;
  perform tests.must_fail(format($$select public.create_workshop_service(%L, %L, 'revision', 'X', current_date)$$, org, moto), 'sem autorização não registra');
  perform tests.act_as(A, 'authenticated');
  perform public.decide_workshop_access(acc, true);

  perform tests.act_as(C, 'authenticated');
  rec_ws := (public.create_workshop_service(org, moto, 'revision', 'Revisão', current_date - 1, p_mileage => 13000,
             p_service_value_cents => 45000, p_notes => 'Obs da oficina', p_items => '[{"item_name":"Óleo","quantity":3}]') ->> 'id')::uuid;
  perform tests.ok((select is_own and service_value_cents = 45000 and recorded_by_name = 'Carlos' and evidence_level = 'workshop'
                      from public.get_workshop_timeline(org, moto) where id = rec_ws), 'oficina vê o próprio registro completo');
  perform tests.ok((select not is_own and service_value_cents is null and notes is null and attachments = '[]'::jsonb
                      from public.get_workshop_timeline(org, moto) where id = rec_owner), 'registro do dono só técnico');
  perform tests.ok((select count(*) = 0 from storage.objects where name = p_owner), 'oficina não lê arquivo do dono');
  p_ws := moto || '/eeeeeeee-0000-0000-0000-000000000002.jpg';
  insert into storage.objects (bucket_id, name, owner_id, metadata) values ('attachments', p_ws, C::text, '{"size": 80000, "mimetype": "image/jpeg"}');
  att := public.register_workshop_attachment(org, p_ws, 'os.jpg', 'service_order', rec_ws);
  perform tests.ok(((public.get_workshop_storage_usage(org) ->> 'used_bytes')::bigint = 80000), 'cota da oficina');
  perform tests.ok((select count(*) = 1 from storage.objects where name = p_ws), 'oficina lê o próprio arquivo');
  perform tests.must_fail(format($$select public.register_workshop_attachment(%L, %L, 'x.pdf', 'invoice', %L)$$, org, p_owner, rec_owner), 'não anexa em registro do dono');
  perform tests.must_fail(format($$select public.create_workshop_service(%L, %L, 'revision', 'X', current_date, p_corrects_record_id => %L, p_correction_reason => 'tentativa')$$, org, moto, rec_owner), 'não corrige registro do dono');

  perform tests.act_as(A, 'authenticated');
  perform tests.ok((select evidence_level = 'workshop' and recorded_by_name = 'Carlos' and workshop_name = 'Servicos Teste' from public.maintenance_timeline where id = rec_ws), 'titular vê confirmado por oficina');
  perform tests.ok(((public.get_storage_usage() ->> 'used_bytes')::bigint = 5000), 'comprovante da oficina fora da cota do titular');
  perform tests.must_fail(format($$select public.create_maintenance_record(%L, 'revision', 'X', current_date, p_corrects_record_id => %L, p_correction_reason => 'tentativa')$$, moto, rec_ws), 'titular não corrige registro da oficina');

  perform tests.act_as(X, 'authenticated');
  org_x := public.create_workshop('Outra Teste', 'outra-teste-x9', 'Franca', 'SP');
  perform tests.must_fail(format($$select * from public.get_workshop_timeline(%L, %L)$$, org_x, moto), 'outra oficina não vê histórico');
  perform tests.must_fail(format($$insert into storage.objects (bucket_id, name, metadata) values ('attachments', %L, '{}')$$, moto || '/eeeeeeee-0000-0000-0000-000000000009.jpg'), 'outra oficina não envia arquivo');

  perform tests.act_as(A, 'authenticated');
  perform public.revoke_workshop_access(acc);
  perform tests.act_as(C, 'authenticated');
  perform tests.must_fail(format($$select public.create_workshop_service(%L, %L, 'revision', 'X', current_date)$$, org, moto), 'revogada não registra');
  perform tests.ok((select count(*) = 0 from storage.objects where name = p_ws), 'revogada não abre arquivos');

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', current_setting('tests.n');
end
$test$;
