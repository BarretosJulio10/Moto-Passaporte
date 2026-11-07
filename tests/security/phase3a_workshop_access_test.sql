-- =============================================================================
-- Testes da Fase 3 — pesquisa por placa e autorizações de oficina
-- (banco de TESTE; roda depois das Fases 1 e 2 e usa os dados delas:
--  C é responsável pela "Oficina do Carlos"; B é titular de motos).
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 3: pesquisa por placa e autorizações'
select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_c from public.workshops where public_slug = 'oficina-do-carlos' \gset
select p.plate as plate_b, p.motorcycle_id as moto_b
  from public.motorcycle_plates p
  join public.motorcycle_ownerships o on o.motorcycle_id = p.motorcycle_id and o.ended_at is null
 where p.valid_until is null and o.owner_user_id = :'B'
 order by p.created_at limit 1 \gset

-- ===== Oficina pesquisa
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.ok((public.search_motorcycle_by_plate(:'org_c', 'ZZZ9Z99') ->> 'found') = 'false', 'placa inexistente: não encontrada');
select public.search_motorcycle_by_plate(:'org_c', lower(:'plate_b')) as res \gset
select tests.ok((:'res'::jsonb ->> 'found') = 'true' and (:'res'::jsonb ->> 'brand') is not null, 'placa encontrada (aceita minúsculas)');
select tests.ok(not (:'res'::jsonb ?| array['owner', 'plate', 'chassis', 'mileage', 'latest_mileage', 'public_id'])
                and (:'res'::jsonb ->> 'motorcycle_id') is null, 'antes da autorização revela só marca, modelo e ano');
select tests.must_fail(format($$select public.search_motorcycle_by_plate(%L, 'X')$$, :'org_c'), 'placa inválida recusada');
select tests.ok((select count(*) = 0 from public.plate_search_log), 'oficina não lê o registro de pesquisas');
select tests.ok((select count(*) = 0 from public.motorcycles), 'oficina continua sem ver motos');

-- ===== Pedido
select public.request_workshop_access(:'org_c', :'plate_b', 'Revisão agendada para sábado') as req \gset
select (:'req'::jsonb ->> 'id') as acc \gset
select tests.ok((:'req'::jsonb ->> 'status') = 'pending', 'pedido criado como pendente');
select tests.ok((public.request_workshop_access(:'org_c', :'plate_b') ->> 'id') = :'acc', 'pedido repetido devolve o mesmo pedido');
select tests.must_fail(format($$select public.request_workshop_access(%L, 'ZZZ9Z99')$$, :'org_c'), 'pedido para placa inexistente falha');
select tests.must_fail(format($$select public.decide_workshop_access(%L, true)$$, :'acc'), 'oficina não aprova o próprio pedido');
select tests.must_fail(format($$update public.motorcycle_workshop_access set status = 'approved' where id = %L$$, :'acc'), 'alteração direta bloqueada');
select tests.must_fail(format($$insert into public.motorcycle_workshop_access (motorcycle_id, organization_id) values (%L, %L)$$, :'moto_b', :'org_c'), 'inserção direta bloqueada');
select tests.ok((select status = 'pending' and plate is null and motorcycle_id is null and latest_mileage is null
                   from public.get_workshop_access_list(:'org_c') where id = :'acc'), 'pendente: oficina não vê placa, km nem id');
select tests.ok(not public.workshop_has_access(:'moto_b'), 'pendente não dá acesso');
reset role;

-- ===== Quem não é membro (A não tem moto nem oficina; D é admin nos testes da Fase 1)
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.search_motorcycle_by_plate(%L, %L)$$, :'org_c', :'plate_b'), 'não membro não pesquisa pela oficina');
select tests.must_fail(format($$select public.request_workshop_access(%L, %L)$$, :'org_c', :'plate_b'), 'não membro não pede acesso');
select tests.must_fail(format($$select * from public.get_workshop_access_list(%L)$$, :'org_c'), 'não membro não lista autorizações');
select tests.must_fail(format($$select * from public.get_motorcycle_workshop_access(%L)$$, :'moto_b'), 'quem não é titular não vê autorizações da moto');
select tests.ok((select count(*) = 0 from public.motorcycle_workshop_access), 'A não vê pedidos');
reset role;
set role anon;
select tests.must_fail(format($$select public.search_motorcycle_by_plate(%L, %L)$$, :'org_c', :'plate_b'), 'anônimo não pesquisa');
reset role;

-- ===== Titular decide
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select count(*) = 1 and bool_and(workshop_name = 'Oficina do Carlos' and message = 'Revisão agendada para sábado')
                   from public.get_my_pending_access_requests()), 'titular vê pedido pendente com nome da oficina');
select tests.ok((select status = 'pending' from public.get_motorcycle_workshop_access(:'moto_b') where id = :'acc'), 'pedido aparece na moto');
select public.decide_workshop_access(:'acc', true);
select tests.ok((select status = 'approved' from public.motorcycle_workshop_access where id = :'acc'), 'titular aprova');
select tests.must_fail(format($$select public.decide_workshop_access(%L, false)$$, :'acc'), 'pedido já respondido não muda');
select tests.ok((select count(*) = 0 from public.get_my_pending_access_requests()), 'sem pendências depois da decisão');
reset role;

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.ok(public.workshop_has_access(:'moto_b') and public.workshop_has_access(:'moto_b', :'org_c'), 'aprovado dá acesso');
select tests.ok((select status = 'approved' and plate = :'plate_b' and motorcycle_id = :'moto_b' and latest_mileage is not null
                   from public.get_workshop_access_list(:'org_c') where id = :'acc'), 'aprovado: oficina vê placa, km e id');
select tests.ok((public.search_motorcycle_by_plate(:'org_c', :'plate_b') ->> 'motorcycle_id') = :'moto_b', 'pesquisa devolve id só com acesso');
select tests.must_fail(format($$select public.cancel_workshop_access_request(%L)$$, :'acc'), 'autorização ativa não é cancelada como pedido');
reset role;

-- ===== Revogação
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.revoke_workshop_access(:'acc');
select tests.ok((select status = 'revoked' and end_reason = 'owner' and ended_at is not null from public.motorcycle_workshop_access where id = :'acc'), 'titular revoga');
select tests.must_fail(format($$select public.revoke_workshop_access(%L)$$, :'acc'), 'revogação não se repete');
reset role;

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.ok(not public.workshop_has_access(:'moto_b'), 'revogação bloqueia o acesso imediatamente');
select tests.ok((select plate is null and motorcycle_id is null from public.get_workshop_access_list(:'org_c') where id = :'acc'), 'revogada: placa e km somem');
select public.request_workshop_access(:'org_c', :'plate_b') ->> 'id' as acc2 \gset
select tests.ok(:'acc2' <> :'acc', 'novo acesso exige novo pedido');
select public.cancel_workshop_access_request(:'acc2');
select tests.ok((select status = 'canceled' from public.motorcycle_workshop_access where id = :'acc2'), 'oficina cancela pedido pendente');
select public.request_workshop_access(:'org_c', :'plate_b') ->> 'id' as acc3 \gset
reset role;

-- ===== Recusa e espera
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.decide_workshop_access(:'acc3', false);
select tests.ok((select status = 'rejected' from public.motorcycle_workshop_access where id = :'acc3'), 'titular recusa');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.request_workshop_access(%L, %L)$$, :'org_c', :'plate_b'), 'após recusa, espera para pedir de novo');
select tests.ok((public.search_motorcycle_by_plate(:'org_c', :'plate_b') ->> 'access_status') = 'rejected', 'pesquisa mostra a recusa');
reset role;

-- ===== Oficina suspensa não opera
select set_config('request.jwt.claim.sub', '', false);
update public.organizations set status = 'suspended' where id = :'org_c';
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.search_motorcycle_by_plate(%L, %L)$$, :'org_c', :'plate_b'), 'oficina suspensa não pesquisa');
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.organizations set status = 'active' where id = :'org_c';

-- ===== Limite de pesquisas
select set_config('request.jwt.claim.sub', '', false);
update public.system_settings set value = '1' where key = 'workshop_plate_search_per_hour';
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.search_motorcycle_by_plate(%L, 'QWE1234')$$, :'org_c'), 'limite de pesquisas por hora');
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.system_settings set value = '30' where key = 'workshop_plate_search_per_hour';

-- ===== Integridade
select tests.ok((select count(*) = 4 and bool_and(plate_hash ~ '^[0-9a-f]{64}$') from public.plate_search_log), 'pesquisas registradas só com hash');
select tests.ok((select count(*) = 0 from public.plate_search_log where plate_hash = :'plate_b'), 'placa não fica em texto no registro');
select tests.must_fail($$delete from public.plate_search_log$$, 'registro de pesquisas não é apagado');
select tests.must_fail($$delete from public.motorcycle_workshop_access$$, 'autorizações não são apagadas');
select tests.must_fail(format($$update public.motorcycle_workshop_access set status = 'approved' where id = %L$$, :'acc'), 'revogada não volta a aprovada');
select tests.ok((select count(*) >= 6 from public.audit_logs where entity_type = 'motorcycle_workshop_access'), 'autorizações auditadas');

\echo '=== TODOS OS TESTES DA FASE 3 (AUTORIZAÇÕES) PASSARAM ==='
