-- =============================================================================
-- Monitoramento de armazenamento (Fase 6.3) — SUPABASE REAL, transação desfeita.
-- Insere um objeto fictício antigo no bucket (só metadados; nada vai ao Storage).
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  D uuid := '44444444-4444-4444-4444-444444444444';
  n int := 0; ov jsonb; plan jsonb; fin jsonb;
  p_old text := gen_random_uuid() || '/' || gen_random_uuid() || '.pdf';
  p_new text := gen_random_uuid() || '/' || gen_random_uuid() || '.jpg';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated'),
    (D, 'admin@teste.invalid', '{"full_name":"Admin"}', 'authenticated', 'authenticated');
  insert into public.user_roles (user_id, role) values (D, 'admin');
  insert into storage.objects (bucket_id, name, metadata, created_at) values
    ('attachments', p_old, '{"size": 7000}', now() - interval '3 days'),
    ('attachments', p_new, '{"size": 1000}', now());

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  begin perform public.admin_storage_overview(); raise exception 'FALHOU: usuário vê painel'; exception when insufficient_privilege then n := n + 1; end;
  begin perform public.admin_plan_storage_cleanup('Limpeza pedida por usuário comum'); raise exception 'FALHOU: usuário limpa';
  exception when insufficient_privilege then n := n + 1; end;
  begin perform public.storage_cleanup_finish(gen_random_uuid(), array[p_old], 0); raise exception 'FALHOU: usuário conclui';
  exception when insufficient_privilege then n := n + 1; end;
  begin perform 1 from public.storage_cleanups; raise exception 'FALHOU: tabela aberta';
  exception when insufficient_privilege then n := n + 1; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', D, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('request.jwt.claim.sub', D::text, true);
  set local role authenticated;
  ov := public.admin_storage_overview();
  if not ((ov ->> 'orphan_files')::int >= 1 and (ov ->> 'temporary_files')::int >= 1 and ov ? 'by_kind' and ov ? 'users_in_alert') then
    raise exception 'FALHOU: visão geral %', ov; end if; n := n + 1;
  if not exists (select 1 from public.admin_list_unlinked_files() where storage_path = p_old and is_orphan)
     or not exists (select 1 from public.admin_list_unlinked_files() where storage_path = p_new and not is_orphan) then
    raise exception 'FALHOU: classificação temporário × sem vínculo'; end if; n := n + 1;
  perform public.admin_storage_top_users(); perform public.admin_storage_top_motorcycles(); perform public.admin_storage_top_workshops(); n := n + 1;
  plan := public.admin_plan_storage_cleanup('Limpeza de envios que falharam');
  if not (plan -> 'paths' ? p_old) or (plan -> 'paths' ? p_new) then raise exception 'FALHOU: plano %', plan; end if; n := n + 1;
  reset role;

  set local role service_role;
  fin := public.storage_cleanup_finish((plan ->> 'cleanup_id')::uuid, array[p_old, 'fora/do-plano.jpg'], 0);
  reset role;
  if (fin ->> 'deleted_files')::int <> 1 or (fin ->> 'deleted_bytes')::bigint <> 7000 then raise exception 'FALHOU: conclusão %', fin; end if; n := n + 1;
  if (select count(*) from public.audit_logs where entity_type = 'storage_cleanup' and entity_id = plan ->> 'cleanup_id' and actor_user_id = D) <> 2 then
    raise exception 'FALHOU: auditoria'; end if; n := n + 1;

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
