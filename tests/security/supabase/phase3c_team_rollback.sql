-- =============================================================================
-- Testes da equipe da oficina (convites e permissões) — versão para o SUPABASE REAL
-- (transação desfeita no final). "FALHOU: ..." indica falha real.
-- =============================================================================

do $test$
declare
  B uuid := '22222222-2222-2222-2222-222222222222';
  C uuid := '33333333-3333-3333-3333-333333333333';
  D uuid := '44444444-4444-4444-4444-444444444444';
  org uuid; inv jsonb; tok text; mem_b uuid; mem_c uuid;
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
    (B, 'bruno@teste.invalid', '{"full_name":"Bruno"}', 'authenticated', 'authenticated'),
    (C, 'carlos@teste.invalid', '{"full_name":"Carlos"}', 'authenticated', 'authenticated'),
    (D, 'davi@teste.invalid', '{"full_name":"Davi"}', 'authenticated', 'authenticated');

  perform tests.act_as(C, 'authenticated');
  org := public.create_workshop('Equipe Teste', 'equipe-teste-x9', 'Barretos', 'SP');
  select id into mem_c from public.organization_members where organization_id = org and user_id = C;
  inv := public.create_org_invite(org, ' Bruno@Teste.INVALID ', true, false);
  tok := inv ->> 'token';
  perform tests.ok(char_length(tok) = 48, 'token aleatório');
  perform tests.must_fail($$select * from public.organization_invites$$, 'convites não lidos diretamente');

  perform tests.act_as(D, 'authenticated');
  perform tests.must_fail(format($$select public.create_org_invite(%L, 'x@y.com')$$, org), 'não responsável não convida');
  perform tests.ok((public.get_invite_preview(tok) ->> 'email_matches') = 'false', 'prévia avisa e-mail diferente');
  perform tests.must_fail(format($$select public.accept_org_invite(%L)$$, tok), 'outro e-mail não aceita');

  perform tests.act_as(B, 'authenticated');
  perform tests.ok((public.get_invite_preview(tok) ->> 'status') = 'open', 'prévia aberta');
  perform tests.ok(public.accept_org_invite(tok) = org, 'convidado aceita');
  perform tests.ok(public.is_org_member(org) and not public.is_org_responsible(org) and public.has_role('workshop'), 'entra como funcionário com papel oficina');
  perform tests.must_fail(format($$select public.accept_org_invite(%L)$$, tok), 'uso único');
  perform tests.ok(public.has_org_permission(org, 'request_access') and not public.has_org_permission(org, 'register_services'), 'permissões aplicadas');
  perform tests.ok((select email is null from public.get_org_members(org) where user_id = C), 'funcionário não vê e-mail dos colegas');
  select id into mem_b from public.organization_members where organization_id = org and user_id = B;
  perform tests.must_fail(format($$select public.update_org_member(%L, 'responsible', true, true)$$, mem_b), 'não se promove');
  perform tests.must_fail(format($$update public.organization_members set role = 'responsible' where id = %L$$, mem_b), 'alteração direta bloqueada');

  perform tests.act_as(C, 'authenticated');
  perform tests.must_fail(format($$select public.update_org_member(%L, 'staff', true, true)$$, mem_c), 'responsável não altera a si mesmo');
  perform tests.must_fail(format($$select public.leave_organization(%L)$$, org), 'único responsável não sai');
  perform public.update_org_member(mem_b, 'staff', false, true);
  perform tests.act_as(B, 'authenticated');
  perform tests.must_fail(format($$select public.search_motorcycle_by_plate(%L, 'ABC1234')$$, org), 'sem permissão não pesquisa');
  perform tests.act_as(C, 'authenticated');
  perform public.remove_org_member(mem_b);
  perform tests.ok((select count(*) = 1 from public.get_org_members(org)), 'responsável remove funcionário');

  perform tests.act_as(null, null);
  perform tests.ok((select count(*) = 0 from public.organization_invites where token_hash = tok), 'token não guardado em texto');
  perform tests.ok((select count(*) >= 2 from public.audit_logs where entity_type = 'organization_invites' and organization_id = org), 'convites auditados');

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', current_setting('tests.n');
end
$test$;
