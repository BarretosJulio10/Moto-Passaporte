-- =============================================================================
-- Limite de consultas anônimas (ADR-035; KI-003) — SUPABASE REAL, transação desfeita.
-- Simula o cabeçalho de IP que o PostgREST repassa (request.headers).
-- =============================================================================

do $test$
declare
  A uuid := '11111111-1111-1111-1111-111111111111';
  n int := 0; r jsonb; moto uuid; pub text;
  tok text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (A, 'ana@teste.invalid', '{"full_name":"Ana"}', 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', A::text, true);
  set local role authenticated;
  r := public.register_motorcycle('Honda', 'CG 160', 2020, 'TST6L66', 1000);
  moto := (r ->> 'motorcycle_id')::uuid;
  reset role;
  select public_id into pub from public.motorcycles where id = moto;
  insert into public.passport_shares (motorcycle_id, token, created_by) values (moto, tok, A);
  update public.system_settings set value = '2' where key in ('public_passport_views_per_hour', 'shared_passport_views_per_hour');

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.77, 10.0.0.1"}', true);
  set local role anon;
  if public.get_public_passport(pub) ->> 'public_id' <> pub then raise exception 'FALHOU: consulta 1'; end if; n := n + 1;
  perform public.get_public_passport(pub);
  begin perform public.get_public_passport(pub); raise exception 'FALHOU: sem limite';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if; n := n + 1; end;
  begin perform 1 from public.anon_rate_limits; raise exception 'FALHOU: contagens abertas'; exception when insufficient_privilege then n := n + 1; end;
  if public.get_shared_passport(tok) is null then raise exception 'FALHOU: compartilhado com limite próprio'; end if; n := n + 1;
  reset role;

  perform set_config('request.headers', '{"x-forwarded-for": "198.51.100.77"}', true);
  set local role anon;
  if public.get_public_passport(pub) is null then raise exception 'FALHOU: outra conexão'; end if; n := n + 1;
  reset role;
  if exists (select 1 from public.anon_rate_limits where key_hash like '%203.0.113%') then raise exception 'FALHOU: IP guardado'; end if; n := n + 1;

  raise exception 'RESULTADO: % testes passaram. Transação desfeita — nenhum dado de teste foi mantido.', n;
end
$test$;
