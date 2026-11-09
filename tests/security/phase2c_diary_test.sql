-- =============================================================================
-- Testes da Fase 2 — diário da moto (banco de TESTE; roda depois dos anexos)
-- Inclui simulação de venda (troca de titularidade feita pelo dono do banco,
-- já que o fluxo de transferência é da Fase 4).
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'

\echo '--- Fase 2: diário'
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select id as moto_a from public.motorcycles limit 1 \gset

select public.create_diary_entry(:'moto_a', 'trip', 'Viagem à Serra', current_date - 10, 'Subida linda, 340 km.', 'Serra do Rio do Rastro', 'shareable') as pub \gset
select public.create_diary_entry(:'moto_a', 'customization', 'Escapamento novo', current_date - 5, 'Segredo: custou caro.') as priv \gset
select tests.ok((select count(*) = 2 from public.motorcycle_diary_feed where motorcycle_id = :'moto_a'), 'A vê as duas entradas');
select tests.ok((select visibility = 'private' from public.motorcycle_diary where id = :'priv'), 'padrão é privado');
select tests.ok((select bool_and(is_mine) from public.motorcycle_diary_feed), 'entradas de A aparecem como dele');
select tests.must_fail($$select author_id from public.motorcycle_diary$$, 'autor não é exposto');
select tests.must_fail(format($$select public.create_diary_entry(%L, 'trip', 'Futuro', current_date + 5)$$, :'moto_a'), 'data futura recusada');
select tests.must_fail(format($$select public.create_diary_entry(%L, 'trip', '   ', current_date)$$, :'moto_a'), 'título vazio recusado');
select tests.must_fail(format($$insert into public.motorcycle_diary (motorcycle_id, category, title, entry_date) values (%L, 'trip', 'x', current_date)$$, :'moto_a'), 'inserção direta bloqueada');
select tests.must_fail(format($$update public.motorcycle_diary set title = 'x' where id = %L$$, :'pub'), 'alteração direta bloqueada');

select public.update_diary_entry(:'priv', 'customization', 'Escapamento esportivo', current_date - 5, 'Segredo: custou caro.', null, 'private');
select tests.ok((select title = 'Escapamento esportivo' from public.motorcycle_diary where id = :'priv'), 'A edita a própria entrada');

-- Fotos
select :'moto_a' || '/dddddddd-0000-0000-0000-000000000001.jpg' as ph1 \gset
select :'moto_a' || '/dddddddd-0000-0000-0000-000000000002.jpg' as ph2 \gset
select :'moto_a' || '/dddddddd-0000-0000-0000-000000000003.pdf' as ph3 \gset
insert into storage.objects (bucket_id, name, metadata) values
  ('attachments', :'ph1', '{"size": 200000, "mimetype": "image/jpeg"}'),
  ('attachments', :'ph2', '{"size": 100000, "mimetype": "image/jpeg"}'),
  ('attachments', :'ph3', '{"size": 1000, "mimetype": "application/pdf"}');
select public.register_attachment(:'moto_a', :'ph1', 'serra.jpg', 'invoice', null, :'pub') as att_pub \gset
select public.register_attachment(:'moto_a', :'ph2', 'escape.jpg', 'photo', null, :'priv') as att_priv \gset
select tests.ok((select kind = 'photo' from public.attachments where id = :'att_pub'), 'foto do diário sempre como foto');
select tests.must_fail(format($$select public.register_attachment(%L, %L, 'doc.pdf', 'document', null, %L)$$, :'moto_a', :'ph3', :'pub'), 'PDF recusado no diário');
select tests.ok((select jsonb_array_length(photos) = 1 from public.motorcycle_diary_feed where id = :'pub'), 'foto aparece na entrada');
select tests.ok((select count(*) = 0 from public.maintenance_timeline where jsonb_array_length(attachments) > 0 and attachments::text like '%dddddddd%'), 'foto do diário não vai para a linha do tempo');
select tests.must_fail(format($$delete from public.attachments where id = %L$$, :'att_pub'), 'foto não é apagada diretamente');
select tests.must_fail(format($$update public.attachments set diary_entry_id = null where id = %L$$, :'att_pub'), 'foto não muda de entrada');

-- Arquivo próprio sem registro pode ser apagado; com registro, não.
select tests.ok((select count(*) = 1 from storage.objects where name = :'ph3'), 'A vê o próprio arquivo ainda não registrado');
delete from storage.objects where name = :'ph3';
select tests.ok((select count(*) = 0 from storage.objects where name = :'ph3'), 'A apaga arquivo próprio sem registro');
delete from storage.objects where name = :'ph1';
reset role;
select tests.ok((select count(*) = 1 from storage.objects where name = :'ph1'), 'arquivo registrado não é apagado pela API');
set role authenticated;

-- Isolamento antes da venda
select set_config('request.jwt.claim.sub', :'B', false);
select tests.ok((select count(*) = 0 from public.motorcycle_diary_feed where motorcycle_id = :'moto_a'), 'B não vê diário de A');
select tests.must_fail(format($$select public.update_diary_entry(%L, 'trip', 'x', current_date)$$, :'pub'), 'B não edita diário de A');
select tests.must_fail(format($$select public.delete_diary_entry(%L)$$, :'pub'), 'B não exclui diário de A');
select tests.must_fail(format($$select public.create_diary_entry(%L, 'trip', 'x', current_date)$$, :'moto_a'), 'B não escreve no diário da moto de A');
reset role;

set role anon;
select tests.must_fail($$select * from public.motorcycle_diary_feed$$, 'anônimo não lê diário');
reset role;

-- ===== Venda simulada: A -> B
select set_config('request.jwt.claim.sub', '', false);
update public.motorcycle_ownerships set ended_at = now(), end_reason = 'transfer'
 where motorcycle_id = :'moto_a' and ended_at is null;
insert into public.motorcycle_ownerships (motorcycle_id, owner_user_id) values (:'moto_a', :'B');

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select count(*) = 1 from public.motorcycle_diary_feed where motorcycle_id = :'moto_a'), 'novo dono vê só a entrada compartilhável');
select tests.ok((select id = :'pub' and not is_mine from public.motorcycle_diary_feed where motorcycle_id = :'moto_a'), 'entrada aparece como de dono anterior');
select tests.ok((select count(*) = 1 from public.attachments where diary_entry_id is not null), 'novo dono vê só a foto compartilhável');
select tests.ok((select count(*) = 0 from storage.objects where name = :'ph2'), 'arquivo da foto privada fica invisível ao novo dono');
select tests.ok((select count(*) = 1 from storage.objects where name = :'ph1'), 'arquivo da foto compartilhável visível ao novo dono');
select tests.ok(((public.get_storage_usage() ->> 'used_bytes')::bigint = (select sum(file_size) from public.attachments where diary_entry_id is null)), 'fotos de diário de outro autor fora da cota do novo dono');
select tests.must_fail(format($$select public.update_diary_entry(%L, 'trip', 'x', current_date)$$, :'pub'), 'novo dono não edita entrada do anterior');
select tests.must_fail(format($$select public.delete_diary_photo(%L)$$, :'att_pub'), 'novo dono não apaga foto do anterior');
-- Venda simulada deixa B com 2 motos: cortesia temporária para não cair no limite (ADR-062).
reset role;
insert into public.premium_grants (id, user_id, plan_id, reason, source)
select '0c0c0c0c-0000-4000-8000-000000000001', :'B', id, 'Teste: venda simulada', 'admin' from public.subscription_plans where code = 'premium_mensal';
set role authenticated;
select public.create_diary_entry(:'moto_a', 'first_ride', 'Primeiro passeio', current_date) as b_entry \gset
reset role;
update public.premium_grants set revoked_at = now() where id = '0c0c0c0c-0000-4000-8000-000000000001';
set role authenticated;
select tests.ok((select count(*) = 2 from public.motorcycle_diary_feed where motorcycle_id = :'moto_a'), 'novo dono escreve no diário');

select set_config('request.jwt.claim.sub', :'A', false);
select tests.ok((select count(*) = 2 from public.motorcycle_diary_feed where motorcycle_id = :'moto_a'), 'antigo dono continua vendo as próprias entradas');
select tests.ok((select count(*) = 0 from public.motorcycle_diary_feed where id = :'b_entry'), 'antigo dono não vê entradas do novo');
select tests.must_fail(format($$select public.update_diary_entry(%L, 'trip', 'x', current_date)$$, :'priv'), 'antigo dono não edita mais');
select tests.must_fail(format($$select public.create_diary_entry(%L, 'trip', 'x', current_date)$$, :'moto_a'), 'antigo dono não escreve mais');
select public.delete_diary_photo(:'att_priv') as removed \gset
select tests.ok(:'removed' = :'ph2', 'antigo dono remove a própria foto');
delete from storage.objects where name = :'ph2';
select tests.ok((select count(*) = 0 from storage.objects where name = :'ph2'), 'arquivo removido do Storage');
select public.delete_diary_entry(:'pub') as paths \gset
select tests.ok(:'paths' = '{' || :'ph1' || '}', 'excluir entrada devolve os arquivos');
select tests.ok((select count(*) = 0 from public.attachments where diary_entry_id = :'pub'), 'fotos da entrada removidas');
select public.delete_diary_entry(:'priv');
select tests.ok((select count(*) = 0 from public.motorcycle_diary_feed where motorcycle_id = :'moto_a'), 'antigo dono excluiu suas entradas');
reset role;

select set_config('request.jwt.claim.sub', '', false);
select tests.ok((select count(*) >= 5 from public.audit_logs where entity_type = 'motorcycle_diary'), 'diário auditado');
select tests.ok((select count(*) = 0 from public.audit_logs where entity_type = 'motorcycle_diary'
                   and (coalesce(new_data, '{}')::text || coalesce(previous_data, '{}')::text) ~ 'Segredo|Escapamento|Serra'), 'auditoria não guarda o conteúdo do diário');
select tests.must_fail($$delete from public.attachments where diary_entry_id is null$$, 'anexos de manutenção continuam imutáveis');

\echo '=== TODOS OS TESTES DA FASE 2 (DIÁRIO) PASSARAM ==='
