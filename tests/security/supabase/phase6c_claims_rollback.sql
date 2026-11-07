-- =============================================================================
-- Verificação de placa (Fase 6.2) — SUPABASE REAL, transação desfeita.
-- A: titular atual; C: solicitante; B: outro usuário; D: administrador.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  C uuid := '33333333-3333-3333-3333-333333333333';
  D uuid := '44444444-4444-4444-4444-444444444444';
  n int := 0; r jsonb; moto uuid; claim uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated'),
    (B, 'bruno@teste.invalid', '{"full_name":"Bruno"}', 'authenticated', 'authenticated'),
    (C, 'carla@teste.invalid', '{"full_name":"Carla"}', 'authenticated', 'authenticated'),
    (D, 'admin@teste.invalid', '{"full_name":"Admin"}', 'authenticated', 'authenticated');
  insert into public.user_roles (user_id, role) values (D, 'admin');

  -- A cadastra a moto
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  r := public.register_motorcycle('Honda', 'CG 160', 2020, 'TST9Z99', 1000);
  moto := (r ->> 'motorcycle_id')::uuid;
  reset role;
  if moto is null then raise exception 'FALHOU: cadastro inicial %', r; end if;

  -- C tenta a mesma placa: vira pedido
  perform set_config('request.jwt.claims', json_build_object('sub', C, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', C::text, true);
  set local role authenticated;
  r := public.register_motorcycle('Honda', 'CG 160', 2020, 'TST9Z99', 1000);
  claim := (r ->> 'claim_id')::uuid;
  if claim is null or not exists (select 1 from public.get_my_claims() where id = claim and status = 'pending') then raise exception 'FALHOU: pedido criado %', r; end if; n := n + 1;
  if exists (select 1 from public.get_my_claims() x where id = claim and row_to_json(x)::text like '%' || moto::text || '%') then raise exception 'FALHOU: solicitante vê a moto'; end if; n := n + 1;
  perform public.update_my_claim_note(claim, 'Comprei a moto em outubro; tenho o recibo.');
  begin perform public.admin_list_claims(); raise exception 'FALHOU: solicitante vê a fila';
  exception when insufficient_privilege then n := n + 1; end;
  reset role;

  -- B não mexe
  perform set_config('request.jwt.claims', json_build_object('sub', B, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', B::text, true);
  set local role authenticated;
  begin perform public.cancel_my_claim(claim); raise exception 'FALHOU: outro cancela';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;
  reset role;

  -- Admin decide
  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.jwt.claim.sub', D::text, true);
  set local role authenticated;
  if not exists (select 1 from public.admin_list_claims() where id = claim and motorcycle_id = moto and current_owner_id = A) then raise exception 'FALHOU: fila do admin'; end if; n := n + 1;
  begin perform public.admin_resolve_claim(claim, 'approved', 'Pedido procedente, aguarde.', true, 'curto'); raise exception 'FALHOU: sem motivo';
  exception when invalid_parameter_value then n := n + 1; end;
  perform public.admin_resolve_claim(claim, 'approved', 'Pedido procedente. Avisamos o titular atual.', true, 'Recibo de compra e venda conferido');
  reset role;
  if not exists (select 1 from public.audit_logs where action = 'admin_resolve_claim' and entity_id = claim::text) then raise exception 'FALHOU: auditoria'; end if; n := n + 1;

  -- C vê a resposta; A recebe aviso anônimo
  perform set_config('request.jwt.claims', json_build_object('sub', C, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', C::text, true);
  set local role authenticated;
  if not exists (select 1 from public.get_my_claims() where id = claim and status = 'approved') then raise exception 'FALHOU: solicitante vê decisão'; end if; n := n + 1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  if not exists (select 1 from public.get_my_ownership_notices() x where claim_id = claim and motorcycle_id = moto
                 and row_to_json(x)::text not like '%carla%') then raise exception 'FALHOU: aviso ao titular'; end if; n := n + 1;
  perform public.dismiss_ownership_notice(claim);
  if exists (select 1 from public.get_my_ownership_notices() where claim_id = claim) then raise exception 'FALHOU: dispensar aviso'; end if; n := n + 1;
  reset role;

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
