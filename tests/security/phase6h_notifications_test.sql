-- =============================================================================
-- Central de notificações (PRD 12; ADR-031; KI-020) — banco de TESTE; roda depois de todas as fases.
-- Os gatilhos já estavam ativos durante as suítes anteriores: os avisos gerados por elas são conferidos.
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- Central de notificações'

-- 1. Avisos gerados pelos fluxos reais das suítes anteriores
select tests.ok((select count(*) > 0 from public.notifications n where kind = 'workshop_access_request'
                 and n.user_id = (select owner_user_id from public.motorcycle_ownerships o
                                   join public.motorcycle_workshop_access a on a.motorcycle_id = o.motorcycle_id
                                  where a.id::text = split_part(n.dedupe_key, ':', 2) and o.started_at <= n.created_at
                                  order by o.started_at desc limit 1)), 'pedido de oficina avisa o titular');
select tests.ok(exists (select 1 from public.notifications where kind = 'workshop_access_decided'), 'decisão do titular avisa a oficina');
select tests.ok(exists (select 1 from public.notifications where kind = 'workshop_service'), 'serviço da oficina avisa o titular');
select tests.ok(exists (select 1 from public.notifications n join public.transfer_requests t on t.id::text = split_part(n.dedupe_key, ':', 2)
                        where n.kind = 'transfer_received' and n.user_id = (select id from auth.users where lower(email) = lower(t.to_email))),
                'transferência avisa o comprador pelo e-mail informado');
select tests.ok(exists (select 1 from public.notifications n join public.transfer_requests t on t.id::text = split_part(n.dedupe_key, ':', 2)
                        where n.kind = 'transfer_decided' and n.user_id = t.from_user_id), 'decisão do comprador avisa o titular');
select tests.ok(exists (select 1 from public.notifications n join public.payments p on p.id::text = split_part(n.dedupe_key, ':', 2)
                        where n.kind = 'payment_approved' and n.user_id = p.user_id), 'pagamento aprovado avisa o assinante');
select tests.ok((select count(*) = count(distinct dedupe_key) from public.notifications where kind = 'payment_approved'),
                'aviso de pagamento repetido não duplica');
select tests.ok(exists (select 1 from public.notifications where kind = 'payment_failed'), 'cobrança recusada avisa o assinante');
select tests.ok(exists (select 1 from public.notifications n join public.motorcycle_claim_requests c on c.id::text = split_part(n.dedupe_key, ':', 2)
                        where n.kind = 'claim_decided' and n.user_id = c.requested_by), 'decisão da verificação avisa o solicitante');
select tests.ok(exists (select 1 from public.notifications where kind = 'ownership_notice'), 'aviso anônimo ao titular entra na central');
select tests.ok(not exists (select 1 from public.notifications n join public.motorcycle_claim_requests c on c.id::text = split_part(n.dedupe_key, ':', 2)
                            join public.profiles p on p.id = c.requested_by
                            where n.kind = 'ownership_notice' and (n.body ilike '%' || p.full_name || '%')), 'aviso ao titular não identifica o solicitante');

-- 2. Cada um só vê os próprios avisos
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail($$select * from public.notifications$$, 'tabela fechada para o navegador');
select tests.must_fail($$insert into public.notifications (user_id, kind, title) values (auth.uid(), 'admin_notice', 'falso')$$, 'usuário não cria aviso');
select tests.must_fail($$select public.notify(auth.uid(), 'admin_notice', 'x', 'y', null)$$, 'usuário não chama o gerador');
select tests.ok((select count(*) > 0 from public.get_my_notifications()), 'titular vê os próprios avisos');
select tests.ok(public.count_my_unread_notifications() > 0, 'contador de não lidos');
reset role;
select coalesce(array_agg(id)::text, '{}') as a_ids from public.notifications where user_id = :'A' and read_at is null \gset
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select coalesce(array_agg(id)::text, '{}') as b_seen from public.get_my_notifications(100) \gset
select tests.ok(public.mark_my_notifications_read(:'a_ids'::uuid[]) = 0, 'não marca como lido aviso alheio');
reset role;
select tests.ok(not exists (select 1 from public.notifications where id = any (:'b_seen'::uuid[]) and user_id <> :'B'), 'outro usuário não vê avisos alheios');
select tests.ok((select count(*) = cardinality(:'a_ids'::uuid[]) from public.notifications where id = any (:'a_ids'::uuid[]) and read_at is null), 'avisos alheios continuam não lidos');

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.mark_my_notifications_read() as marked \gset
select tests.ok(:marked > 0 and public.count_my_unread_notifications() = 0, 'marcar todos como lidos');

-- 3. Preferências
select tests.must_fail($$select public.set_my_notification_preference('payment_failed', false, false)$$, 'aviso essencial não pode ser desligado');
select tests.must_fail($$select public.set_my_notification_preference('inventado', true, false)$$, 'tipo desconhecido recusado');
select public.set_my_notification_preference('storage_limit', false, false);
select public.set_my_notification_preference('payment_approved', true, true);
select tests.ok((select not in_app from public.get_my_notification_preferences() where kind = 'storage_limit')
                and (select email from public.get_my_notification_preferences() where kind = 'payment_approved'), 'preferências gravadas');
reset role;
select public.notify(:'A', 'storage_limit', 'Espaço quase cheio', 'teste', '/painel/plano', 'teste:silenciado');
select public.notify(:'A', 'payment_approved', 'Pagamento confirmado', 'teste', '/painel/plano', 'teste:email');
select tests.ok(not exists (select 1 from public.notifications where dedupe_key = 'teste:silenciado'), 'aviso opcional silenciado não é criado');
select tests.ok((select email_pending from public.notifications where dedupe_key = 'teste:email'), 'interesse por e-mail fica marcado para envio futuro');
select public.notify(:'A', 'payment_approved', 'Pagamento confirmado', 'repetido', '/painel/plano', 'teste:email');
select tests.ok((select count(*) = 1 from public.notifications where dedupe_key = 'teste:email'), 'chave repetida não duplica');
select public.notify(:'A', 'admin_notice', 'Link inválido', 'x', 'https://golpe.example', 'teste:link');
select tests.ok(not exists (select 1 from public.notifications where dedupe_key = 'teste:link'), 'link externo recusado sem quebrar quem chamou');

-- 4. Rotina diária e retenção
update public.notifications set read_at = now() - interval '200 days' where dedupe_key = 'teste:email';
-- Lembrete de A vencido (12 meses, base há 2 anos)
update public.maintenance_reminders set paused = false, base_date = current_date - 730
 where id = (select id from public.maintenance_reminders where owner_user_id = :'A' and every_months is not null limit 1);
set role service_role;
select public.system_generate_notifications()::text as gen \gset
reset role;
select tests.ok(exists (select 1 from public.notifications n where n.kind = 'reminder_due' and n.user_id = :'A'), 'rotina diária avisa o dono sobre lembrete vencido');
select tests.ok(not exists (select 1 from public.notifications n where n.kind = 'reminder_due' and n.user_id <> :'A'), 'lembrete não avisa outras pessoas');
select tests.ok((:'gen'::jsonb ->> 'deleted_old')::int >= 1 and not exists (select 1 from public.notifications where dedupe_key = 'teste:email'),
                'avisos lidos há mais de 180 dias são apagados');
set role service_role;
select public.system_generate_notifications()::text as gen2 \gset
reset role;
select tests.ok((:'gen2'::jsonb ->> 'created')::int = 0, 'rotina diária não repete avisos já criados');

-- 5. Aviso administrativo
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.admin_send_notice(%L, 'Manutenção programada', 'O site fica fora do ar domingo.', 'curto')$$, :'A'), 'aviso administrativo exige motivo');
select public.admin_send_notice(:'A', 'Manutenção programada', 'O site fica fora do ar domingo das 2h às 3h.', 'Comunicado de manutenção programada');
reset role;
select tests.ok(exists (select 1 from public.notifications where user_id = :'A' and kind = 'admin_notice' and title = 'Manutenção programada'), 'aviso administrativo entregue');
select tests.ok(exists (select 1 from public.audit_logs where action = 'admin_send_notice' and actor_user_id = :'D' and new_data ->> 'reason' = 'Comunicado de manutenção programada'), 'aviso administrativo auditado');
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.admin_send_notice(%L, 'Falso', 'Mensagem falsa', 'Tentativa de usuário comum')$$, :'B'), 'usuário comum não envia aviso administrativo');
reset role;
set role anon;
select tests.must_fail($$select * from public.get_my_notifications()$$, 'anônimo não lê avisos');
reset role;
\echo '=== TODOS OS TESTES DA CENTRAL DE NOTIFICAÇÕES PASSARAM ==='
