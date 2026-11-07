-- =============================================================================
-- Assinaturas e pagamentos (Fase 5.2, parte 2) — SUPABASE REAL, transação desfeita.
-- Simula as respostas do Mercado Pago chamando as funções do servidor.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  D uuid := '44444444-4444-4444-4444-444444444444';
  n int := 0; prep jsonb; sub uuid; r jsonb; v_plan public.subscription_plans;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated'),
    (B, 'bruno@teste.invalid', '{"full_name":"Bruno"}', 'authenticated', 'authenticated'),
    (D, 'admin@teste.invalid', '{"full_name":"Admin Teste"}', 'authenticated', 'authenticated');
  insert into public.user_roles (user_id, role) values (D, 'admin');

  -- Usuário comum não acessa nada do servidor
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  begin perform 1 from public.subscriptions; raise exception 'FALHOU: lê assinaturas'; exception when insufficient_privilege then n := n + 1; end;
  begin perform 1 from public.payments; raise exception 'FALHOU: lê pagamentos'; exception when insufficient_privilege then n := n + 1; end;
  begin perform public.billing_apply_payment('x', 'y', null, 'approved', 990, now()); raise exception 'FALHOU: aprova pagamento'; exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_set_billing_enabled(true); raise exception 'FALHOU: libera contratação'; exception when insufficient_privilege then n := n + 1; end;
  if public.get_my_subscription() is not null then raise exception 'FALHOU: assinatura inesperada'; end if; n := n + 1;
  reset role;

  -- Conta de pagamento configurada (simulada) e contratação liberada pelo admin
  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.jwt.claim.sub', D::text, true);
  set local role authenticated;
  begin perform public.admin_set_billing_enabled(true); raise exception 'FALHOU: liberou sem conta configurada'; exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;
  perform public.admin_save_payment_settings('test', null, 'TEST-1234567890123456-110700-abcdefabcdefabcdefabcdefabcdef12-123456789', 'segredoWebhook_0123456789abcdef');
  reset role;
  set local role service_role;
  perform public.record_payment_check(true, 'ok', '1', 'LOJA');
  reset role;
  set local role authenticated;
  perform public.admin_set_billing_enabled(true);
  reset role;
  n := n + 1;

  -- Contratação
  set local role service_role;
  prep := public.billing_prepare_subscription(A, 'premium_mensal');
  sub := (prep ->> 'subscription_id')::uuid;
  perform public.billing_attach_checkout(sub, 'pre_rb_A', 'https://www.mercadopago.com.br/x');
  perform public.billing_apply_subscription_state('pre_rb_A', sub::text, 'authorized');
  reset role;
  if (public.user_plan(A)).kind <> 'free' then raise exception 'FALHOU: Premium antes do pagamento'; end if; n := n + 1;

  set local role service_role;
  perform public.billing_apply_payment('ap:1', 'pre_rb_A', null, 'approved', 990, now());
  perform public.billing_apply_payment('ap:1', 'pre_rb_A', null, 'approved', 990, now());
  reset role;
  if not exists (select 1 from public.subscriptions where id = sub and status = 'active'
                 and current_period_end between now() + interval '27 days' and now() + interval '32 days') then
    raise exception 'FALHOU: período concedido'; end if; n := n + 1;
  v_plan := public.user_plan(A);
  if v_plan.kind <> 'premium' or v_plan.price_cents <> (prep ->> 'price_cents')::int then raise exception 'FALHOU: plano vigente'; end if; n := n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  if public.get_my_subscription() ->> 'status' <> 'active' then raise exception 'FALHOU: status visível'; end if; n := n + 1;
  if (select count(*) from public.get_my_payments()) <> 1 then raise exception 'FALHOU: histórico'; end if; n := n + 1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', B, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', B::text, true);
  set local role authenticated;
  if (select count(*) from public.get_my_payments()) <> 0 then raise exception 'FALHOU: vê pagamento alheio'; end if; n := n + 1;
  reset role;

  -- Atraso com tolerância e reembolso
  update public.subscriptions set current_period_end = now() - interval '1 day' where id = sub;
  set local role service_role;
  perform public.billing_apply_payment('ap:2', 'pre_rb_A', null, 'rejected', 990, null);
  reset role;
  if (select status from public.subscriptions where id = sub) <> 'past_due' or (public.user_plan(A)).kind <> 'premium' then
    raise exception 'FALHOU: tolerância'; end if; n := n + 1;
  set local role service_role;
  perform public.billing_apply_payment('ap:3', 'pre_rb_A', null, 'approved', 990, now());
  perform public.billing_apply_payment('ap:3', 'pre_rb_A', null, 'refunded', 990, null);
  reset role;
  if (public.user_plan(A)).kind <> 'free' then raise exception 'FALHOU: reembolso não encerrou'; end if; n := n + 1;

  -- Avisos
  set local role service_role;
  r := to_jsonb(public.billing_log_event('payment', 'payment.updated', '1', 'rb-req-1', true));
  perform public.billing_finish_event((r #>> '{}')::bigint, 'processed', 'ok');
  if public.billing_log_event('payment', 'payment.updated', '1', 'rb-req-1', true) is not null then raise exception 'FALHOU: aviso repetido'; end if; n := n + 1;
  reset role;
  begin delete from public.payments where provider_payment_id = 'ap:1'; raise exception 'FALHOU: apagou pagamento'; exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
