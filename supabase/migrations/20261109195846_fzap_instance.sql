-- ADR-064 (complemento): o painel cria a instância na FZAP com o token de administrador
-- (usado só na hora, nunca guardado) e grava apenas o token da instância no Vault.
alter table public.messaging_settings add column fzap_instance_id text check (fzap_instance_id is null or char_length(fzap_instance_id) <= 80);

create or replace function public.messaging_set_fzap_instance(p_token text, p_instance_id text, p_actor uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_.-]{16,200}$' then
    raise exception 'Token da instância inválido.' using errcode = '22023';
  end if;
  update public.messaging_settings set
    fzap_token_secret_id = public.upsert_vault_secret('fzap_token', p_token),
    fzap_token_hint = right(p_token, 4),
    fzap_instance_id = left(p_instance_id, 80),
    updated_at = now(), updated_by = p_actor
  where id;
  perform public.write_audit('messaging_settings', 'messaging', 'fzap_instance_created', null, null, null,
    jsonb_build_object('instance_id', left(p_instance_id, 80), 'by', p_actor));
end;
$$;
revoke execute on function public.messaging_set_fzap_instance(text, text, uuid) from public, anon, authenticated;
grant execute on function public.messaging_set_fzap_instance(text, text, uuid) to service_role;
