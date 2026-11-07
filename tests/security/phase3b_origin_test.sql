-- =============================================================================
-- Testes da Fase 3 — Oficina de Origem (banco de TESTE; roda depois de phase3a)
-- B é titular de duas motos; C tem a "Oficina do Carlos" (com recusa recente
-- na moto_b). A e D criam oficinas novas aqui.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 3: Oficina de Origem'
select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_c from public.workshops where public_slug = 'oficina-do-carlos' \gset
select p.plate as plate_b, p.motorcycle_id as moto_b
  from public.motorcycle_plates p join public.motorcycle_ownerships o on o.motorcycle_id = p.motorcycle_id and o.ended_at is null
 where p.valid_until is null and o.owner_user_id = :'B' order by p.created_at limit 1 \gset
select p.plate as plate_x, p.motorcycle_id as moto_x
  from public.motorcycle_plates p join public.motorcycle_ownerships o on o.motorcycle_id = p.motorcycle_id and o.ended_at is null
 where p.valid_until is null and o.owner_user_id = :'B' and p.motorcycle_id <> :'moto_b' limit 1 \gset

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.create_workshop('Oficina da Ana', 'oficina-da-ana', 'Franca', 'SP') as org_a \gset
select tests.ok((public.search_motorcycle_by_plate(:'org_a', :'plate_b') ->> 'origin_available') = 'true', 'passaporte novo aceita Oficina de Origem');
select public.request_workshop_access(:'org_a', :'plate_b', 'Ajudamos no cadastro', true) ->> 'id' as acc_a \gset
select tests.ok((select access_type = 'origin' and status = 'pending' from public.motorcycle_workshop_access where id = :'acc_a'), 'pedido de Origem fica pendente');
select tests.must_fail(format($$select public.set_origin_workshop(%L, true)$$, :'acc_a'), 'oficina não se define como Origem');
reset role;

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.create_workshop('Moto Center D', 'moto-center-d', 'Franca', 'SP') as org_d \gset
reset role;

-- Titular aprova como Origem
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.decide_workshop_access(:'acc_a', true);
select tests.ok((select access_type = 'origin' and status = 'approved' from public.motorcycle_workshop_access where id = :'acc_a'), 'titular aprova como Oficina de Origem');
select tests.ok((select bool_and(not origin_available) from public.get_motorcycle_workshop_access(:'moto_b')), 'depois disso a moto não aceita outra Origem');
reset role;

-- Segunda oficina não vira Origem enquanto houver uma
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((public.search_motorcycle_by_plate(:'org_d', :'plate_b') ->> 'origin_available') = 'false', 'pesquisa mostra que a Origem já existe');
select tests.must_fail(format($$select public.request_workshop_access(%L, %L, null, true)$$, :'org_d', :'plate_b'), 'novo pedido de Origem recusado');
select public.request_workshop_access(:'org_d', :'plate_b') ->> 'id' as acc_d \gset
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.decide_workshop_access(:'acc_d', true);
select tests.must_fail(format($$select public.set_origin_workshop(%L, true)$$, :'acc_d'), 'só uma Oficina de Origem por moto');
select public.set_origin_workshop(:'acc_a', false);
select tests.ok((select access_type = 'regular' and status = 'approved' from public.motorcycle_workshop_access where id = :'acc_a'), 'titular tira o título sem cortar o acesso');
select public.set_origin_workshop(:'acc_d', true);
select tests.ok((select access_type = 'origin' from public.motorcycle_workshop_access where id = :'acc_d'), 'titular define outra oficina autorizada como Origem');
select public.revoke_workshop_access(:'acc_d');
select tests.ok((select status = 'revoked' from public.motorcycle_workshop_access where id = :'acc_d'), 'titular revoga a Oficina de Origem a qualquer momento');
select tests.ok((select bool_and(origin_available) from public.get_motorcycle_workshop_access(:'moto_b')), 'após revogar, a moto volta a aceitar Origem no prazo');
reset role;

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok(not public.workshop_has_access(:'moto_b'), 'Origem revogada perde o acesso');
reset role;

-- Pedido de Origem aprovado só como acesso comum
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.request_workshop_access(:'org_c', :'plate_x', null, true) ->> 'id' as acc_c \gset
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.decide_workshop_access(:'acc_c', true, false);
select tests.ok((select access_type = 'regular' and status = 'approved' from public.motorcycle_workshop_access where id = :'acc_c'), 'titular aprova pedido de Origem só como acesso');
reset role;

-- Prazo encerrado
select set_config('request.jwt.claim.sub', '', false);
update public.system_settings set value = '0' where key = 'origin_workshop_window_days';
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.must_fail(format($$select public.set_origin_workshop(%L, true)$$, :'acc_c'), 'fora do prazo não define Origem');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.ok((public.search_motorcycle_by_plate(:'org_c', :'plate_x') ->> 'origin_available') = 'false', 'pesquisa mostra prazo encerrado');
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.system_settings set value = '30' where key = 'origin_workshop_window_days';

-- Integridade
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.must_fail(format($$update public.motorcycle_workshop_access set access_type = 'origin' where id = %L$$, :'acc_c'), 'alteração direta do tipo bloqueada');
reset role;
select set_config('request.jwt.claim.sub', '', false);
select tests.must_fail(format($$update public.motorcycle_workshop_access set access_type = 'regular' where id = %L$$, :'acc_d'), 'autorização encerrada não muda de tipo');
select tests.must_fail(format($$update public.motorcycle_workshop_access set organization_id = %L where id = %L$$, :'org_c', :'acc_a'), 'oficina do pedido não muda');
select tests.ok((select count(*) >= 3 from public.audit_logs where entity_type = 'motorcycle_workshop_access' and new_data ->> 'access_type' = 'origin'), 'mudanças de Origem auditadas');

\echo '=== TODOS OS TESTES DA FASE 3 (OFICINA DE ORIGEM) PASSARAM ==='
