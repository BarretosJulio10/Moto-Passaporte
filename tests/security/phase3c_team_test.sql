-- =============================================================================
-- Testes da Fase 3 — membros da oficina e permissões (banco de TESTE; após phase3b)
-- C é responsável pela "Oficina do Carlos"; B (bruno@teste.local) será convidado.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 3: equipe da oficina'
select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_c from public.workshops where public_slug = 'oficina-do-carlos' \gset
select id as member_c from public.organization_members where organization_id = :'org_c' and user_id = :'C' \gset

-- ===== Convite
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.create_org_invite(%L, 'nao-e-email')$$, :'org_c'), 'e-mail inválido recusado');
select public.create_org_invite(:'org_c', '  Bruno@Teste.LOCAL ', true, false) as inv \gset
select (:'inv'::jsonb ->> 'token') as token, (:'inv'::jsonb ->> 'id') as inv_id \gset
select tests.ok(char_length(:'token') = 48, 'convite devolve token aleatório');
select tests.ok((select count(*) = 1 and bool_and(email = 'bruno@teste.local' and not can_register_services)
                   from public.get_org_invites(:'org_c')), 'responsável vê o convite com e-mail normalizado');
select tests.must_fail($$select * from public.organization_invites$$, 'tabela de convites não é lida diretamente');
reset role;

select set_config('request.jwt.claim.sub', '', false);
select tests.ok((select count(*) = 0 from public.organization_invites where token_hash = :'token'), 'token não é guardado em texto');
select tests.ok((select count(*) = 1 from public.organization_invites where token_hash = encode(extensions.digest(:'token', 'sha256'), 'hex')), 'só o hash do token é guardado');

-- Quem não é responsável não convida
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.create_org_invite(%L, 'x@y.com')$$, :'org_c'), 'não responsável não convida');
select tests.must_fail(format($$select * from public.get_org_invites(%L)$$, :'org_c'), 'não responsável não lista convites');
reset role;

-- Outra conta com o link não consegue aceitar
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((public.get_invite_preview(:'token') ->> 'email_matches') = 'false', 'prévia avisa que o e-mail não confere');
select tests.must_fail(format($$select public.accept_org_invite(%L)$$, :'token'), 'convite só vale para o e-mail convidado');
select tests.ok((public.get_invite_preview('token-falso') ->> 'status') = 'invalid', 'token falso é inválido');
reset role;
set role anon;
select tests.must_fail(format($$select public.get_invite_preview(%L)$$, :'token'), 'anônimo não vê prévia');
reset role;

-- B aceita
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok((select (p ->> 'status') = 'open' and (p ->> 'email_matches') = 'true' and (p ->> 'workshop_name') = 'Oficina do Carlos'
                   and (p ->> 'email_hint') = 'br•••@teste.local' from (select public.get_invite_preview(:'token') as p) x), 'prévia do convite para o convidado');
select tests.ok(public.accept_org_invite(:'token') = :'org_c'::uuid, 'convidado aceita');
select tests.ok(public.is_org_member(:'org_c') and not public.is_org_responsible(:'org_c'), 'convidado entra como funcionário');
select tests.ok(public.has_role('workshop'), 'convidado recebe o papel de oficina');
select tests.must_fail(format($$select public.accept_org_invite(%L)$$, :'token'), 'convite é de uso único');
select tests.ok(public.has_org_permission(:'org_c', 'request_access') and not public.has_org_permission(:'org_c', 'register_services'), 'permissões do convite aplicadas');
select tests.ok((select email is null from public.get_org_members(:'org_c') where user_id = :'C'), 'funcionário não vê e-mail dos colegas');
select tests.ok((select count(*) = 2 from public.get_org_members(:'org_c')), 'funcionário vê a equipe');
select id as member_b from public.organization_members where organization_id = :'org_c' and user_id = :'B' \gset

-- Ninguém altera o próprio papel ou permissões
select tests.must_fail(format($$select public.update_org_member(%L, 'responsible', true, true)$$, :'member_b'), 'funcionário não se promove');
select tests.must_fail(format($$select public.update_org_member(%L, 'staff', true, true)$$, :'member_c'), 'funcionário não altera o responsável');
select tests.must_fail(format($$update public.organization_members set role = 'responsible' where id = %L$$, :'member_b'), 'alteração direta bloqueada');
select tests.must_fail(format($$select public.create_org_invite(%L, 'z@z.com')$$, :'org_c'), 'funcionário não convida');
reset role;

select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.ok((select email = 'bruno@teste.local' from public.get_org_members(:'org_c') where user_id = :'B'), 'responsável vê e-mail da equipe');
select tests.must_fail(format($$select public.update_org_member(%L, 'staff', true, true)$$, :'member_c'), 'responsável não altera a si mesmo');
select public.update_org_member(:'member_b', 'staff', false, true);
reset role;

-- Sem permissão de pedir acesso, funcionário não pesquisa
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.must_fail(format($$select public.search_motorcycle_by_plate(%L, 'ABC1234')$$, :'org_c'), 'sem permissão não pesquisa placa');
select tests.must_fail(format($$select public.request_workshop_access(%L, 'ABC1234')$$, :'org_c'), 'sem permissão não pede acesso');
select tests.ok((select count(*) >= 1 from public.get_workshop_access_list(:'org_c')), 'continua vendo as motos da oficina');
reset role;

-- Pelo menos um responsável
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.leave_organization(%L)$$, :'org_c'), 'único responsável não sai');
select public.update_org_member(:'member_b', 'responsible', true, true);
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.ok(public.is_org_responsible(:'org_c'), 'responsável promove funcionário');
select public.update_org_member(:'member_c', 'staff', true, true);
select tests.must_fail(format($$select public.leave_organization(%L)$$, :'org_c'), 'novo único responsável também não sai');
select public.update_org_member(:'member_c', 'responsible', true, true);
select public.leave_organization(:'org_c');
select tests.ok(not public.is_org_member(:'org_c'), 'membro sai da oficina');
reset role;

-- Remoção e novo convite
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.create_org_invite(:'org_c', 'bruno@teste.local') ->> 'token' as token2 \gset
select public.create_org_invite(:'org_c', 'bruno@teste.local') ->> 'token' as token3 \gset
select tests.ok((select count(*) = 1 from public.get_org_invites(:'org_c')), 'novo convite para o mesmo e-mail substitui o anterior');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.must_fail(format($$select public.accept_org_invite(%L)$$, :'token2'), 'convite substituído não vale');
select public.accept_org_invite(:'token3');
select tests.ok(public.is_org_member(:'org_c'), 'ex-membro volta por novo convite');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.must_fail(format($$select public.remove_org_member(%L)$$, :'member_c'), 'responsável não remove a si mesmo');
select public.remove_org_member(:'member_b');
select tests.ok((select count(*) = 1 from public.get_org_members(:'org_c')), 'responsável remove funcionário');
select public.create_org_invite(:'org_c', 'outra@pessoa.com') ->> 'id' as inv2 \gset
select public.revoke_org_invite(:'inv2');
select tests.ok((select count(*) = 0 from public.get_org_invites(:'org_c')), 'responsável cancela convite');
select tests.must_fail(format($$select public.revoke_org_invite(%L)$$, :'inv2'), 'convite cancelado não muda de novo');
select public.create_org_invite(:'org_c', 'expira@pessoa.com') ->> 'token' as token_exp \gset
reset role;

select set_config('request.jwt.claim.sub', '', false);
update public.organization_invites set expires_at = now() - interval '1 minute' where email = 'expira@pessoa.com';
select tests.must_fail($$delete from public.organization_members where true$$, 'membros não são excluídos');
select tests.ok((select count(*) >= 4 from public.audit_logs where entity_type = 'organization_invites'), 'convites auditados');
select tests.ok((select count(*) >= 4 from public.audit_logs where entity_type = 'organization_members' and action = 'update'), 'mudanças na equipe auditadas');
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select tests.ok((public.get_invite_preview(:'token_exp') ->> 'status') = 'expired', 'convite expirado aparece como expirado');
reset role;

\echo '=== TODOS OS TESTES DA FASE 3 (EQUIPE) PASSARAM ==='
