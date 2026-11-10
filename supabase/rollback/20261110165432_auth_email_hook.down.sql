-- Antes: desligar o Send Email Hook no painel do Supabase (Authentication → Hooks), senão os e-mails de login param.
drop function if exists public.admin_list_auth_emails(integer);
drop function if exists public.send_email_hook(jsonb);
drop function if exists public.auth_email_html(text, text, text, text, text);
drop table if exists public.auth_email_log;
