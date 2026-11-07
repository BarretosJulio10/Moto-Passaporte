-- =============================================================================
-- ROLLBACK de 20261107230107_chassis_encryption (v0.30.0, ADR-032). Ver docs/OPERATIONS.md §4.
-- ATENÇÃO: decifra os chassis de volta para texto aberto. Usar só em emergência.
-- Publicar antes o site anterior (o atual usa get_my_chassis/set_my_chassis).
-- Mantém a chave no Vault (apague manualmente depois, se quiser).
-- =============================================================================
begin;
drop trigger if exists motorcycle_private_encrypt on public.motorcycle_private;
alter table public.motorcycle_private drop constraint if exists motorcycle_private_no_plaintext;
update public.motorcycle_private set chassis = extensions.pgp_sym_decrypt(chassis_enc, public.chassis_key()) where chassis_enc is not null;
create or replace function public.audit_chassis_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.chassis is distinct from old.chassis then
    perform public.write_audit('motorcycle_private', new.motorcycle_id::text, 'chassis_changed', new.motorcycle_id);
  end if;
  return new;
end;
$$;
alter table public.motorcycle_private drop column if exists chassis_enc;
grant select on public.motorcycle_private to authenticated;
grant update (chassis) on public.motorcycle_private to authenticated;
drop function if exists public.set_my_chassis(uuid, text);
drop function if exists public.get_my_chassis(uuid);
drop function if exists public.moto_owner_is_me(uuid);
drop function if exists public.encrypt_chassis();
drop function if exists public.chassis_key();
commit;
