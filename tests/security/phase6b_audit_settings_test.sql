-- =============================================================================
-- Testes da Fase 6.1 (parte 2) — auditoria e configurações (banco de TESTE; após phase6a)
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Fase 6.1: auditoria e configurações'

-- Escrita direta fechada (inclusive para admin)
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail($$update public.system_settings set value = 'true' where key = 'billing_enabled'$$, 'admin não liga a contratação direto na tabela');
select tests.must_fail($$insert into public.system_settings (key, value) values ('nova', '1')$$, 'admin não cria configuração direto na tabela');
select tests.ok((select count(*) >= 10 from public.admin_list_settings()), 'admin lista configurações editáveis');
select tests.ok(not exists (select 1 from public.admin_list_settings() where key in ('billing_enabled', 'free_plan_max_motorcycles')),
                'contratação e chaves antigas não aparecem para edição');
select tests.must_fail($$select public.admin_update_setting('billing_enabled', 'true', 'Tentando ligar a contratação')$$, 'chave fora do catálogo recusada');
select tests.must_fail($$select public.admin_update_setting('billing_grace_days', '99', 'Tolerância maior que o permitido')$$, 'número fora da faixa recusado');
select tests.must_fail($$select public.admin_update_setting('billing_grace_days', '"7"', 'Texto no lugar de número')$$, 'tipo errado recusado');
select tests.must_fail($$select public.admin_update_setting('support_email', '"nao-e-email"', 'E-mail de suporte novo')$$, 'e-mail inválido recusado');
select tests.must_fail($$select public.admin_update_setting('support_whatsapp', '"123"', 'WhatsApp de suporte novo')$$, 'WhatsApp inválido recusado');
select tests.must_fail($$select public.admin_update_setting('billing_grace_days', '5', 'curto')$$, 'alteração exige motivo');
select public.admin_update_setting('billing_grace_days', '5', 'Decisão comercial: tolerância de 5 dias');
select public.admin_update_setting('support_email', '" Suporte@MotoPassaporte.com.br "', 'Canal de suporte definido');
select public.admin_update_setting('support_whatsapp', '"+55 (21) 98215-3814"', 'Canal de suporte definido');
reset role;
select tests.ok((select value = '5' from public.system_settings where key = 'billing_grace_days')
                and (select value = '"suporte@motopassaporte.com.br"' from public.system_settings where key = 'support_email')
                and (select value = '"5521982153814"' from public.system_settings where key = 'support_whatsapp'), 'valores validados e normalizados');
select tests.ok((select count(*) = 3 from public.audit_logs where action = 'admin_update_setting' and new_data ? 'reason' and actor_user_id = :'D'),
                'alterações auditadas com motivo');
set role anon;
select tests.ok((select value = '"suporte@motopassaporte.com.br"' from public.system_settings where key = 'support_email'), 'site público lê o contato novo');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select public.admin_update_setting('support_email', '""', 'Limpar o contato de suporte');
select public.admin_update_setting('billing_grace_days', '7', 'Volta ao valor provisório');
reset role;
select tests.ok((select value = 'null' from public.system_settings where key = 'support_email'), 'contato pode ser limpo');

-- Auditoria
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail($$select * from public.admin_search_audit()$$, 'usuário não consulta a auditoria');
select tests.must_fail($$select public.admin_get_audit_entry(1, 'Quero ver o conteúdo')$$, 'usuário não abre evento');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.ok((select count(*) = 50 from public.admin_search_audit(p_limit => 50)), 'busca paginada');
select max(id) as top from public.admin_search_audit(p_limit => 1) \gset
select tests.ok((select bool_and(id < :top) from public.admin_search_audit(p_limit => 20, p_before_id => :top)), 'paginação por id');
select tests.ok((select bool_and(action = 'admin_update_setting' and reason is not null) and count(*) >= 3
                 from public.admin_search_audit(p_action => 'admin_update_setting')), 'filtro por ação traz o motivo');
select tests.ok((select bool_and(actor_user_id = :'D') from public.admin_search_audit(p_actor => :'D')), 'filtro por autor');
select tests.ok((select bool_and(entity_type = 'motorcycles') from public.admin_search_audit(p_entity_type => 'motorcycles')), 'filtro por tipo');
select tests.ok((select count(*) = 0 from public.admin_search_audit(p_from => now() + interval '1 day')), 'filtro por data');
select tests.ok((public.admin_audit_facets() -> 'actions') ? 'admin_update_setting', 'valores para os filtros');
select id as ev from public.admin_search_audit(p_entity_type => 'motorcycle_private', p_limit => 1) \gset
select tests.must_fail(format($$select public.admin_get_audit_entry(%s, 'curto')$$, :ev), 'conteúdo exige motivo');
select tests.ok(public.admin_get_audit_entry(:ev, 'Investigação de alteração de chassi') ? 'new_data', 'conteúdo com motivo');
reset role;
select tests.ok((select count(*) = 1 from public.audit_logs where action = 'admin_viewed_audit' and entity_id = :'ev'::text and new_data ->> 'reason' like 'Investigação%'),
                'consulta ao conteúdo registrada');

\echo '=== TODOS OS TESTES DA FASE 6.1 (AUDITORIA E CONFIGURAÇÕES) PASSARAM ==='
