-- =============================================================================
-- Auditoria e configurações (Fase 6.1, parte 2) — SUPABASE REAL, transação desfeita.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  D uuid := '44444444-4444-4444-4444-444444444444';
  n int := 0; ev bigint; c0 int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated'),
    (D, 'admin@teste.invalid', '{"full_name":"Admin Teste"}', 'authenticated', 'authenticated');
  insert into public.user_roles (user_id, role) values (D, 'admin');

  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.jwt.claim.sub', D::text, true);
  set local role authenticated;
  begin update public.system_settings set value = 'true' where key = 'billing_enabled'; raise exception 'FALHOU: escrita direta';
  exception when insufficient_privilege then n := n + 1; end;
  if exists (select 1 from public.admin_list_settings() where key = 'billing_enabled') then raise exception 'FALHOU: catálogo'; end if; n := n + 1;
  begin perform public.admin_update_setting('billing_grace_days', '99', 'Valor fora da faixa'); raise exception 'FALHOU: faixa';
  exception when invalid_parameter_value then n := n + 1; end;
  select count(*) into c0 from public.admin_search_audit(p_action => 'admin_update_setting');
  perform public.admin_update_setting('support_whatsapp', '"+55 (21) 98215-3814"', 'Mesmo valor, nada muda');
  if (select count(*) from public.admin_search_audit(p_action => 'admin_update_setting')) <> c0 then raise exception 'FALHOU: valor igual auditado'; end if; n := n + 1;
  perform public.admin_update_setting('support_email', '" Suporte@Teste.invalid "', 'Teste em transação');
  reset role;
  if (select value from public.system_settings where key = 'support_email') <> '"suporte@teste.invalid"' then raise exception 'FALHOU: normalização'; end if; n := n + 1;
  set local role authenticated;
  if not exists (select 1 from public.admin_search_audit(p_action => 'admin_update_setting') where reason = 'Teste em transação') then raise exception 'FALHOU: busca'; end if; n := n + 1;
  select id into ev from public.admin_search_audit(p_action => 'admin_update_setting', p_limit => 1);
  if not (public.admin_get_audit_entry(ev, 'Conferência em transação') ? 'new_data') then raise exception 'FALHOU: conteúdo'; end if; n := n + 1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  begin perform public.admin_search_audit(); raise exception 'FALHOU: usuário consulta';
  exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_update_setting('billing_grace_days', '5', 'Tentativa de usuário comum'); raise exception 'FALHOU: usuário altera';
  exception when insufficient_privilege then n := n + 1; end;
  reset role;
  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
