-- =============================================================================
-- Verificação em duas etapas para administradores (ADR-030) — SUPABASE REAL, transação desfeita.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  D uuid := '44444444-4444-4444-4444-444444444444';
  n int := 0; x jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated'),
    (D, 'admin@teste.invalid', '{"full_name":"Admin"}', 'authenticated', 'authenticated');
  insert into public.user_roles (user_id, role) values (D, 'admin');

  -- Admin só com a senha (aal1)
  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', D::text, true);
  set local role authenticated;
  x := public.my_admin_access();
  if not ((x ->> 'has_admin_role')::boolean and not (x ->> 'allowed')::boolean) then raise exception 'FALHOU: acesso aal1 %', x; end if; n := n + 1;
  if public.is_admin() then raise exception 'FALHOU: is_admin com aal1'; end if; n := n + 1;
  begin perform public.admin_get_metrics(); raise exception 'FALHOU: indicadores com aal1'; exception when insufficient_privilege then n := n + 1; end;
  if exists (select 1 from public.audit_logs) then raise exception 'FALHOU: auditoria visível com aal1'; end if; n := n + 1;
  reset role;

  -- Sem claim aal (token antigo): tratado como aal1
  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.is_admin() then raise exception 'FALHOU: is_admin sem claim aal'; end if; n := n + 1;
  reset role;

  -- Com a segunda etapa (aal2)
  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  if not public.is_admin() or not (public.my_admin_access() ->> 'allowed')::boolean then raise exception 'FALHOU: aal2'; end if; n := n + 1;
  perform public.admin_get_metrics(); n := n + 1;
  reset role;

  -- Usuário comum com aal2
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  if public.is_admin() then raise exception 'FALHOU: usuário comum virou admin'; end if; n := n + 1;
  reset role;

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
