-- =============================================================================
-- Comprovantes pelo link de compartilhamento (ADR-034; KI-022) — SUPABASE REAL, transação desfeita.
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  n int := 0; r jsonb; moto uuid; rec uuid; att_inv uuid; att_loose uuid; sp jsonb;
  p_inv text; p_photo text;
  t_on text := encode(extensions.gen_random_bytes(24), 'hex');
  t_off text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  r := public.register_motorcycle('Honda', 'CG 160', 2020, 'TST6K66', 1000);
  moto := (r ->> 'motorcycle_id')::uuid;
  rec := (public.create_maintenance_record(moto, 'revision', 'Revisão com nota fiscal', current_date) ->> 'id')::uuid;
  reset role;
  p_inv := moto || '/' || gen_random_uuid() || '.pdf';
  p_photo := moto || '/' || gen_random_uuid() || '.jpg';
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values
    ('attachments', p_inv, A, A::text, '{"size": 2000, "mimetype": "application/pdf"}'),
    ('attachments', p_photo, A, A::text, '{"size": 2000, "mimetype": "image/jpeg"}');
  set local role service_role;
  perform public.record_attachment_check(p_inv, A, 'application/pdf', true);
  perform public.record_attachment_check(p_photo, A, 'image/jpeg', true);
  reset role;
  set local role authenticated;
  att_inv := public.register_attachment(moto, p_inv, 'nota.pdf', 'invoice', rec);
  att_loose := public.register_attachment(moto, p_photo, 'foto.jpg', 'photo');
  reset role;
  insert into public.passport_shares (motorcycle_id, token, show_history, show_attachments, created_by) values
    (moto, t_on, true, true, A), (moto, t_off, true, false, A);

  set local role anon;
  sp := public.get_shared_passport(t_on);
  if not exists (select 1 from jsonb_array_elements(sp -> 'history') h, jsonb_array_elements(h -> 'attachments') x
                  where x ->> 'id' = att_inv::text and not x ? 'storage_path') then raise exception 'FALHOU: link com id %', sp; end if; n := n + 1;
  begin perform public.shared_attachment_for_download(t_on, att_inv); raise exception 'FALHOU: visitante chama função interna';
  exception when insufficient_privilege then n := n + 1; end;
  reset role;

  set local role service_role;
  if public.shared_attachment_for_download(t_on, att_inv) ->> 'path' <> p_inv then raise exception 'FALHOU: abre comprovante'; end if; n := n + 1;
  if public.shared_attachment_for_download(t_off, att_inv) is not null then raise exception 'FALHOU: sem opção'; end if; n := n + 1;
  if public.shared_attachment_for_download(t_on, att_loose) is not null then raise exception 'FALHOU: arquivo sem serviço'; end if; n := n + 1;
  reset role;
  update public.passport_shares set revoked_at = now() where token = t_on;
  set local role service_role;
  if public.shared_attachment_for_download(t_on, att_inv) is not null then raise exception 'FALHOU: link revogado'; end if; n := n + 1;
  reset role;
  if (select count(*) from public.passport_share_file_views v join public.passport_shares s on s.id = v.share_id where s.token = t_on) <> 1 then
    raise exception 'FALHOU: registro da abertura'; end if; n := n + 1;

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
