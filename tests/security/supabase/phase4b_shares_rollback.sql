-- =============================================================================
-- Testes do compartilhamento controlado — versão para o SUPABASE REAL
-- (transação desfeita no final). "FALHOU: ..." indica falha real.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  moto uuid; pub text; sh jsonb; tok text; tok2 text; sid uuid; p jsonb; tr uuid;
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
  select public_id into pub from public.motorcycles where id = moto;
  perform public.create_maintenance_record(moto, 'revision', 'Revisão', current_date - 5, p_service_value_cents => 30000, p_notes => 'Segredo da Ana');
  perform public.create_diary_entry(moto, 'trip', 'Viagem aberta', current_date, null, null, 'shareable');
  perform public.create_diary_entry(moto, 'other', 'Nota fechada', current_date);
  sh := public.create_passport_share(moto, 'Anúncio');
  tok := sh ->> 'token'; sid := (sh ->> 'id')::uuid;
  tok2 := public.create_passport_share(moto, 'Completo', 30, true, true, true, true, true, true) ->> 'token';
  perform tests.ok(tok ~ '^[0-9a-f]{48}$', 'código de 192 bits');
  perform tests.must_fail($$select * from public.passport_shares$$, 'tabela não lida diretamente');

  perform tests.act_as(null, 'anon');
  p := public.get_shared_passport(tok);
  perform tests.ok(p ->> 'brand' = 'Honda' and not (p ? 'plate') and not (p ? 'diary') and jsonb_array_length(p -> 'history') = 1, 'anônimo abre o link padrão');
  perform tests.ok(p::text !~ 'Segredo|recorded_by|email|public_id|30000', 'padrão sem valores, observações, autoria e ids');
  p := public.get_shared_passport(tok2);
  perform tests.ok(p ->> 'plate' = 'WSX2E34' and (p -> 'history' -> 0 ->> 'service_value_cents')::int = 30000, 'completo com placa e valores');
  perform tests.ok(p::text ~ 'Viagem aberta' and p::text !~ 'Nota fechada', 'diário só compartilhável');
  perform tests.ok(public.get_shared_passport(repeat('a', 48)) is null, 'código inexistente não abre');

  perform tests.act_as(A, 'authenticated');
  perform tests.ok((select view_count = 1 from public.get_motorcycle_shares(moto) where id = sid), 'acessos contados');
  perform public.revoke_passport_share(sid);
  perform tests.act_as(null, 'anon');
  perform tests.ok(public.get_shared_passport(tok) is null, 'revogado para de funcionar');

  perform tests.act_as(B, 'authenticated');
  perform tests.must_fail(format($$select public.create_passport_share(%L)$$, moto), 'não titular não cria link');
  perform tests.must_fail(format($$select public.set_public_page_enabled(%L, false)$$, moto), 'não titular não mexe na página');

  perform tests.act_as(A, 'authenticated');
  perform public.set_public_page_enabled(moto, false);
  perform tests.act_as(null, 'anon');
  perform tests.ok(public.get_public_passport(pub) is null, 'página básica desativada');
  perform tests.act_as(A, 'authenticated');
  perform public.set_public_page_enabled(moto, true);
  perform tests.act_as(null, 'anon');
  perform tests.ok(public.get_public_passport(pub) is not null, 'página básica reativada');

  -- Venda encerra os links do antigo dono
  perform tests.act_as(A, 'authenticated');
  tr := public.create_transfer_request(moto, 'bruno@teste.invalid');
  perform tests.act_as(B, 'authenticated');
  perform public.accept_transfer_request(tr);
  perform tests.act_as(null, 'anon');
  perform tests.ok(public.get_shared_passport(tok2) is null, 'link do antigo dono para após a venda');
  perform tests.act_as(B, 'authenticated');
  perform tests.ok((select count(*) = 0 from public.get_motorcycle_shares(moto)), 'novo dono não herda links');

  perform tests.act_as(null, null);
  perform tests.must_fail($$delete from public.passport_shares$$, 'links não são apagados');
  perform tests.ok((select count(*) >= 3 from public.audit_logs where entity_type = 'passport_shares' and motorcycle_id = moto), 'links auditados');

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', current_setting('tests.n');
end
$test$;
