-- =============================================================================
-- Faturas (Fase 5.3) — SUPABASE REAL, transação desfeita.
-- Observação: a sequência de numeração não volta atrás (números pulados são esperados).
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  n int := 0; sub uuid; paid uuid; open_i uuid; r jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated'),
    (B, 'bruno@teste.invalid', '{"full_name":"Bruno"}', 'authenticated', 'authenticated');
  insert into public.subscriptions (user_id, plan_id, plan_code, plan_name, billing_period, price_cents, max_motorcycles, storage_quota_mb,
                                    status, environment, provider_subscription_id)
  select B, id, code, name, billing_period, price_cents, max_motorcycles, storage_quota_mb, 'pending', 'test', 'pre_rb_B'
    from public.subscription_plans where code = 'premium_mensal' returning id into sub;

  set local role service_role;
  perform public.billing_apply_payment('ap:1', 'pre_rb_B', null, 'approved', 990, now());
  perform public.billing_apply_payment('ap:1', 'pre_rb_B', null, 'approved', 990, now());
  reset role;
  if (select count(*) from public.invoices where subscription_id = sub) <> 2 then raise exception 'FALHOU: faturas do ciclo'; end if; n := n + 1;
  if not exists (select 1 from public.invoices where subscription_id = sub and status = 'paid' and number ~ '^MP-\d{4}-\d{6}$') then raise exception 'FALHOU: número'; end if; n := n + 1;
  set local role service_role;
  perform public.billing_apply_payment('ap:2', 'pre_rb_B', null, 'rejected', 990, null);
  perform public.billing_apply_payment('ap:2', 'pre_rb_B', null, 'rejected', 990, null);
  reset role;
  if (select attempts from public.invoices where subscription_id = sub and status = 'failed') <> 1 then raise exception 'FALHOU: tentativas'; end if; n := n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', B, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', B::text, true);
  set local role authenticated;
  if (select count(*) from public.get_my_invoices()) <> 2 then raise exception 'FALHOU: lista do usuário'; end if; n := n + 1;
  select id into paid from public.get_my_invoices() where status = 'paid';
  select id into open_i from public.get_my_invoices() where status = 'failed';
  r := public.get_invoice_receipt(paid);
  if r ->> 'customer_email' <> 'bruno@teste.invalid' or (r ->> 'amount_cents')::int <> 990 then raise exception 'FALHOU: recibo %', r; end if; n := n + 1;
  begin perform public.get_invoice_receipt(open_i); raise exception 'FALHOU: recibo de fatura não paga';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;
  begin perform 1 from public.invoices; raise exception 'FALHOU: tabela exposta';
  exception when insufficient_privilege then n := n + 1; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  begin perform public.get_invoice_receipt(paid); raise exception 'FALHOU: recibo alheio';
  exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_list_invoices(); raise exception 'FALHOU: admin para usuário comum';
  exception when insufficient_privilege then n := n + 1; end;
  reset role;

  set local role service_role;
  perform public.billing_cancel_local(sub, 'teste');
  reset role;
  if exists (select 1 from public.invoices where subscription_id = sub and status in ('open', 'failed')) then raise exception 'FALHOU: cancelamento'; end if; n := n + 1;
  begin delete from public.invoices where id = paid; raise exception 'FALHOU: apagou fatura';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
