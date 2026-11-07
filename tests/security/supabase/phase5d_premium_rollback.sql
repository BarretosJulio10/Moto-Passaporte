-- =============================================================================
-- Benefícios Premium (Fase 5.4) — SUPABASE REAL, transação desfeita.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  B uuid := '22222222-2222-2222-2222-222222222222';
  n int := 0; moto uuid; r1 uuid; prep jsonb; v jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated'),
    (B, 'bruno@teste.invalid', '{"full_name":"Bruno"}', 'authenticated', 'authenticated');

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  moto := (public.register_motorcycle('Honda', 'CG 160', 2022, 'TST9Z99', 10000) ->> 'motorcycle_id')::uuid;
  if public.get_my_plan() -> 'entitlements' ? 'maintenance_reminders' then raise exception 'FALHOU: gratuito com lembretes'; end if; n := n + 1;
  begin perform public.create_reminder(moto, 'Óleo', 'oil_change', 3000); raise exception 'FALHOU: gratuito criou lembrete';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;
  begin perform public.register_motorcycle_report(moto); raise exception 'FALHOU: gratuito gerou relatório';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;
  perform public.create_passport_share(moto, 'a'); perform public.create_passport_share(moto, 'b'); perform public.create_passport_share(moto, 'c');
  begin perform public.create_passport_share(moto, 'd'); raise exception 'FALHOU: gratuito passou do limite de links';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;
  reset role;

  -- Premium simulado: assinatura ativa com benefícios
  insert into public.subscriptions (user_id, plan_id, plan_code, plan_name, billing_period, price_cents, max_motorcycles, storage_quota_mb,
                                    status, environment, current_period_end, entitlements, max_share_links)
  select A, id, code, name, billing_period, price_cents, max_motorcycles, storage_quota_mb, 'active', 'test', now() + interval '30 days',
         entitlements, max_share_links
    from public.subscription_plans where code = 'premium_mensal';

  set local role authenticated;
  if not (public.get_my_plan() -> 'entitlements' ? 'pdf_reports') then raise exception 'FALHOU: Premium sem relatório'; end if; n := n + 1;
  perform public.create_passport_share(moto, 'd'); n := n + 1;
  r1 := public.create_reminder(moto, 'Troca de óleo', 'oil_change', 3000);
  perform public.create_reminder(moto, 'Licenciamento', 'other', null, null, current_date - 1);
  v := public.get_motorcycle_reminders(moto);
  if jsonb_array_length(v) <> 2 or v -> 0 ->> 'status' <> 'due' then raise exception 'FALHOU: lista de lembretes %', v; end if; n := n + 1;
  if (select (x ->> 'km_left')::int from jsonb_array_elements(v) x where x ->> 'id' = r1::text) <> 3000 then raise exception 'FALHOU: km restante'; end if; n := n + 1;
  perform public.complete_reminder(r1);
  if jsonb_array_length(public.get_my_due_reminders()) <> 1 then raise exception 'FALHOU: painel de vencidos'; end if; n := n + 1;
  if length(public.register_motorcycle_report(moto) ->> 'reference') <> 10 then raise exception 'FALHOU: referência'; end if; n := n + 1;
  begin perform 1 from public.maintenance_reminders; raise exception 'FALHOU: tabela exposta';
  exception when insufficient_privilege then n := n + 1; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', B, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', B::text, true);
  set local role authenticated;
  begin perform public.get_motorcycle_reminders(moto); raise exception 'FALHOU: B viu lembretes de A';
  exception when insufficient_privilege then n := n + 1; end;
  begin perform public.delete_reminder(r1); raise exception 'FALHOU: B excluiu lembrete de A';
  exception when insufficient_privilege then n := n + 1; end;
  reset role;

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
