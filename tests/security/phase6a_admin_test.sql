-- =============================================================================
-- Testes da Fase 6.1 — painel administrativo (banco de TESTE; após phase5e)
-- A, B: usuários; D: administrador.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 6.1: painel administrativo'

select o.id as org_a from public.organizations o join public.workshops w on w.organization_id = o.id where w.public_slug = 'oficina-da-ana' \gset

-- Usuário comum não acessa nada
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail($$select public.admin_get_metrics()$$, 'usuário não vê indicadores');
select tests.must_fail($$select public.admin_list_users()$$, 'usuário não lista contas');
select tests.must_fail(format($$select public.admin_get_user(%L, 'quero ver os dados dele')$$, :'B'), 'usuário não abre conta alheia');
select tests.must_fail(format($$select public.admin_set_user_status(%L, 'blocked', 'tentativa de bloqueio indevido')$$, :'B'), 'usuário não bloqueia ninguém');
select tests.must_fail($$select public.admin_list_workshops()$$, 'usuário não lista oficinas');
select tests.must_fail(format($$select public.admin_set_workshop_status(%L, 'blocked', 'tentativa de bloqueio indevido')$$, :'org_a'), 'usuário não bloqueia oficina');
select tests.must_fail(format($$update public.profiles set account_status = 'active' where id = %L$$, :'A'), 'usuário não altera a própria situação');
reset role;

-- Admin
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.admin_get_metrics() as m \gset
select tests.ok((:'m'::jsonb ->> 'users_total')::int >= 4 and :'m'::jsonb ? 'mrr_cents' and :'m'::jsonb ? 'storage_bytes'
                and :'m'::jsonb ? 'claims_pending' and :'m'::jsonb ? 'invoices_failed', 'indicadores executivos numa chamada');
select tests.ok((select bool_and(email_masked like '%•••@%') from public.admin_list_users()), 'lista mostra e-mail mascarado');
select tests.ok((select count(*) = 1 from public.admin_list_users('bruno') where id = :'B'), 'busca por nome ou e-mail');
select tests.ok((select is_admin from public.admin_list_users() where id = :'D'), 'lista indica administradores');
select tests.must_fail(format($$select public.admin_get_user(%L, 'curto')$$, :'B'), 'dados privados exigem motivo');
select public.admin_get_user(:'B', 'Atendimento: usuário pediu ajuda por e-mail') as u \gset
select tests.ok(:'u'::jsonb ->> 'email' = 'bruno@teste.local' and jsonb_typeof(:'u'::jsonb -> 'motorcycles') = 'array', 'detalhe com e-mail e motos');
reset role;
select tests.ok((select count(*) = 1 from public.audit_logs where action = 'admin_viewed_user' and entity_id = :'B'
                 and new_data ->> 'reason' = 'Atendimento: usuário pediu ajuda por e-mail' and actor_user_id = :'D'), 'consulta registrada com motivo e autor');

-- Suspensão
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.admin_set_user_status(%L, 'suspended', 'curtinho')$$, :'B'), 'suspensão exige motivo de 10+ caracteres');
select tests.must_fail(format($$select public.admin_set_user_status(%L, 'suspended', 'Teste de autossuspensão')$$, :'D'), 'admin não suspende a si mesmo');
select tests.must_fail(format($$select public.admin_set_user_status(%L, 'apagado', 'Situação que não existe')$$, :'B'), 'situação inválida recusada');
select public.admin_set_user_status(:'B', 'suspended', 'Denúncia de uso indevido em análise');
reset role;
select tests.ok((select account_status = 'suspended' and status_reason like 'Denúncia%' and status_changed_by = :'D' from public.profiles where id = :'B')
                and (select banned_until = 'infinity' from auth.users where id = :'B'), 'suspensão registrada e login bloqueado');
select tests.ok((select count(*) = 1 from public.audit_logs where action = 'admin_set_user_status' and entity_id = :'B'), 'suspensão auditada');
select tests.ok((select count(*) > 0 from public.motorcycle_ownerships where owner_user_id = :'B' and ended_at is null), 'suspensão não mexe nas motos nem no histórico');
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.admin_set_user_status(:'B', 'active', 'Análise concluída, sem irregularidade');
reset role;
select tests.ok((select account_status = 'active' and status_reason is null from public.profiles where id = :'B')
                and (select banned_until is null from auth.users where id = :'B'), 'reativação libera o login');

-- Oficinas
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((select count(*) >= 1 from public.admin_list_workshops('ana') where id = :'org_a'), 'admin lista e busca oficinas');
select public.admin_set_workshop_status(:'org_a', 'suspended', 'Reclamações de clientes em análise');
reset role;
select tests.ok(not public.is_org_active(:'org_a'), 'oficina suspensa deixa de operar');
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.search_motorcycle_by_plate(%L, 'ABC1D23')$$, :'org_a'), 'oficina suspensa não pesquisa placas');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.admin_set_workshop_status(:'org_a', 'active', 'Reclamações resolvidas com o cliente');
select public.admin_set_workshop_verification(:'org_a', 'verified', 'Documentos conferidos: CNPJ e endereço');
select tests.ok((select verification_status = 'verified' and status = 'active' from public.admin_list_workshops() where id = :'org_a'), 'reativação e verificação');
select tests.must_fail(format($$select public.admin_set_workshop_verification(%L, 'talvez', 'Verificação inexistente aqui')$$, :'org_a'), 'verificação inválida recusada');
reset role;
select tests.ok((select count(*) >= 3 from public.audit_logs where action in ('admin_set_workshop_status', 'admin_set_workshop_verification')
                 and new_data ? 'reason'), 'ações sobre oficinas auditadas com motivo');

\echo '=== TODOS OS TESTES DA FASE 6.1 (ADMIN) PASSARAM ==='
