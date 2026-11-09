-- =============================================================================
-- Direitos do titular (ADR-036; PRD 15.6) — banco de TESTE; após phase6l
-- A: titular com motos e histórico; B: outro usuário; D: administrador.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Direitos do titular (LGPD)'

-- Cópia dos dados
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.export_my_data()::text as ex \gset
reset role;
select tests.ok((:'ex'::jsonb -> 'account' ->> 'email') = (select email from public.profiles where id = :'A'), 'cópia traz os dados da conta');
select tests.ok(jsonb_array_length(:'ex'::jsonb -> 'motorcycles') = (select count(*) from public.motorcycle_ownerships where owner_user_id = :'A' and ended_at is null),
                'cópia traz as motos atuais');
select tests.ok(jsonb_array_length(:'ex'::jsonb -> 'motorcycles' -> 0 -> 'maintenance') >= 1, 'cópia traz o histórico das motos');
select tests.ok(position('storage_path' in :'ex') = 0 and position('token' in :'ex') = 0 and position('chassis' in :'ex') = 0
                and position('provider_' in :'ex') = 0, 'cópia sem caminhos de arquivo, códigos de link, chassi nem ids do pagamento');
select tests.ok(position((select email from public.profiles where id = :'B') in :'ex') = 0 or
                exists (select 1 from public.transfer_requests where from_user_id = :'A' and to_email = (select email from public.profiles where id = :'B')),
                'cópia não traz dados de outras pessoas (salvo e-mail que o próprio titular informou)');
select tests.ok(exists (select 1 from public.audit_logs where action = 'privacy_data_exported' and actor_user_id = :'A'), 'cópia registrada na auditoria');
set role anon;
select tests.must_fail($$select public.export_my_data()$$, 'visitante não exporta');
reset role;

-- Pedidos
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail($$select public.create_privacy_request('venda', null)$$, 'tipo inválido recusado');
select tests.must_fail($$select public.create_privacy_request('correction', 'curto')$$, 'correção exige descrição');
select public.create_privacy_request('deletion', 'Quero excluir minha conta.') as req_del \gset
select public.create_privacy_request('correction', 'Meu nome está escrito errado no cadastro.') as req_cor \gset
select public.create_privacy_request('access', null) as req_acc \gset
select tests.must_fail($$select public.create_privacy_request('other', 'Mais um pedido em andamento')$$, 'no máximo 3 pedidos em andamento');
select tests.ok((select count(*) = 3 from public.get_my_privacy_requests()), 'titular acompanha os pedidos');
select public.cancel_my_privacy_request(:'req_acc');
select tests.ok((select status = 'canceled' from public.get_my_privacy_requests() where id = :'req_acc'), 'titular cancela pedido pendente');
select tests.must_fail($$select * from public.privacy_requests$$, 'tabela fechada para o navegador');
select tests.must_fail($$select * from public.admin_list_privacy_requests()$$, 'titular não vê a fila');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select count(*) = 0 from public.get_my_privacy_requests() where id = :'req_del'), 'outro usuário não vê os pedidos de A');
select tests.must_fail(format($$select public.cancel_my_privacy_request(%L)$$, :'req_del'), 'outro usuário não cancela');
reset role;

-- Admin responde
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok(exists (select 1 from public.admin_list_privacy_requests() where id = :'req_del' and email_masked like '%•••@%' and motorcycles >= 1),
                'fila do admin com e-mail mascarado e motos do titular');
select tests.must_fail(format($$select public.admin_resolve_privacy_request(%L, 'done', 'Conta excluída conforme pedido.', 'curto')$$, :'req_cor'), 'decisão exige motivo');
select tests.must_fail(format($$select public.admin_resolve_privacy_request(%L, 'done', 'ok', 'Correção feita pelo suporte')$$, :'req_cor'), 'decisão exige resposta ao titular');
select public.admin_resolve_privacy_request(:'req_cor', 'done', 'Nome corrigido conforme o documento enviado.', 'Correção de nome solicitada pelo titular');
select public.admin_resolve_privacy_request(:'req_del', 'in_progress', 'Recebemos o pedido; vamos confirmar a transferência das suas motos antes de excluir.', 'Exclusão em andamento conforme procedimento');
select tests.must_fail(format($$select public.admin_resolve_privacy_request(%L, 'rejected', 'Tentando decidir de novo.', 'Pedido já encerrado')$$, :'req_cor'), 'pedido encerrado não é decidido de novo');
reset role;
select tests.ok((select count(*) = 2 from public.audit_logs where action = 'admin_resolve_privacy_request' and actor_user_id = :'D'), 'decisões auditadas');
select tests.ok((select count(*) >= 2 from public.notifications where user_id = :'A' and kind = 'admin_notice' and link = '/painel/conta'
                   and title like 'Seu pedido de privacidade%'), 'titular recebe aviso de cada resposta');

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok((select status = 'done' and reply like 'Nome corrigido%' and resolved_at is not null from public.get_my_privacy_requests() where id = :'req_cor'),
                'titular vê a resposta');
select tests.must_fail(format($$select public.cancel_my_privacy_request(%L)$$, :'req_del'), 'pedido em análise não é cancelado pelo titular');
reset role;

-- Exclusão = anonimização
\set F '66666666-6666-6666-6666-666666666666'
\set G '77777777-7777-7777-7777-777777777777'
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  (:'F', 'fabio@teste.local', '{"full_name":"Fábio Teste"}', 'authenticated', 'authenticated'),
  (:'G', 'gabi@teste.local', '{"full_name":"Gabi Teste"}', 'authenticated', 'authenticated');
update public.profiles set phone = '11977776666' where id = :'F';
select set_config('request.jwt.claim.sub', :'F', false);
set role authenticated;
select public.register_motorcycle('Yamaha', 'Fazer 250', 2021, 'FAB1A11', 20000) ->> 'motorcycle_id' as moto_f \gset
select public.create_diary_entry(:'moto_f', 'trip', 'Viagem com a Fazer', current_date, 'Fui até a serra.') as diary_f \gset
select public.save_owner_expense(null, :'moto_f', 'fuel', current_date, 5000, 'Gasolina');
reset role;
select :'moto_f' || '/' || gen_random_uuid() || '.jpg' as p_diary \gset
insert into storage.objects (bucket_id, name, metadata) values ('attachments', :'p_diary', '{"size": 3000, "mimetype": "image/jpeg"}');
set role authenticated;
select public.register_attachment(:'moto_f', :'p_diary', 'serra.jpg', 'photo', null, :'diary_f');
select public.create_privacy_request('deletion', 'Quero excluir minha conta.') as req_f \gset
reset role;

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.admin_anonymize_account(%L, 'Exclusão a pedido do titular')$$, :'req_f'), 'não anonimiza com moto no nome');
select tests.must_fail(format($$select public.admin_anonymize_account(%L, 'Exclusão a pedido do titular')$$, :'req_cor'), 'só pedidos de exclusão em aberto');
reset role;

-- F transfere a moto para G
select set_config('request.jwt.claim.sub', :'F', false);
set role authenticated;
select public.create_transfer_request(:'moto_f', 'gabi@teste.local') as tr_f \gset
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.admin_anonymize_account(%L, 'Exclusão a pedido do titular')$$, :'req_f'), 'não anonimiza com transferência pendente');
reset role;
select set_config('request.jwt.claim.sub', :'G', false);
set role authenticated;
select public.accept_transfer_request(:'tr_f');
reset role;
select count(*) as hist_before from public.maintenance_records where motorcycle_id = :'moto_f' \gset

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.admin_anonymize_account(%L, 'Exclusão a pedido do titular')$$, :'req_f'), 'usuário comum não anonimiza');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.admin_anonymize_account(%L, 'curto')$$, :'req_f'), 'anonimização exige motivo');
select public.admin_anonymize_account(:'req_f', 'Exclusão a pedido do titular, motos transferidas')::text as anon \gset
reset role;
select tests.ok((:'anon'::jsonb ->> 'diary_entries')::int = 1 and (:'anon'::jsonb ->> 'diary_files')::int = 1, 'diário e fotos do titular apagados');
select tests.ok((select full_name = 'Conta excluída' and (email is null or email like 'excluida-%@anon.invalid') and phone is null and account_status = 'blocked' from public.profiles where id = :'F'), 'perfil sem dados pessoais e bloqueado');
select tests.ok((select email = 'excluida-' || :'F' || '@anon.invalid' and raw_user_meta_data = '{}'::jsonb and banned_until = 'infinity' from auth.users where id = :'F'),
                'login sem e-mail real e bloqueado');
select tests.ok((select count(*) = 0 from public.notifications where user_id = :'F') and (select count(*) = 0 from public.motorcycle_diary where author_id = :'F'), 'avisos e diário apagados');
select tests.ok((select count(*) = 0 from public.owner_expenses where user_id = :'F'), 'despesas avulsas apagadas');
select tests.ok(exists (select 1 from storage.objects where name = :'p_diary') and not exists (select 1 from public.attachments where storage_path = :'p_diary'),
                'foto do diário fica sem registro (sai na limpeza automática)');
select tests.ok((select count(*) from public.maintenance_records where motorcycle_id = :'moto_f') = :hist_before
                and exists (select 1 from public.motorcycle_ownerships where motorcycle_id = :'moto_f' and owner_user_id = :'F' and ended_at is not null),
                'histórico da moto e da titularidade anterior preservados');
select tests.ok((select status = 'done' and details is null and resolved_at is not null from public.privacy_requests where id = :'req_f'), 'pedido encerrado sem detalhes pessoais');
select tests.ok(exists (select 1 from public.audit_logs where action = 'admin_anonymize_account' and actor_user_id = :'D' and new_data ->> 'reason' like 'Exclusão a pedido%'),
                'anonimização auditada');
select set_config('request.jwt.claim.sub', :'G', false);
set role authenticated;
select tests.ok(exists (select 1 from public.my_motorcycles where id = :'moto_f'), 'novo dono segue com a moto');
reset role;
\echo '=== TODOS OS TESTES DOS DIREITOS DO TITULAR PASSARAM ==='
