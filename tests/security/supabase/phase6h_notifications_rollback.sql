-- =============================================================================
-- Central de notificações (ADR-031) — SUPABASE REAL, transação desfeita.
-- Fluxo real: A cadastra moto e transfere para C; C recebe, aceita; A recebe o aceite.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  C uuid := '33333333-3333-3333-3333-333333333333';
  D uuid := '44444444-4444-4444-4444-444444444444';
  n int := 0; moto uuid; tr uuid; marked int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana Teste"}', 'authenticated', 'authenticated'),
    (C, 'carla@teste.invalid', '{"full_name":"Carla"}', 'authenticated', 'authenticated'),
    (D, 'admin@teste.invalid', '{"full_name":"Admin"}', 'authenticated', 'authenticated');
  insert into public.user_roles (user_id, role) values (D, 'admin');

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  moto := (public.register_motorcycle('Honda', 'CG 160', 2020, 'TST9N99', 1000) ->> 'motorcycle_id')::uuid;
  tr := public.create_transfer_request(moto, 'carla@teste.invalid', 'Moto revisada');
  begin perform 1 from public.notifications; raise exception 'FALHOU: tabela aberta'; exception when insufficient_privilege then n := n + 1; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', C, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', C::text, true);
  set local role authenticated;
  if not exists (select 1 from public.get_my_notifications() where kind = 'transfer_received' and body like 'Ana Teste quer transferir a Honda CG 160%') then
    raise exception 'FALHOU: comprador não recebeu o aviso'; end if; n := n + 1;
  if public.count_my_unread_notifications() < 1 then raise exception 'FALHOU: contador'; end if; n := n + 1;
  perform public.accept_transfer_request(tr, null);
  marked := public.mark_my_notifications_read();
  if marked < 1 or public.count_my_unread_notifications() <> 0 then raise exception 'FALHOU: marcar lidas (%)', marked; end if; n := n + 1;
  begin perform public.set_my_notification_preference('payment_failed', false, false); raise exception 'FALHOU: essencial desligado';
  exception when invalid_parameter_value then n := n + 1; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  if not exists (select 1 from public.get_my_notifications() where kind = 'transfer_decided' and title = 'Transferência aceita') then
    raise exception 'FALHOU: titular não soube do aceite'; end if; n := n + 1;
  if exists (select 1 from public.get_my_notifications() where kind = 'transfer_received') then raise exception 'FALHOU: aviso alheio visível'; end if; n := n + 1;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.jwt.claim.sub', D::text, true);
  set local role authenticated;
  perform public.admin_send_notice(C, 'Bem-vinda', 'Sua moto chegou com o histórico completo.', 'Teste de aviso administrativo');
  reset role;
  if not exists (select 1 from public.notifications where user_id = C and kind = 'admin_notice') then raise exception 'FALHOU: aviso admin'; end if; n := n + 1;

  set local role service_role;
  perform public.system_generate_notifications();
  reset role;
  n := n + 1;

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
