-- =============================================================================
-- Verificação em duas etapas para administradores (ADR-030; KI-014) — banco de TESTE; após phase6f
-- D: administrador; A: usuário comum.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Administração com verificação em duas etapas'

-- Admin sem a segunda etapa (aal1)
select set_config('request.jwt.claim.sub', :'D', false);
select set_config('request.jwt.claim.aal', 'aal1', false);
set role authenticated;
select tests.ok(not public.is_admin(), 'admin sem a segunda etapa não é tratado como admin');
select tests.ok((select (x ->> 'has_admin_role')::boolean and x ->> 'aal' = 'aal1' and not (x ->> 'allowed')::boolean
                  from public.my_admin_access() x), 'site sabe que falta a segunda etapa');
select tests.must_fail($$select public.admin_get_metrics()$$, 'sem a segunda etapa: indicadores bloqueados');
select tests.must_fail($$select * from public.admin_list_users()$$, 'sem a segunda etapa: usuários bloqueados');
select tests.must_fail($$select public.admin_update_setting('billing_grace_days', '6', 'Tentativa sem MFA')$$, 'sem a segunda etapa: configurações bloqueadas');
select tests.must_fail($$select public.admin_plan_storage_cleanup('Limpeza sem segunda etapa')$$, 'sem a segunda etapa: limpeza bloqueada');
select tests.ok((select count(*) = 0 from public.audit_logs), 'sem a segunda etapa: auditoria não aparece (RLS)');
select tests.ok((select count(*) = 1 from public.profiles), 'sem a segunda etapa: só o próprio perfil');
reset role;

-- Com a segunda etapa (aal2)
select set_config('request.jwt.claim.aal', 'aal2', false);
set role authenticated;
select tests.ok(public.is_admin(), 'admin com a segunda etapa é admin');
select tests.ok((select (x ->> 'allowed')::boolean from public.my_admin_access() x), 'site libera a área administrativa');
select tests.ok((select (public.admin_get_metrics() ->> 'users_total')::int >= 1), 'com a segunda etapa: indicadores liberados');
select tests.ok((select count(*) > 0 from public.audit_logs), 'com a segunda etapa: auditoria liberada');
reset role;

-- Usuário comum, mesmo com aal2, continua sem acesso
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.ok(not public.is_admin() and not (select (x ->> 'has_admin_role')::boolean from public.my_admin_access() x), 'usuário comum com aal2 não vira admin');
select tests.must_fail($$select public.admin_get_metrics()$$, 'usuário comum continua bloqueado');
reset role;

set role anon;
select tests.must_fail($$select public.my_admin_access()$$, 'anônimo não consulta acesso');
reset role;
select set_config('request.jwt.claim.aal', '', false);
\echo '=== TODOS OS TESTES DA VERIFICAÇÃO EM DUAS ETAPAS PASSARAM ==='
