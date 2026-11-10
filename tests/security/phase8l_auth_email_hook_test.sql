-- =============================================================================
-- E-mails de login pelo Resend (Send Email Hook, ADR-065). Banco de TESTE.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set A '88888888-eeee-4eee-8eee-0000000000b1'
\echo '--- E-mails de login (Send Email Hook)'

select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (id, email, raw_user_meta_data) values (:'A', 'alice@teste.local', '{"full_name":"Alice Login"}');

-- Garante uma chave do Resend no cofre (independe da ordem dos testes).
do $$
declare sid uuid;
begin
  if (public.messaging_config() ->> 'resend_key') is null then
    sid := vault.create_secret('re_teste_hook_0000', 'resend_test');
    update public.messaging_settings set resend_key_secret_id = sid, link_base = 'https://www.motopassaporte.com.br' where id;
  end if;
end $$;

-- Ninguém além do Auth chama a função.
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select tests.must_fail($$select public.send_email_hook('{}'::jsonb)$$, 'usuário não chama a função de envio do login');
select tests.must_fail($$select * from public.auth_email_log$$, 'registro de e-mails de login fechado para usuários');
select tests.must_fail($$select * from public.admin_list_auth_emails(10)$$, 'só admin vê os e-mails de login');
reset role;
set role anon;
select tests.must_fail($$select public.send_email_hook('{}'::jsonb)$$, 'visitante não chama a função de envio do login');
reset role;
select tests.ok(has_function_privilege('supabase_auth_admin', 'public.send_email_hook(jsonb)', 'execute'),
  'o Supabase Auth pode chamar a função');

-- Confirmação de cadastro: um e-mail, link do site com token_hash (vale em qualquer aparelho).
delete from net.test_requests;
select tests.ok(public.send_email_hook(jsonb_build_object(
  'user', jsonb_build_object('email', 'alice@teste.local'),
  'email_data', jsonb_build_object('email_action_type', 'signup', 'token', '123456', 'token_hash', 'abc123hash',
                                   'redirect_to', 'https://www.motopassaporte.com.br/entrar?confirmado=1'))) = '{}'::jsonb,
  'confirmação: a função responde {} ao Auth');
select tests.ok((select count(*) = 1 from net.test_requests), 'confirmação: um envio');
select tests.ok((select url = 'https://api.resend.com/emails'
                        and body->'to'->>0 = 'alice@teste.local'
                        and body->>'subject' = 'Confirme seu e-mail no Moto Passaporte'
                        and position('https://www.motopassaporte.com.br/auth/confirmar?token_hash=abc123hash&amp;type=signup' in body->>'html') = 0
                        and position('https://www.motopassaporte.com.br/auth/confirmar?token_hash=abc123hash&type=signup' in body->>'html') > 0
                        and position('https://www.motopassaporte.com.br/auth/confirmar?token_hash=abc123hash&type=signup' in body->>'text') > 0
                        and headers->>'Authorization' like 'Bearer re_%'
                   from net.test_requests),
  'confirmação: Resend, destinatário, assunto e link /auth/confirmar');
select tests.ok((select action = 'signup' and email_hint = 'al***@teste.local' and request_id is not null
                   from public.auth_email_log order by id desc limit 1),
  'confirmação: registrado sem o e-mail completo');

-- Recuperação de senha.
delete from net.test_requests;
select public.send_email_hook(jsonb_build_object(
  'user', jsonb_build_object('email', 'alice@teste.local'),
  'email_data', jsonb_build_object('email_action_type', 'recovery', 'token', '654321', 'token_hash', 'rec456hash', 'redirect_to', '')));
select tests.ok((select body->>'subject' = 'Criar nova senha do Moto Passaporte'
                        and position('/auth/confirmar?token_hash=rec456hash&type=recovery' in body->>'html') > 0
                   from net.test_requests),
  'recuperação: assunto e link certos');

-- Troca de e-mail segura: dois envios, com os hashes trocados como o Supabase manda.
delete from net.test_requests;
select public.send_email_hook(jsonb_build_object(
  'user', jsonb_build_object('email', 'alice@teste.local', 'new_email', 'alice.nova@teste.local'),
  'email_data', jsonb_build_object('email_action_type', 'email_change', 'token', '111111', 'token_hash', 'hash_para_novo',
                                   'token_new', '222222', 'token_hash_new', 'hash_para_atual')));
select tests.ok((select count(*) = 2 from net.test_requests)
            and exists (select 1 from net.test_requests where body->'to'->>0 = 'alice@teste.local' and position('hash_para_atual' in body->>'html') > 0)
            and exists (select 1 from net.test_requests where body->'to'->>0 = 'alice.nova@teste.local' and position('hash_para_novo' in body->>'html') > 0),
  'troca de e-mail: um envio para cada endereço, com o hash certo');

-- Sem chave do Resend: erro claro ao Auth (o cadastro mostra falha em vez de fingir que enviou).
update public.messaging_settings set resend_key_secret_id = null where id;
select tests.ok((public.send_email_hook(jsonb_build_object('user', jsonb_build_object('email', 'alice@teste.local'),
  'email_data', jsonb_build_object('email_action_type', 'signup', 'token_hash', 'x'))) -> 'error' ->> 'http_code') = '500',
  'sem chave: devolve erro ao Auth');

-- Admin vê o registro, com o status do Resend.
insert into net._http_response (id, status_code, content)
  select request_id, 200, '{"id":"x"}' from public.auth_email_log where action = 'recovery' order by id desc limit 1;
insert into public.user_roles (user_id, role) values (:'A', 'admin') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select tests.ok((select count(*) >= 4 from public.admin_list_auth_emails(10))
            and exists (select 1 from public.admin_list_auth_emails(10) where action = 'recovery' and status = 'aceito')
            and not exists (select 1 from public.admin_list_auth_emails(10) where email_hint like 'alice@%'),
  'admin vê os envios do login com o status, sem o e-mail completo');
reset role;
delete from public.user_roles where user_id = :'A' and role = 'admin';
