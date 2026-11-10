-- E-mails de login (confirmação, recuperação de senha…) pelo Resend via "Send Email Hook" (ADR-065).
-- O SMTP do Supabase aceitava os envios mas eles não chegavam; a API do Resend entrega.
-- O link aponta para o site (/auth/confirmar?token_hash=…), que confirma com verifyOtp:
-- funciona em qualquer aparelho (o fluxo PKCE antigo exigia o mesmo navegador).

create table if not exists public.auth_email_log (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  action      text not null,
  email_hint  text not null,
  request_id  bigint
);
alter table public.auth_email_log enable row level security;
revoke all on table public.auth_email_log from public, anon, authenticated;
create index if not exists auth_email_log_created_idx on public.auth_email_log (created_at desc);

create or replace function public.auth_email_html(p_title text, p_body text, p_button text, p_url text, p_code text)
returns text language sql immutable set search_path = ''
as $$
  select '<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#1c1b19">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 0"><tr><td align="center">'
    || '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e3ddd0;border-radius:10px">'
    || '<tr><td style="padding:20px 28px;border-bottom:1px solid #e3ddd0;font-weight:bold;font-size:16px">Moto Passaporte</td></tr>'
    || '<tr><td style="padding:28px"><h1 style="margin:0 0 14px;font-size:22px;line-height:1.3">' || p_title || '</h1>'
    || '<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#3d3a35">' || p_body || '</p>'
    || case when p_url is not null then
         '<p style="margin:22px 0 6px"><a href="' || p_url || '" style="display:inline-block;background:#1c1b19;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">' || p_button || '</a></p>'
         || '<p style="margin:10px 0 0;font-size:12px;color:#7a756b;word-break:break-all">Se o botão não abrir, copie: ' || p_url || '</p>'
       else '' end
    || case when p_code is not null and p_code <> '' then
         '<p style="margin:18px 0 0;font-size:14px;color:#3d3a35">Código: <strong style="font-size:20px;letter-spacing:3px">' || p_code || '</strong></p>'
       else '' end
    || '</td></tr><tr><td style="padding:16px 28px;border-top:1px solid #e3ddd0;font-size:12px;color:#7a756b;line-height:1.5">'
    || 'Se você não pediu isto, ignore este e-mail. Nunca pedimos senha, código ou dados de cartão por e-mail.'
    || '</td></tr></table></td></tr></table></body></html>';
$$;

create or replace function public.send_email_hook(event jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  cfg       jsonb := public.messaging_config();
  act       text := event->'email_data'->>'email_action_type';
  base      text := rtrim(coalesce(cfg->>'link_base', 'https://www.motopassaporte.com.br'), '/');
  msgs      jsonb := '[]'::jsonb;
  m         jsonb;
  url       text;
  title     text; body text; btn text; subj text; code text;
  req       bigint;
begin
  if coalesce(cfg->>'resend_key', '') = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 500, 'message', 'Envio de e-mail não configurado.'));
  end if;

  -- Troca de e-mail segura: token_hash_new vai para o e-mail atual e token_hash para o novo (nomes históricos do Supabase).
  if act = 'email_change' and coalesce(event->'email_data'->>'token_hash_new', '') <> '' then
    msgs := jsonb_build_array(
      jsonb_build_object('to', event->'user'->>'email', 'hash', event->'email_data'->>'token_hash_new', 'code', event->'email_data'->>'token'),
      jsonb_build_object('to', event->'user'->>'new_email', 'hash', event->'email_data'->>'token_hash', 'code', event->'email_data'->>'token_new'));
  elsif act = 'email_change' then
    msgs := jsonb_build_array(jsonb_build_object('to', coalesce(nullif(event->'user'->>'new_email', ''), event->'user'->>'email'),
      'hash', event->'email_data'->>'token_hash', 'code', coalesce(nullif(event->'email_data'->>'token_new', ''), event->'email_data'->>'token')));
  else
    msgs := jsonb_build_array(jsonb_build_object('to', event->'user'->>'email', 'hash', event->'email_data'->>'token_hash', 'code', event->'email_data'->>'token'));
  end if;

  for m in select * from jsonb_array_elements(msgs) loop
    continue when coalesce(m->>'to', '') = '';
    url := case when act = 'reauthentication' then null
           else base || '/auth/confirmar?token_hash=' || (m->>'hash') || '&type=' || act end;
    code := null;
    case act
      when 'signup' then
        subj := 'Confirme seu e-mail no Moto Passaporte'; title := 'Confirme seu e-mail';
        body := 'Falta só um passo para ativar sua conta: toque no botão abaixo para confirmar este e-mail.'; btn := 'Confirmar e-mail';
      when 'recovery' then
        subj := 'Criar nova senha do Moto Passaporte'; title := 'Crie uma nova senha';
        body := 'Recebemos um pedido para trocar a senha da sua conta. Toque no botão abaixo para escolher uma nova senha. O link vale por 1 hora.'; btn := 'Criar nova senha';
      when 'email_change' then
        subj := 'Confirme a troca de e-mail'; title := 'Confirme a troca de e-mail';
        body := 'Toque no botão abaixo para confirmar a troca do e-mail da sua conta.'; btn := 'Confirmar troca';
      when 'invite' then
        subj := 'Você foi convidado para o Moto Passaporte'; title := 'Você recebeu um convite';
        body := 'Toque no botão abaixo para aceitar o convite e criar sua senha.'; btn := 'Aceitar convite';
      when 'reauthentication' then
        subj := 'Seu código de confirmação'; title := 'Código de confirmação';
        body := 'Use o código abaixo para confirmar a operação.'; btn := null; code := m->>'code';
      else
        subj := 'Seu link de acesso ao Moto Passaporte'; title := 'Entrar no Moto Passaporte';
        body := 'Toque no botão abaixo para entrar na sua conta.'; btn := 'Entrar';
    end case;

    req := net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || (cfg->>'resend_key'), 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', coalesce(nullif(cfg->>'email_from', ''), 'Moto Passaporte <nao-responda@motopassaporte.com.br>'),
        'to', jsonb_build_array(m->>'to'),
        'subject', subj,
        'html', public.auth_email_html(title, body, btn, url, code),
        'text', title || E'\n\n' || body || coalesce(E'\n\n' || url, '') || coalesce(E'\n\nCódigo: ' || code, '')
               || E'\n\nSe você não pediu isto, ignore este e-mail.'),
      timeout_milliseconds := 15000);

    insert into public.auth_email_log (action, email_hint, request_id)
    values (act, left(m->>'to', 2) || '***@' || split_part(m->>'to', '@', 2), req);
  end loop;

  delete from public.auth_email_log where created_at < now() - interval '30 days';
  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
revoke execute on function public.send_email_hook(jsonb) from public, anon, authenticated;
grant execute on function public.send_email_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.auth_email_html(text, text, text, text, text) from public, anon, authenticated;

-- Painel: últimos e-mails de login, com a resposta do Resend enquanto ela existir (o pg_net guarda ~6 h).
create or replace function public.admin_list_auth_emails(p_limit integer default 30)
returns table (created_at timestamptz, action text, email_hint text, status text, detail text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Operação não permitida.' using errcode = '42501'; end if;
  return query
    select l.created_at, l.action, l.email_hint,
           case when r.id is null then 'enviado'
                when r.status_code between 200 and 299 then 'aceito'
                else 'recusado' end,
           case when r.status_code is not null and r.status_code not between 200 and 299
                then left(coalesce(r.content, r.error_msg, ''), 200) end
      from public.auth_email_log l
      left join net._http_response r on r.id = l.request_id
     order by l.created_at desc
     limit least(greatest(p_limit, 1), 100);
end;
$$;
revoke execute on function public.admin_list_auth_emails(integer) from public, anon;
grant execute on function public.admin_list_auth_emails(integer) to authenticated;
