-- =============================================================================
-- Testes de planos (Fase 5.1) — versão para o SUPABASE REAL
-- (transação desfeita no final). "FALHOU: ..." indica falha real.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  D uuid := '44444444-4444-4444-4444-444444444444';
  mensal uuid; free uuid; promo uuid; p jsonb; v_before int; v_quota bigint;
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
    (D, 'admin@teste.invalid', '{"full_name":"Admin Teste"}', 'authenticated', 'authenticated');
  insert into public.user_roles (user_id, role) values (D, 'admin');
  select id into mensal from public.subscription_plans where code = 'premium_mensal';
  select id, storage_quota_mb into free, v_quota from public.subscription_plans where code = 'gratuito';

  -- Público
  perform tests.act_as(null, 'anon');
  p := public.get_public_plans();
  perform tests.ok(jsonb_array_length(p) >= 4 and p -> 0 ->> 'kind' = 'free', 'site lista planos, gratuito primeiro');
  perform tests.ok(p::text !~ '"id"|updated_by|is_active', 'sem campos internos');
  perform tests.must_fail('select * from public.subscription_plans', 'anônimo não lê a tabela');
  perform tests.must_fail('select public.admin_list_plans()', 'anônimo não administra');

  -- Usuário comum
  perform tests.act_as(A, 'authenticated');
  perform tests.must_fail('select * from public.subscription_plans', 'usuário não lê a tabela');
  perform tests.must_fail('select * from public.subscription_plan_versions', 'usuário não lê o histórico');
  perform tests.must_fail('select public.admin_list_plans()', 'usuário não lista planos internos');
  perform tests.must_fail(format('select public.admin_set_plan_active(%L, false)', mensal), 'usuário não desativa plano');
  p := public.get_my_plan();
  perform tests.ok(p ->> 'kind' = 'free' and (p ->> 'motorcycles_used')::int = 0, 'usuário novo no plano gratuito, sem motos');
  perform tests.ok((public.get_storage_usage() ->> 'quota_bytes')::bigint
                   = v_quota * 1048576, 'cota vem do plano');

  -- Administrador
  perform tests.act_as(D, 'authenticated');
  select version into v_before from public.admin_list_plans() where id = mensal;
  perform public.admin_save_plan(mensal, null, null, null, 'Premium mensal', 'Teste', 1290, null, 3, 500,
    array['Mais espaço'], 0, null, true, 20);
  perform tests.ok((select price_cents = 1290 and version = v_before + 1 from public.admin_list_plans() where id = mensal), 'admin altera preço; versão sobe');
  perform tests.ok((select changed_by_name = 'Admin Teste' from public.admin_get_plan_history(mensal) order by version desc limit 1), 'histórico com autor');
  perform tests.must_fail(format($q$select public.admin_set_plan_active(%L, false)$q$, free), 'gratuito não é desativado');
  perform tests.must_fail(format($q$select public.admin_save_plan(%L, null, null, null, 'Premium mensal', null, 0, null, 3, 500, null, 0, null, true, 20)$q$, mensal), 'Premium não fica grátis');
  promo := public.admin_save_plan(null, 'premium_teste_rb', 'premium', 'annual', 'Teste', null, 7990, null, 3, 500, null, 0, null, false, 99);
  perform tests.ok(not public.get_public_plans()::text ~ 'premium_teste_rb', 'plano fora do site não aparece');

  -- Banco
  execute 'reset role';
  perform tests.must_fail(format($q$update public.subscription_plans set code = 'x_mudou' where id = %L$q$, mensal), 'código não muda');
  perform tests.must_fail(format($q$delete from public.subscription_plans where id = %L$q$, promo), 'plano não é excluído');
  perform tests.must_fail('update public.subscription_plan_versions set snapshot = ''{}''', 'histórico imutável');
  perform tests.ok((select count(*) >= 2 from public.audit_logs where entity_type = 'subscription_plans' and actor_user_id = D), 'alterações auditadas');

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', current_setting('tests.n');
end
$test$;
