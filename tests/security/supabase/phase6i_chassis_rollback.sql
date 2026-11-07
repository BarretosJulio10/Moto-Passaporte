-- =============================================================================
-- Chassi cifrado (ADR-032) — SUPABASE REAL, transação desfeita.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  C uuid := '33333333-3333-3333-3333-333333333333';
  D uuid := '44444444-4444-4444-4444-444444444444';
  n int := 0; moto uuid; tr uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated'),
    (C, 'carla@teste.invalid', '{"full_name":"Carla"}', 'authenticated', 'authenticated'),
    (D, 'admin@teste.invalid', '{"full_name":"Admin"}', 'authenticated', 'authenticated');
  insert into public.user_roles (user_id, role) values (D, 'admin');

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  moto := (public.register_motorcycle('Honda', 'CG 160', 2020, 'TST9C99', 1000, p_chassis => '9c2kc1670lr000123') ->> 'motorcycle_id')::uuid;
  if public.get_my_chassis(moto) <> '9C2KC1670LR000123' then raise exception 'FALHOU: titular lê o chassi'; end if; n := n + 1;
  begin perform 1 from public.motorcycle_private; raise exception 'FALHOU: tabela aberta'; exception when insufficient_privilege then n := n + 1; end;
  begin update public.motorcycle_private set chassis = 'XXXXX' where motorcycle_id = moto; raise exception 'FALHOU: escrita direta';
  exception when insufficient_privilege then n := n + 1; end;
  tr := public.create_transfer_request(moto, 'carla@teste.invalid', null);
  reset role;
  if exists (select 1 from public.motorcycle_private where chassis is not null) then raise exception 'FALHOU: texto aberto'; end if; n := n + 1;
  if (select position(convert_to('9C2KC1670LR000123', 'UTF8') in chassis_enc) from public.motorcycle_private where motorcycle_id = moto) <> 0 then
    raise exception 'FALHOU: chassi legível nos bytes'; end if; n := n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.jwt.claim.sub', D::text, true);
  set local role authenticated;
  begin perform public.get_my_chassis(moto); raise exception 'FALHOU: admin lê chassi'; exception when insufficient_privilege then n := n + 1; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', C, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', C::text, true);
  set local role authenticated;
  begin perform public.get_my_chassis(moto); raise exception 'FALHOU: comprador antes do aceite'; exception when insufficient_privilege then n := n + 1; end;
  perform public.accept_transfer_request(tr, null);
  if public.get_my_chassis(moto) <> '9C2KC1670LR000123' then raise exception 'FALHOU: novo titular lê'; end if; n := n + 1;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  begin perform public.get_my_chassis(moto); raise exception 'FALHOU: antigo titular lê'; exception when insufficient_privilege then n := n + 1; end;
  reset role;

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
