-- =============================================================================
-- Painel administrativo (Fase 6.1) — SUPABASE REAL, transação desfeita.
-- Confere também o bloqueio de login no Supabase Auth (auth.users.banned_until).
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  D uuid := '44444444-4444-4444-4444-444444444444';
  n int := 0; m jsonb; u jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated'),
    (B, 'bruno@teste.invalid', '{"full_name":"Bruno Teste"}', 'authenticated', 'authenticated'),
    (D, 'admin@teste.invalid', '{"full_name":"Admin Teste"}', 'authenticated', 'authenticated');
  insert into public.user_roles (user_id, role) values (D, 'admin');

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  begin perform public.admin_get_metrics(); raise exception 'FALHOU: usuário vê indicadores'; exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_set_user_status(B, 'blocked', 'tentativa de bloqueio indevido'); raise exception 'FALHOU: usuário bloqueia';
  exception when insufficient_privilege then n := n + 1; end;
  begin update public.profiles set account_status = 'active' where id = A; raise exception 'FALHOU: usuário altera própria situação';
  exception when insufficient_privilege then n := n + 1; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.jwt.claim.sub', D::text, true);
  set local role authenticated;
  m := public.admin_get_metrics();
  if not (m ? 'mrr_cents' and m ? 'claims_pending' and (m ->> 'users_total')::int >= 3) then raise exception 'FALHOU: indicadores %', m; end if; n := n + 1;
  if not exists (select 1 from public.admin_list_users('bruno@teste') where id = B and email_masked = 'br•••@teste.invalid') then raise exception 'FALHOU: busca/máscara'; end if; n := n + 1;
  begin perform public.admin_get_user(B, 'curto'); raise exception 'FALHOU: sem motivo';
  exception when invalid_parameter_value then n := n + 1; end;
  u := public.admin_get_user(B, 'Teste de suporte com motivo');
  if u ->> 'email' <> 'bruno@teste.invalid' then raise exception 'FALHOU: detalhe'; end if; n := n + 1;
  perform public.admin_set_user_status(B, 'suspended', 'Teste de suspensão em transação');
  reset role;
  if (select banned_until from auth.users where id = B) <> 'infinity' then raise exception 'FALHOU: banimento no Auth'; end if; n := n + 1;
  if not exists (select 1 from public.audit_logs where action = 'admin_viewed_user' and entity_id = B::text and actor_user_id = D) then raise exception 'FALHOU: auditoria'; end if; n := n + 1;
  set local role authenticated;
  begin perform public.admin_set_user_status(D, 'suspended', 'Teste de autossuspensão'); raise exception 'FALHOU: autossuspensão';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;
  perform public.admin_set_user_status(B, 'active', 'Reativação do teste em transação');
  reset role;
  if (select banned_until from auth.users where id = B) is not null then raise exception 'FALHOU: reativação'; end if; n := n + 1;

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
