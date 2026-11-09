-- Painel: devolve o nome da instância da FZAP (ADR-064).
create or replace function public.admin_get_messaging_settings()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare s public.messaging_settings;
begin
  if not public.is_admin() then raise exception 'Operação não permitida.' using errcode = '42501'; end if;
  select * into s from public.messaging_settings where id;
  return jsonb_build_object(
    'email_enabled', s.email_enabled, 'email_from', s.email_from, 'link_base', s.link_base,
    'resend_key_configured', s.resend_key_secret_id is not null, 'resend_key_hint', s.resend_key_hint,
    'whatsapp_enabled', s.whatsapp_enabled, 'fzap_url', s.fzap_url,
    'fzap_token_configured', s.fzap_token_secret_id is not null, 'fzap_token_hint', s.fzap_token_hint,
    'fzap_instance_id', s.fzap_instance_id,
    'whatsapp_cooldown_hours', s.whatsapp_cooldown_hours,
    'updated_at', s.updated_at, 'updated_by_name', (select full_name from public.profiles where id = s.updated_by),
    'last_24h', (select coalesce(jsonb_object_agg(k, c), '{}'::jsonb)
                   from (select channel || ':' || status as k, count(*) as c from public.outbound_messages
                          where created_at > now() - interval '24 hours' group by 1) t),
    'pending', jsonb_build_object(
      'email', (select count(*) from public.notifications where email_pending),
      'whatsapp', (select count(*) from public.notifications where whatsapp_pending)));
end;
$$;
