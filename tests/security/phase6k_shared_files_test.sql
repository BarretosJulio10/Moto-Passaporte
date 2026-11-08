-- =============================================================================
-- Comprovantes pelo link de compartilhamento (ADR-034; KI-022) — banco de TESTE; após phase6j
-- A: titular. Links criados direto na tabela (o limite de links do plano é testado na Fase 3).
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'

\echo '--- Comprovantes pelo link de compartilhamento'
grant usage on schema tests to service_role;
grant execute on all functions in schema tests to service_role;

select o.motorcycle_id as moto from public.motorcycle_ownerships o where o.owner_user_id = :'A' and o.ended_at is null limit 1 \gset
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.create_maintenance_record(:'moto', 'revision', 'Revisão com nota fiscal', current_date) ->> 'id' as rec \gset
reset role;
select :'moto' || '/' || gen_random_uuid() || '.pdf' as p_inv, :'moto' || '/' || gen_random_uuid() || '.jpg' as p_photo \gset
insert into storage.objects (bucket_id, name, metadata) values
  ('attachments', :'p_inv', '{"size": 2000, "mimetype": "application/pdf"}'),
  ('attachments', :'p_photo', '{"size": 2000, "mimetype": "image/jpeg"}');
set role authenticated;
select public.register_attachment(:'moto', :'p_inv', 'nota.pdf', 'invoice', :'rec') as att_inv \gset
select public.register_attachment(:'moto', :'p_photo', 'foto.jpg', 'photo') as att_loose \gset
reset role;

select encode(extensions.gen_random_bytes(24), 'hex') as t_on, encode(extensions.gen_random_bytes(24), 'hex') as t_off,
       encode(extensions.gen_random_bytes(24), 'hex') as t_revoked \gset
insert into public.passport_shares (motorcycle_id, token, show_history, show_attachments, created_by) values
  (:'moto', :'t_on', true, true, :'A'), (:'moto', :'t_off', true, false, :'A'), (:'moto', :'t_revoked', true, true, :'A');
update public.passport_shares set revoked_at = now() where token = :'t_revoked';

-- Visitante: o link informa os comprovantes com id; nada abre direto
set role anon;
select public.get_shared_passport(:'t_on')::text as sp \gset
select tests.ok(exists (select 1 from jsonb_array_elements(:'sp'::jsonb -> 'history') h, jsonb_array_elements(h -> 'attachments') a
                        where a ->> 'id' = :'att_inv' and a ->> 'kind' = 'invoice' and a ? 'mime_type' and not a ? 'storage_path'),
                'link informa id e tipo do comprovante, sem o caminho do arquivo');
select tests.ok((select bool_and(h -> 'attachments' is null or jsonb_typeof(h -> 'attachments') = 'null')
                   from jsonb_array_elements(public.get_shared_passport(:'t_off') -> 'history') h), 'sem "mostrar comprovantes", nenhum comprovante');
select tests.must_fail(format($$select public.shared_attachment_for_download(%L, %L)$$, :'t_on', :'att_inv'), 'visitante não chama a função interna');
reset role;

-- Edge Function (service_role)
set role service_role;
select tests.ok(public.shared_attachment_for_download(:'t_on', :'att_inv') ->> 'path' = :'p_inv', 'link vigente abre o comprovante do serviço');
select tests.ok(public.shared_attachment_for_download(:'t_off', :'att_inv') is null, 'link sem "mostrar comprovantes" não abre');
select tests.ok(public.shared_attachment_for_download(:'t_revoked', :'att_inv') is null, 'link revogado não abre');
select tests.ok(public.shared_attachment_for_download(repeat('a', 48), :'att_inv') is null, 'código inexistente não abre');
select tests.ok(public.shared_attachment_for_download(:'t_on', :'att_loose') is null, 'arquivo fora de serviço não sai pelo link');
select tests.ok(public.shared_attachment_for_download(:'t_on', (select id from public.attachments where motorcycle_id <> :'moto' limit 1)) is null,
                'arquivo de outra moto não sai pelo link');
reset role;

-- Limite por hora e registro das aberturas
reset role;
update public.system_settings set value = '2' where key = 'share_file_views_per_hour';
select tests.ok((select count(*) = 1 from public.passport_share_file_views v join public.passport_shares s on s.id = v.share_id where s.token = :'t_on'),
                'abertura registrada');
insert into public.passport_share_file_views (share_id, attachment_id)
  select id, :'att_inv' from public.passport_shares where token = :'t_on';
set role service_role;
select tests.must_fail(format($$select public.shared_attachment_for_download(%L, %L)$$, :'t_on', :'att_inv'), 'limite de aberturas por hora');
reset role;
update public.system_settings set value = '60' where key = 'share_file_views_per_hour';

select tests.ok((select count(*) = 1 from (select 1 where exists (select 1 from pg_class where relname = 'passport_share_file_views' and relrowsecurity)) x), 'registro das aberturas com RLS');
set role authenticated;
select tests.must_fail($$select * from public.passport_share_file_views$$, 'registro das aberturas fechado para o navegador');
reset role;
-- Registro anulado deixa de abrir
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.void_maintenance_record(:'rec', 'Registro duplicado por engano');
reset role;
set role service_role;
select tests.ok(public.shared_attachment_for_download(:'t_on', :'att_inv') is null, 'comprovante de registro anulado não abre');
reset role;

\echo '=== TODOS OS TESTES DOS COMPROVANTES PELO LINK PASSARAM ==='
