-- =============================================================================
-- Avisos por e-mail e WhatsApp (ADR-064). Banco de TESTE.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set M '88888888-eeee-4eee-8eee-0000000000a1'
\set N '88888888-eeee-4eee-8eee-0000000000a2'
\echo '--- Avisos por e-mail e WhatsApp'

select set_config('request.jwt.claim.sub', '', false);
update public.subscription_plans set max_motorcycles = 2 where code in ('premium_mensal', 'premium_semestral', 'premium_anual');
insert into auth.users (id, email, raw_user_meta_data) values
  (:'M', 'marta@teste.local', '{"full_name":"Marta Mensagem"}'),
  (:'N', 'nina@teste.local', '{"full_name":"Nina Normal"}');

-- Segredos e configuração: só o servidor lê as chaves.
set role authenticated;
select set_config('request.jwt.claim.sub', :'M', false);
select tests.must_fail($$select public.admin_get_messaging_settings()$$, 'usuário comum não vê a configuração de envio');
select tests.must_fail($$select public.messaging_config()$$, 'usuário não lê as chaves do Resend/FZAP');
select tests.must_fail($$select * from public.messages_claim_email(10)$$, 'usuário não pega a fila de e-mails');
select tests.must_fail($$select * from public.outbound_messages$$, 'histórico de envios fechado para usuários');
reset role;

insert into public.user_roles (user_id, role) values (:'M', 'admin') on conflict do nothing;
set role authenticated;
select tests.must_fail($$select public.admin_save_messaging_settings(true, null, 'https://www.motopassaporte.com.br', null, false, null, null, 48)$$,
  'não liga e-mail sem chave do Resend');
select tests.must_fail($$select public.admin_save_messaging_settings(false, null, 'https://www.motopassaporte.com.br', 'chave-errada', false, null, null, 48)$$,
  'chave do Resend precisa começar com re_');
select tests.must_fail($$select public.admin_save_messaging_settings(false, null, 'https://www.motopassaporte.com.br', null, true, 'http://inseguro.com', 'tok123456', 48)$$,
  'FZAP só com https');
select public.admin_save_messaging_settings(true, 'Moto Passaporte <avisos@motopassaporte.com.br>', 'https://www.motopassaporte.com.br/',
  're_teste_1234567890abcd', true, 'https://fzap.exemplo.com.br/', 'tokenfzap123456', 48);
select tests.ok((public.admin_get_messaging_settings() ->> 'resend_key_hint') = 'abcd'
                and (public.admin_get_messaging_settings() ->> 'fzap_url') = 'https://fzap.exemplo.com.br'
                and (public.admin_get_messaging_settings() ->> 'link_base') = 'https://www.motopassaporte.com.br'
                and position('re_teste' in public.admin_get_messaging_settings()::text) = 0,
  'admin salva; a tela só recebe os 4 últimos caracteres');
reset role;
delete from public.user_roles where user_id = :'M' and role = 'admin';
select tests.ok((public.messaging_config() ->> 'resend_key') = 're_teste_1234567890abcd'
                and (public.messaging_config() ->> 'fzap_token') = 'tokenfzap123456', 'servidor lê as chaves do cofre');

-- Preferências: padrões por tipo.
set role authenticated;
select set_config('request.jwt.claim.sub', :'M', false);
select tests.ok((select email and whatsapp from public.get_my_notification_preferences() where kind = 'subscription_ending'),
  'fim do Premium: e-mail e WhatsApp ligados por padrão');
select tests.ok((select not email and not whatsapp from public.get_my_notification_preferences() where kind = 'reminder_due'),
  'lembretes: e-mail e WhatsApp desligados por padrão');
select tests.ok((select optional and not push from public.get_my_notification_preferences() where kind = 'limit_reached'),
  'limite de motos: opcional e sem notificação no celular');
select tests.must_fail($$select public.set_my_messaging_prefs(false, true)$$, 'WhatsApp só com celular cadastrado');
reset role;
update public.profiles set phone = '17999990001' where id = :'M';
set role authenticated;
select public.set_my_messaging_prefs(false, true);
select tests.ok((public.get_my_messaging_prefs() ->> 'whatsapp_optin')::boolean and (public.get_my_messaging_prefs() ->> 'phone_ok')::boolean,
  'com celular, liga o WhatsApp');

-- Limite de motos: aviso com o caminho para incluir mais.
select tests.ok(public.notify_motorcycle_limit() = false, 'sem moto: não avisa limite');
select public.register_motorcycle('Honda', 'CG 160', 2022, 'MSG1A11', 1000) ->> 'motorcycle_id' as m1 \gset
select public.register_motorcycle('Honda', 'Biz', 2021, 'MSG1A12', 2000) ->> 'motorcycle_id' as m2 \gset
select tests.ok(public.notify_motorcycle_limit(), 'no limite: avisa');
select public.notify_motorcycle_limit();
reset role;
select tests.ok((select count(*) from public.notifications where user_id = :'M' and kind = 'limit_reached') = 1, 'um aviso de limite por semana');
select tests.ok((select email_pending and whatsapp_pending and not push_pending and body like '%moto extra%R$ 3,90%'
                   from public.notifications where user_id = :'M' and kind = 'limit_reached'),
  'aviso de limite vai por e-mail e WhatsApp com o preço da moto extra');

-- Fila do e-mail.
select tests.ok((select count(*) from public.messages_claim_email(50) where user_id = :'M' and kind = 'limit_reached'
                    and email = 'marta@teste.local' and unsub_token is not null) = 1, 'servidor pega o e-mail pendente');
select tests.ok((select not email_pending and email_sent_at is not null from public.notifications where user_id = :'M' and kind = 'limit_reached'),
  'e-mail pego não é enviado de novo');

-- WhatsApp: número com 55 e intervalo anti-spam.
select tests.ok((select phone = '5517999990001' and not skip from public.messages_claim_whatsapp(20) where user_id = :'M' and kind = 'limit_reached'),
  'WhatsApp sai com DDI 55 e sem bloqueio');
select public.messages_report(jsonb_build_array(jsonb_build_object('notification_id', null, 'user_id', :'M', 'channel', 'whatsapp',
  'kind', 'limit_reached', 'destination', '55179****0001', 'status', 'sent')));
select public.notify(:'M', 'subscription_ending', 'Seu Premium vence em 7 dias', 'Vence logo.', '/painel/plano', 'teste:anti-spam');
select tests.ok((select skip from public.messages_claim_whatsapp(20) where user_id = :'M' and kind = 'subscription_ending'),
  'segundo WhatsApp opcional dentro de 48 h fica retido');

-- Descadastro do e-mail pelo link (sem entrar na conta).
select email_unsub_token as tok from public.profiles where id = :'M' \gset
set role anon;
select tests.ok(public.email_unsubscribe(:'tok'::uuid), 'link parar de receber funciona sem login');
reset role;
select public.notify(:'M', 'subscription_ending', 'Seu Premium vence hoje', 'Vence hoje.', '/painel/plano', 'teste:optout');
select public.notify(:'M', 'payment_failed', 'Assinatura em atraso', 'Falhou.', '/painel/plano', 'teste:essencial');
select tests.ok((select count(*) from public.messages_claim_email(50) where user_id = :'M' and kind = 'payment_failed') = 1,
  'depois de sair, o aviso essencial (cobrança) segue por e-mail');
select tests.ok(not exists (select 1 from public.notifications where user_id = :'M' and email_pending)
                and not exists (select 1 from public.notifications where user_id = :'M' and kind = 'subscription_ending' and email_sent_at is not null),
  'e os avisos opcionais não vão mais por e-mail');

-- Canais desligados: nada sai.
update public.messaging_settings set email_enabled = false, whatsapp_enabled = false where id;
select public.notify(:'N', 'subscription_ending', 'Seu Premium vence em 7 dias', 'Vence logo.', '/painel/plano', 'teste:desligado');
select tests.ok((select count(*) from public.messages_claim_email(50)) = 0 and (select count(*) from public.messages_claim_whatsapp(20)) = 0,
  'canais desligados: a fila não anda');
select tests.ok((select not whatsapp_pending from public.notifications where user_id = :'N' and dedupe_key = 'teste:desligado'),
  'sem autorização de WhatsApp, o aviso nem entra na fila do WhatsApp');
update public.messaging_settings set email_enabled = false, whatsapp_enabled = false, resend_key_secret_id = null, fzap_token_secret_id = null where id;
