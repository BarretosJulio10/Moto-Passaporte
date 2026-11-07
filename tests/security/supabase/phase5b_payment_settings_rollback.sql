-- =============================================================================
-- Testes das credenciais do Mercado Pago (Fase 5.2, parte 1) — SUPABASE REAL
-- Transação desfeita no final. Confere também que o Vault guarda o token criptografado.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  D uuid := '44444444-4444-4444-4444-444444444444';
  TK text := 'TEST-1234567890123456-110700-abcdefabcdefabcdefabcdefabcdef12-123456789';
  TK2 text := 'APP_USR-9999999999999999-110700-ffffffffffffffffffffffffffffffff-987654321';
  s jsonb; n int := 0;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated'),
    (D, 'admin@teste.invalid', '{"full_name":"Admin Teste"}', 'authenticated', 'authenticated');
  insert into public.user_roles (user_id, role) values (D, 'admin');

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform public.admin_get_payment_settings(); raise exception 'FALHOU: anon vê config'; exception when insufficient_privilege then n := n + 1; end;
  begin perform public.payment_access_token(); raise exception 'FALHOU: anon lê token'; exception when insufficient_privilege then n := n + 1; end;
  begin perform 1 from public.payment_gateway_settings; raise exception 'FALHOU: anon lê tabela'; exception when insufficient_privilege then n := n + 1; end;
  if (public.get_payment_public_config() -> 'public_key') <> 'null'::jsonb then raise exception 'FALHOU: chave pública exposta'; end if; n := n + 1;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  begin perform public.admin_save_payment_settings('test', null, TK, null); raise exception 'FALHOU: usuário grava token'; exception when insufficient_privilege then n := n + 1; end;
  begin perform public.payment_access_token(); raise exception 'FALHOU: usuário lê token'; exception when insufficient_privilege then n := n + 1; end;
  begin perform 1 from vault.decrypted_secrets; raise exception 'FALHOU: usuário lê cofre'; exception when insufficient_privilege then n := n + 1; end;
  begin perform public.record_payment_check(true, 'x', '1', 'x'); raise exception 'FALHOU: usuário marca verificação'; exception when insufficient_privilege then n := n + 1; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', D::text, true);
  set local role authenticated;
  begin perform public.admin_save_payment_settings('test', null, 'invalido', null); raise exception 'FALHOU: token inválido aceito'; exception when invalid_parameter_value then n := n + 1; end;
  perform public.admin_save_payment_settings('test', 'TEST-abcdef12-3456-7890-abcd-ef1234567890', TK, 'segredoWebhook_0123456789abcdef');
  s := public.admin_get_payment_settings();
  if not ((s ->> 'access_token_configured')::boolean and s ->> 'access_token_hint' = '6789' and s ->> 'webhook_secret_hint' = 'cdef') then raise exception 'FALHOU: gravação %', s; end if; n := n + 1;
  if s::text ~ 'abcdefabcdef|segredoWebhook' then raise exception 'FALHOU: segredo devolvido'; end if; n := n + 1;
  reset role;

  set local role service_role;
  if public.payment_access_token() <> TK then raise exception 'FALHOU: servidor não lê token'; end if; n := n + 1;
  perform public.record_payment_check(true, 'Conexão confirmada', '123', 'LOJA');
  reset role;
  if (select count(*) from vault.secrets where name = 'mercadopago_access_token') <> 1 then raise exception 'FALHOU: cofre'; end if; n := n + 1;
  if (select decrypted_secret from vault.decrypted_secrets where name = 'mercadopago_access_token') <> TK then raise exception 'FALHOU: cofre conteúdo'; end if; n := n + 1;
  if exists (select 1 from vault.secrets where name = 'mercadopago_access_token' and secret = TK) then raise exception 'FALHOU: token não criptografado'; end if; n := n + 1;
  if exists (select 1 from public.audit_logs where entity_type = 'payment_gateway_settings' and (coalesce(new_data::text,'') || coalesce(previous_data::text,'')) ~ 'abcdefabcdef|segredoWebhook') then raise exception 'FALHOU: segredo na auditoria'; end if; n := n + 1;

  set local role authenticated;
  perform public.admin_save_payment_settings('production', 'APP_USR-abcdef12-3456-7890-abcd-ef1234567890', TK2, null);
  s := public.admin_get_payment_settings();
  if not (s ->> 'access_token_hint' = '4321' and s -> 'account_nickname' = 'null'::jsonb) then raise exception 'FALHOU: troca de conta %', s; end if; n := n + 1;
  reset role;
  set local role service_role;
  if public.payment_access_token() <> TK2 then raise exception 'FALHOU: token novo'; end if; n := n + 1;
  reset role;

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
