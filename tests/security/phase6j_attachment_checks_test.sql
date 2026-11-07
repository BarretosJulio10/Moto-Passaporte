-- =============================================================================
-- Conferência de conteúdo dos arquivos no servidor (ADR-033; KI-018) — banco de TESTE
-- A simulação da Edge Function (stub) é desligada: o resultado é gravado como a função faria.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'

\echo '--- Conferência de conteúdo dos arquivos'
set tests.skip_file_check = 'on';
grant usage on schema tests to service_role;
grant execute on all functions in schema tests to service_role;

select o.motorcycle_id as moto_a from public.motorcycle_ownerships o where o.owner_user_id = :'A' and o.ended_at is null limit 1 \gset
select :'moto_a' || '/' || gen_random_uuid() || '.jpg' as p_unchecked, :'moto_a' || '/' || gen_random_uuid() || '.jpg' as p_bad,
       :'moto_a' || '/' || gen_random_uuid() || '.pdf' as p_mime, :'moto_a' || '/' || gen_random_uuid() || '.jpg' as p_old,
       :'moto_a' || '/' || gen_random_uuid() || '.jpg' as p_ok \gset

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
insert into storage.objects (bucket_id, name, metadata) values
  ('attachments', :'p_unchecked', '{"size": 1000, "mimetype": "image/jpeg"}'),
  ('attachments', :'p_bad',       '{"size": 1000, "mimetype": "image/jpeg"}'),
  ('attachments', :'p_mime',      '{"size": 1000, "mimetype": "application/pdf"}'),
  ('attachments', :'p_old',       '{"size": 1000, "mimetype": "image/jpeg"}'),
  ('attachments', :'p_ok',        '{"size": 1000, "mimetype": "image/jpeg"}');
select tests.must_fail($$select * from public.attachment_checks$$, 'resultados da conferência fechados para o navegador');
select tests.must_fail(format($$select public.record_attachment_check(%L, auth.uid(), 'image/jpeg', true)$$, :'p_unchecked'), 'usuário não se autoaprova');
select tests.must_fail(format($$select public.attachment_object_info(%L)$$, :'p_unchecked'), 'usuário não consulta dados internos do objeto');
reset role;

-- Edge Function grava os resultados (service_role)
set role service_role;
select tests.ok((public.attachment_object_info(:'p_ok') ->> 'owner') = :'A' and (public.attachment_object_info(:'p_ok') ->> 'mime') = 'image/jpeg'
                and not (public.attachment_object_info(:'p_ok') ->> 'registered')::boolean, 'função vê dono, tipo e se já está registrado');
select public.record_attachment_check(:'p_bad', :'A', 'image/jpeg', false);
select public.record_attachment_check(:'p_mime', :'A', 'image/jpeg', true);
select public.record_attachment_check(:'p_old', :'A', 'image/jpeg', true);
select public.record_attachment_check(:'p_ok', :'A', 'image/jpeg', true);
reset role;
update public.attachment_checks set checked_at = now() - interval '3 hours' where storage_path = :'p_old';

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.register_attachment(%L, %L, 'x.jpg', 'photo')$$, :'moto_a', :'p_unchecked'), 'arquivo não conferido não é registrado');
select tests.must_fail(format($$select public.register_attachment(%L, %L, 'x.jpg', 'photo')$$, :'moto_a', :'p_bad'), 'conteúdo que não bate não é registrado');
select tests.must_fail(format($$select public.register_attachment(%L, %L, 'x.pdf', 'document')$$, :'moto_a', :'p_mime'), 'conferido com outro tipo não é registrado');
select tests.must_fail(format($$select public.register_attachment(%L, %L, 'x.jpg', 'photo')$$, :'moto_a', :'p_old'), 'conferência vencida (mais de 2 h) não vale');
select public.register_attachment(:'moto_a', :'p_ok', 'foto.jpg', 'photo') as att \gset
select tests.ok(:'att' is not null, 'arquivo conferido é registrado');
reset role;
reset tests.skip_file_check;
\echo '=== TODOS OS TESTES DA CONFERÊNCIA DE CONTEÚDO PASSARAM ==='
