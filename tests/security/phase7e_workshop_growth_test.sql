-- =============================================================================
-- PRD 2.1 — Fase 5 do módulo Oficina: perfil público, avaliações, agendamento público, campanhas
-- (banco de TESTE; após phase7d). Oficina do Carlos (C responsável; D funcionário sem gestão).
-- =============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '11111111-1111-1111-1111-111111111111'
\set C '33333333-3333-3333-3333-333333333333'
\set D '44444444-4444-4444-4444-444444444444'

\echo '--- PRD 2.1 Fase 5: crescimento comercial'
select set_config('request.jwt.claim.sub', '', false);
select organization_id as org_c from public.workshops where public_slug = 'oficina-do-carlos' \gset
select organization_id as org_a from public.workshops where public_slug = 'oficina-da-ana' \gset
select o.id as os, o.customer_id as cust from public.workshop_service_orders o
 where o.organization_id = :'org_c' and o.final_total_cents is not null order by o.number limit 1 \gset

-- ===== Perfil público avançado
select tests.must_fail($$update public.workshops set weekly_hours = '{"1":["18:00","08:00"]}' where public_slug = 'oficina-do-carlos'$$,
                       'horário com fechamento antes da abertura é recusado');
select tests.must_fail($$update public.workshops set booking_enabled = true, weekly_hours = null where public_slug = 'oficina-do-carlos'$$,
                       'agendamento público exige horário estruturado');
update public.workshops set weekly_hours = '{"0":["08:00","18:00"],"1":["08:00","18:00"],"2":["08:00","18:00"],"3":["08:00","18:00"],"4":["08:00","18:00"],"5":["08:00","18:00"],"6":["08:00","18:00"]}',
       booking_enabled = true, booking_capacity = 1, booking_slot_minutes = 60, booking_min_hours = 0, booking_days_ahead = 30,
       brands_served = '{Honda,Yamaha}', show_prices = true
 where public_slug = 'oficina-do-carlos';

-- Fotos do perfil: só o responsável registra; leitura pública só desses arquivos.
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
insert into storage.objects (bucket_id, name, metadata)
values ('workshop-files', :'org_c' || '/aaaaaaaa-0000-4000-8000-000000000002.jpg', '{"mimetype":"image/jpeg","size":2048}');
select tests.must_fail(format($$select public.workshop_register_public_photo(%L, %L, 'photo')$$, :'org_c', :'org_c' || '/aaaaaaaa-0000-4000-8000-000000000002.jpg'),
                       'funcionário não muda as fotos do perfil');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
insert into storage.objects (bucket_id, name, metadata)
values ('workshop-files', :'org_c' || '/aaaaaaaa-0000-4000-8000-000000000001.jpg', '{"mimetype":"image/jpeg","size":2048}');
select public.workshop_register_public_photo(:'org_c', :'org_c' || '/aaaaaaaa-0000-4000-8000-000000000001.jpg', 'logo') as logo \gset
reset role;
select tests.ok((select logo_path from public.workshops where organization_id = :'org_c') = :'org_c' || '/aaaaaaaa-0000-4000-8000-000000000001.jpg',
                'logotipo registrado no perfil');
select coalesce((select storage_path from public.workshop_os_photos limit 1), 'x/y.jpg') as os_photo \gset
set role anon;
select tests.ok(public.is_public_workshop_file(:'org_c' || '/aaaaaaaa-0000-4000-8000-000000000001.jpg'), 'logotipo do perfil é público');
select tests.ok(not public.is_public_workshop_file(:'os_photo'),
                'foto de OS nunca é pública');
select public.get_public_workshop('oficina-do-carlos') as pub \gset
reset role;
select tests.ok(not (:'pub'::jsonb ? 'cnpj') and not (:'pub'::jsonb ? 'legal_name') and not (:'pub'::jsonb ? 'responsible_name')
                and :'pub'::jsonb -> 'brands_served' ? 'Honda' and :'pub'::jsonb -> 'booking' is not null,
                'perfil público com marcas e agendamento, sem CNPJ, razão social nem responsável');

-- ===== Agendamento público
set role anon;
select (public.get_public_booking_slots('oficina-do-carlos', current_date + 2))[1] as slot \gset
select tests.ok(:'slot' is not null, 'horários livres calculados pelo horário da oficina');
select tests.must_fail($$select public.request_public_appointment('oficina-do-carlos', current_date + 2, '07:00', 'Rui Lima', '17999990000', 'CG 160', 'Revisão', true)$$,
                       'horário fora do expediente é recusado');
select tests.must_fail(format($$select public.request_public_appointment('oficina-do-carlos', current_date + 2, %L, 'Rui Lima', '17999990000', 'CG 160', 'Revisão', false)$$, :'slot'),
                       'sem consentimento não agenda');
select public.request_public_appointment('oficina-do-carlos', current_date + 2, :'slot', 'Rui Lima', '(17) 99999-0000', 'CG 160', 'Revisão geral', true) as req \gset
select tests.ok(not (:'slot' = any (public.get_public_booking_slots('oficina-do-carlos', current_date + 2))), 'horário ocupado sai da lista');
select tests.must_fail(format($$select public.request_public_appointment('oficina-do-carlos', current_date + 2, %L, 'Outro', '17988880000', null, 'Freio', true)$$, :'slot'),
                       'mesmo horário não aceita dois pedidos além da capacidade');
select tests.must_fail($$select public.request_public_appointment('oficina-da-ana', current_date + 2, '09:00', 'Rui', '17999990000', null, 'Revisão', true)$$,
                       'oficina sem agendamento público recusa o pedido');
reset role;
select tests.ok((select count(*) = 1 from public.workshop_appointments where organization_id = :'org_c' and source = 'publico'
                   and status = 'requested' and contact_phone = '17999990000' and consent_at is not null), 'pedido entra na agenda como solicitado');
select tests.ok((select count(*) >= 1 from public.notifications where kind = 'appointment_requested' and user_id = :'C'), 'equipe é avisada do pedido');

-- ===== Avaliações: só pelo comprovante da OS concluída
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_create_order_link(:'org_c', :'os', 'receipt') ->> 'token' as tok \gset
select public.workshop_create_order_link(:'org_c', :'os', 'entry_ack') ->> 'token' as tok_in \gset
reset role;
set role anon;
select tests.ok((public.get_service_order_by_token(:'tok') -> 'review' ->> 'done')::boolean = false, 'comprovante oferece a avaliação');
select tests.must_fail(format($$select public.submit_workshop_review(%L, 5, 'Ótimo', 'Ana', true)$$, :'tok_in'), 'link de ciência da entrada não avalia');
select tests.must_fail(format($$select public.submit_workshop_review(%L, 6, null, 'Ana', true)$$, :'tok'), 'nota fora de 1 a 5 é recusada');
select tests.must_fail(format($$select public.submit_workshop_review(%L, 5, null, 'Ana', false)$$, :'tok'), 'sem autorizar a publicação não avalia');
select public.submit_workshop_review(:'tok', 4, 'Serviço bem feito, só atrasou um pouco.', 'joão carlos da silva', true) as rv \gset
select tests.ok(:'rv'::jsonb ->> 'display_name' = 'João S.', 'nome público vira primeiro nome e inicial');
select tests.must_fail(format($$select public.submit_workshop_review(%L, 1, 'De novo', 'X', true)$$, :'tok'), 'uma avaliação por OS');
reset role;
select id as review from public.workshop_reviews where order_id = :'os' \gset
select tests.must_fail(format($$update public.workshop_reviews set rating = 5 where id = %L$$, :'review'), 'nota não muda nem pelo banco');
select tests.must_fail(format($$delete from public.workshop_reviews where id = %L$$, :'review'), 'avaliação não é apagada');

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_reply_review(%L, %L, 'Obrigado')$$, :'org_c', :'review'), 'funcionário sem atendimento não responde');
select tests.must_fail(format($$select public.workshop_report_review(%L, %L, 'Não é nosso cliente de verdade')$$, :'org_c', :'review'), 'só o responsável denuncia');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_reply_review(%L, %L, 'Oi')$$, :'org_c', :'review'), 'outra oficina não responde');
select tests.ok(jsonb_array_length(public.workshop_list_reviews(:'org_a') -> 'reviews') = 0, 'outra oficina não vê as avaliações');
select tests.must_fail($$select public.admin_list_reviews()$$, 'quem não é admin não modera');
reset role;
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_reply_review(:'org_c', :'review', 'Obrigado! Vamos melhorar o prazo.');
select public.workshop_report_review(:'org_c', :'review', 'Teste de denúncia de avaliação.');
reset role;
set role anon;
select tests.ok((public.get_public_workshop('oficina-do-carlos') -> 'rating' ->> 'count')::int = 1
                and public.get_public_workshop('oficina-do-carlos') -> 'reviews' -> 0 ->> 'reply' like 'Obrigado%',
                'denúncia não esconde: avaliação e resposta seguem públicas até a moderação');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
insert into public.user_roles (user_id, role) values (:'A', 'admin') on conflict do nothing;
set role authenticated;
select tests.ok(jsonb_array_length(public.admin_list_reviews()) = 1, 'moderação vê a denúncia');
select public.admin_moderate_review(:'review', 'hide', 'Teste de moderação da avaliação.');
reset role;
delete from public.user_roles where user_id = :'A' and role = 'admin';
set role anon;
select tests.ok((public.get_public_workshop('oficina-do-carlos') -> 'rating' ->> 'count')::int = 0, 'avaliação ocultada sai do perfil');
reset role;

-- ===== Campanhas e opção de não receber
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.workshop_save_campaign(:'org_c', null, '{"name":"Revisão de verão","audience":"all","message":"Olá {nome}, que tal uma revisão antes das férias?"}') as camp \gset
select (public.workshop_campaign_recipients(:'org_c', :'camp') -> 'recipients' -> 0 ->> 'customer_id') as rcpt \gset
select public.workshop_log_contact(:'org_c', :'rcpt', 'campaign', :'camp');
select tests.ok((select (r ->> 'contacted_at') is not null from jsonb_array_elements(public.workshop_campaign_recipients(:'org_c', :'camp') -> 'recipients') r
                  where r ->> 'customer_id' = :'rcpt'), 'contato da campanha fica marcado');
select public.workshop_set_marketing_opt_out(:'org_c', :'rcpt', true);
select tests.ok(not exists (select 1 from jsonb_array_elements(public.workshop_campaign_recipients(:'org_c', :'camp') -> 'recipients') r
                             where r ->> 'customer_id' = :'rcpt'), 'quem pediu para sair some do público');
select tests.must_fail(format($$select public.workshop_log_contact(%L, %L, 'campaign', %L)$$, :'org_c', :'rcpt', :'camp'), 'não registra campanha para quem saiu');
select public.workshop_close_campaign(:'org_c', :'camp');
select public.workshop_set_marketing_opt_out(:'org_c', :'rcpt', false);
select tests.must_fail(format($$select public.workshop_log_contact(%L, %L, 'campaign', %L)$$, :'org_c', :'rcpt', :'camp'), 'campanha encerrada não recebe contatos');
reset role;
select tests.ok((select delivery_status = 'prepared' from public.workshop_contact_log where reason = 'campaign' limit 1),
                'contato registrado como mensagem preparada (sem envio automático)');
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.must_fail(format($$select public.workshop_save_campaign(%L, null, '{"name":"X","audience":"all","message":"Mensagem de teste"}')$$, :'org_c'),
                       'funcionário sem atendimento não cria campanha');
reset role;

\o
\echo '=== TODOS OS TESTES DA FASE 5 DO MÓDULO OFICINA PASSARAM ==='
