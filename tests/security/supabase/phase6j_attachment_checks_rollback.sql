-- =============================================================================
-- Conferência de conteúdo dos arquivos (ADR-033; KI-018) — SUPABASE REAL, transação desfeita.
-- Objetos fictícios só nos metadados (nada vai ao Storage); os resultados são gravados como a
-- Edge Function attachment-check faria (service_role).
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  n int := 0; r jsonb; moto uuid; att uuid;
  p_none text; p_bad text; p_mime text; p_old text; p_ok text;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  r := public.register_motorcycle('Honda', 'CG 160', 2020, 'TST7Q77', 1000);
  moto := (r ->> 'motorcycle_id')::uuid;
  reset role;
  p_none := moto || '/' || gen_random_uuid() || '.jpg';
  p_bad  := moto || '/' || gen_random_uuid() || '.jpg';
  p_mime := moto || '/' || gen_random_uuid() || '.pdf';
  p_old  := moto || '/' || gen_random_uuid() || '.jpg';
  p_ok   := moto || '/' || gen_random_uuid() || '.jpg';
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  select 'attachments', p, A, A::text, jsonb_build_object('size', 1000, 'mimetype', m)
    from (values (p_none, 'image/jpeg'), (p_bad, 'image/jpeg'), (p_mime, 'application/pdf'), (p_old, 'image/jpeg'), (p_ok, 'image/jpeg')) v(p, m);

  set local role authenticated;
  begin perform 1 from public.attachment_checks; raise exception 'FALHOU: tabela aberta'; exception when insufficient_privilege then n := n + 1; end;
  begin perform public.record_attachment_check(p_none, A, 'image/jpeg', true); raise exception 'FALHOU: autoaprovação';
  exception when insufficient_privilege then n := n + 1; end;
  reset role;

  set local role service_role;
  if (public.attachment_object_info(p_ok) ->> 'owner') <> A::text then raise exception 'FALHOU: dono do objeto'; end if; n := n + 1;
  perform public.record_attachment_check(p_bad, A, 'image/jpeg', false);
  perform public.record_attachment_check(p_mime, A, 'image/jpeg', true);
  perform public.record_attachment_check(p_old, A, 'image/jpeg', true);
  perform public.record_attachment_check(p_ok, A, 'image/jpeg', true);
  reset role;
  update public.attachment_checks set checked_at = now() - interval '3 hours' where storage_path = p_old;

  set local role authenticated;
  begin perform public.register_attachment(moto, p_none, 'x.jpg', 'photo'); raise exception 'FALHOU: sem conferência';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;
  begin perform public.register_attachment(moto, p_bad, 'x.jpg', 'photo'); raise exception 'FALHOU: conteúdo errado';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;
  begin perform public.register_attachment(moto, p_mime, 'x.pdf', 'document'); raise exception 'FALHOU: tipo trocado';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;
  begin perform public.register_attachment(moto, p_old, 'x.jpg', 'photo'); raise exception 'FALHOU: conferência vencida';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;
  att := public.register_attachment(moto, p_ok, 'foto.jpg', 'photo');
  if att is null then raise exception 'FALHOU: conferido não registrou'; end if; n := n + 1;
  reset role;

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
