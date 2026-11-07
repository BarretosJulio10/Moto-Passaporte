-- =============================================================================
-- Testes da Fase 4 — compartilhamento controlado (banco de TESTE; após phase4a)
-- Estado herdado: A é titular de moto_x (recebida por transferência), que tem
-- registros do dono anterior e da Oficina do Carlos, quilometragem e comprovantes.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'

\echo '--- Fase 4: compartilhamento controlado'
select set_config('request.jwt.claim.sub', '', false);
select motorcycle_id as moto_x from public.motorcycle_ownerships where owner_user_id = :'A' and ended_at is null limit 1 \gset
select public_id as pub_x from public.motorcycles where id = :'moto_x' \gset

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.create_diary_entry(:'moto_x', 'trip', 'Viagem compartilhável', current_date, 'Estrada boa', null, 'shareable');
select public.create_diary_entry(:'moto_x', 'other', 'Nota privada da Ana', current_date, 'Segredo da Ana');

-- Link padrão: sem placa, sem valores, sem comprovantes, sem diário
select public.create_passport_share(:'moto_x', 'Anúncio') as sh1 \gset
select (:'sh1'::jsonb ->> 'token') as tok1, (:'sh1'::jsonb ->> 'id') as id1 \gset
select tests.ok(:'tok1' ~ '^[0-9a-f]{48}$', 'código de 192 bits');
select tests.must_fail($$select * from public.passport_shares$$, 'tabela não é lida diretamente');
reset role;

set role anon;
select public.get_shared_passport(:'tok1') as p1 \gset
reset role;
select tests.ok((:'p1'::jsonb ->> 'brand') is not null, 'anônimo abre o link sem cadastro');
select tests.ok(not (:'p1'::jsonb ? 'plate') and not (:'p1'::jsonb ? 'diary') and (:'p1'::jsonb ? 'mileage') and (:'p1'::jsonb ? 'history'), 'padrão: km e histórico, sem placa e sem diário');
select tests.ok(jsonb_array_length(:'p1'::jsonb -> 'history') >= 2, 'histórico de serviços aparece');
select tests.ok((select bool_and(h -> 'service_value_cents' = 'null'::jsonb and h -> 'attachments' = 'null'::jsonb) from jsonb_array_elements(:'p1'::jsonb -> 'history') h), 'padrão: sem valores e sem comprovantes');
select tests.ok(:'p1' !~ 'recorded_by|Segredo|chassis|owner_user|created_by|email|full_name|public_id', 'nunca expõe autoria de pessoas, observações, chassi, contatos ou ids');
select tests.ok(exists (select 1 from jsonb_array_elements(:'p1'::jsonb -> 'history') h where h ->> 'evidence_level' = 'workshop' and h ->> 'workshop_name' = 'Oficina do Carlos'), 'serviço confirmado por oficina com o nome da oficina');

-- Link completo escolhido pelo titular
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.create_passport_share(:'moto_x', 'Comprador João', 30, true, true, true, true, true, true) ->> 'token' as tok2 \gset
select public.create_passport_share(:'moto_x', 'Só valores', null, false, false, false, true, true, false) ->> 'id' as id3 \gset
reset role;
set role anon;
select public.get_shared_passport(:'tok2') as p2 \gset
reset role;
select tests.ok((:'p2'::jsonb ->> 'plate') is not null, 'placa só quando escolhida');
select tests.ok(exists (select 1 from jsonb_array_elements(:'p2'::jsonb -> 'history') h where (h ->> 'service_value_cents') is not null), 'valores quando escolhidos');
select tests.ok(exists (select 1 from jsonb_array_elements(:'p2'::jsonb -> 'history') h where jsonb_array_length(h -> 'attachments') >= 1), 'tipos de comprovante quando escolhidos');
select tests.ok(:'p2' !~ 'storage_path|file_name', 'arquivos dos comprovantes não são expostos');
select tests.ok(exists (select 1 from jsonb_array_elements(:'p2'::jsonb -> 'diary') d where d ->> 'title' = 'Viagem compartilhável')
                and :'p2' !~ 'Nota privada da Ana', 'diário: só entradas compartilháveis');
select tests.ok((select show_values = false and show_attachments = false from public.passport_shares where id = :'id3'), 'sem histórico, valores e comprovantes ficam desligados');

-- Contagem, revogação, validade e titularidade
select tests.ok((select view_count = 1 and last_viewed_at is not null from public.passport_shares where token = :'tok1'), 'acessos contados');
select tests.ok(public.get_shared_passport('0000') is null and public.get_shared_passport(repeat('a', 48)) is null, 'código inválido ou inexistente não abre');
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.revoke_passport_share(:'id1');
select tests.must_fail(format($$select public.revoke_passport_share(%L)$$, :'id1'), 'revogação não se repete');
select tests.ok((select status = 'revoked' from public.get_motorcycle_shares(:'moto_x') where id = :'id1'), 'titular vê o link como revogado');
reset role;
set role anon;
select tests.ok(public.get_shared_passport(:'tok1') is null, 'link revogado para de funcionar na hora');
reset role;

select set_config('request.jwt.claim.sub', '', false);
insert into public.passport_shares (motorcycle_id, token, created_by, created_at, expires_at)
values (:'moto_x', repeat('b', 48), :'A', now() - interval '2 days', now() - interval '1 day');
insert into public.passport_shares (motorcycle_id, token, created_by)
values (:'moto_x', repeat('c', 48), :'B');
set role anon;
select tests.ok(public.get_shared_passport(repeat('b', 48)) is null, 'link vencido não abre');
select tests.ok(public.get_shared_passport(repeat('c', 48)) is null, 'link de quem não é mais titular não abre');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok((select status = 'expired' from public.get_motorcycle_shares(:'moto_x') where token = repeat('b', 48)), 'titular vê o link como expirado');
select tests.ok((select count(*) = 0 from public.get_motorcycle_shares(:'moto_x') where token = repeat('c', 48)), 'titular não vê links do antigo dono');
select tests.must_fail(format($$select public.create_passport_share(%L, null, 0)$$, :'moto_x'), 'validade inválida recusada');
reset role;

-- Quem não é titular
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.must_fail(format($$select public.create_passport_share(%L)$$, :'moto_x'), 'antigo dono não cria link');
select tests.must_fail(format($$select * from public.get_motorcycle_shares(%L)$$, :'moto_x'), 'antigo dono não lista links');
select tests.must_fail(format($$select public.revoke_passport_share(%L)$$, :'id3'), 'antigo dono não revoga');
select tests.must_fail(format($$select public.set_public_page_enabled(%L, false)$$, :'moto_x'), 'antigo dono não mexe na página pública');
reset role;

-- Página pública básica pode ser desativada
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok((public.get_passport_settings(:'moto_x') ->> 'public_page_enabled') = 'true', 'página básica ativa por padrão');
select public.set_public_page_enabled(:'moto_x', false);
reset role;
set role anon;
select tests.ok(public.get_public_passport(:'pub_x') is null, 'página básica desativada não abre');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.set_public_page_enabled(:'moto_x', true);
reset role;
set role anon;
select tests.ok(public.get_public_passport(:'pub_x') is not null, 'página básica reativada');
reset role;

-- Integridade
select set_config('request.jwt.claim.sub', '', false);
select tests.must_fail(format($$update public.passport_shares set show_values = true where id = %L$$, :'id3'), 'opções do link não mudam');
select tests.must_fail(format($$update public.passport_shares set revoked_at = null where id = %L$$, :'id1'), 'link revogado não volta');
select tests.must_fail($$delete from public.passport_shares$$, 'links não são apagados');
select tests.ok((select count(*) >= 4 from public.audit_logs where entity_type = 'passport_shares'), 'criação e revogação auditadas');
select tests.ok((select count(*) >= 2 from public.audit_logs where entity_type = 'passport_settings'), 'mudanças na página pública auditadas');

\echo '=== TODOS OS TESTES DA FASE 4 (COMPARTILHAMENTO) PASSARAM ==='
