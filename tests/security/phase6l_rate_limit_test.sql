-- =============================================================================
-- Limite de consultas anônimas (ADR-035; KI-003) — banco de TESTE; após phase6k
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'

\echo '--- Limite de consultas anônimas'
select m.public_id as pub from public.motorcycles m join public.motorcycle_ownerships o on o.motorcycle_id = m.id
 where o.owner_user_id = :'A' and o.ended_at is null and m.status = 'active' limit 1 \gset
select token as tok from public.passport_shares s join public.motorcycle_ownerships o on o.motorcycle_id = s.motorcycle_id and o.owner_user_id = s.created_by and o.ended_at is null
 where s.revoked_at is null and (s.expires_at is null or s.expires_at > now()) limit 1 \gset
update public.system_settings set value = '3' where key in ('public_passport_views_per_hour', 'shared_passport_views_per_hour');

select set_config('request.jwt.claim.sub', '', false);
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.9, 10.0.0.1"}', false);
set role anon;
select tests.ok(public.get_public_passport(:'pub') ->> 'public_id' = :'pub', 'consulta 1 liberada');
select public.get_public_passport(:'pub');
select public.get_public_passport(:'pub');
select tests.must_fail(format($$select public.get_public_passport(%L)$$, :'pub'), 'passou do limite: consulta recusada');
select tests.must_fail($$select * from public.anon_rate_limits$$, 'contagens fechadas para o navegador');
select tests.must_fail($$select public.anon_rate_limit_ok('public_passport', 'public_passport_views_per_hour')$$, 'contador não é chamado direto');
reset role;

-- Outra conexão continua liberada; IP não é guardado
select set_config('request.headers', '{"cf-connecting-ip": "198.51.100.7"}', false);
set role anon;
select tests.ok(public.get_public_passport(:'pub') is not null, 'outra conexão continua liberada');
reset role;
select tests.ok((select count(*) = 0 from public.anon_rate_limits where key_hash like '%203.0.113%' or key_hash like '%198.51%')
                and (select bool_and(key_hash ~ '^[0-9a-f]{64}$') from public.anon_rate_limits), 'só o resumo do IP é guardado');
select tests.ok((select hits = 3 from public.anon_rate_limits where bucket = 'public_passport' order by hits desc limit 1), 'contagem por hora (recusas não somam)');

-- Passaporte compartilhado tem o seu próprio limite
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.9"}', false);
set role anon;
select tests.ok(public.get_shared_passport(:'tok') is not null, 'compartilhado: limite separado do público');
select public.get_shared_passport(:'tok');
select public.get_shared_passport(:'tok');
select tests.must_fail(format($$select public.get_shared_passport(%L)$$, :'tok'), 'compartilhado: passou do limite');
reset role;

-- Sem IP (chamada interna) não há limite; código inválido nem conta
select set_config('request.headers', '', false);
set role anon;
select tests.ok(public.get_public_passport(:'pub') is not null, 'sem IP no pedido: sem limite');
reset role;
select set_config('request.headers', '{"x-forwarded-for": "192.0.2.1"}', false);
set role anon;
select public.get_public_passport('nao-e-codigo');
reset role;
select tests.ok((select count(*) from public.anon_rate_limits) = 3, 'código com formato inválido não conta');

-- Limpeza de registros antigos
insert into public.anon_rate_limits (bucket, key_hash, window_start, hits) values ('public_passport', repeat('0', 64), now() - interval '3 days', 1);
delete from public.anon_rate_limits where window_start < now() - interval '2 days';
select tests.ok((select count(*) = 0 from public.anon_rate_limits where window_start < now() - interval '2 days'), 'registros com mais de 2 dias são apagáveis');

update public.system_settings set value = '120' where key in ('public_passport_views_per_hour', 'shared_passport_views_per_hour');
select set_config('request.headers', '', false);
\echo '=== TODOS OS TESTES DO LIMITE DE CONSULTAS PASSARAM ==='
