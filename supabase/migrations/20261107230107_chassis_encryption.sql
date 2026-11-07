-- =============================================================================
-- Criptografia do chassi (D-T3; KI-002; ADR-032)
-- - chassis_enc (bytea) = pgp_sym_encrypt(chassi, chave do Vault). A coluna "chassis" passa a
--   ficar sempre vazia (regra no banco): nenhum chassi em texto aberto, nem em backup.
-- - Gatilho cifra o valor recebido no cadastro (register_motorcycle não muda).
-- - Leitura e alteração só pelo titular atual: get_my_chassis / set_my_chassis. A escrita
--   direta na coluna é revogada.
-- - A chave é gerada no banco e fica no Vault; o backup não leva o Vault, então a chave deve
--   ser guardada junto com a chave do backup (OPERATIONS.md §1 e §3).
-- Rollback: supabase/rollback/<versão>_chassis_encryption.down.sql (decifra de volta para a coluna).
-- =============================================================================

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'chassis_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'chassis_key',
                                'Chave de criptografia do chassi (ADR-032). Guardar cópia junto com a chave do backup.');
  end if;
end $$;

create or replace function public.chassis_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'chassis_key' $$;
revoke execute on function public.chassis_key() from public, anon, authenticated;

alter table public.motorcycle_private add column if not exists chassis_enc bytea;

-- Migra os chassis existentes (antes do gatilho e da regra).
update public.motorcycle_private
   set chassis_enc = extensions.pgp_sym_encrypt(chassis, public.chassis_key(), 'cipher-algo=aes256'), chassis = null
 where chassis is not null;

create or replace function public.encrypt_chassis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.chassis is not null then
    if new.chassis !~ '^[A-Z0-9]{5,30}$' then
      raise exception 'Chassi inválido. Use só letras e números (5 a 30).' using errcode = '22023';
    end if;
    new.chassis_enc := extensions.pgp_sym_encrypt(new.chassis, public.chassis_key(), 'cipher-algo=aes256');
    new.chassis := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.encrypt_chassis() from public, anon, authenticated;

drop trigger if exists motorcycle_private_encrypt on public.motorcycle_private;
create trigger motorcycle_private_encrypt
  before insert or update on public.motorcycle_private
  for each row execute function public.encrypt_chassis();

alter table public.motorcycle_private drop constraint if exists motorcycle_private_no_plaintext;
alter table public.motorcycle_private add constraint motorcycle_private_no_plaintext check (chassis is null);

-- Auditoria passa a olhar o valor cifrado (sem gravar o chassi).
create or replace function public.audit_chassis_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.chassis_enc is distinct from old.chassis_enc then
    perform public.write_audit('motorcycle_private', new.motorcycle_id::text, 'chassis_changed', new.motorcycle_id);
  end if;
  return new;
end;
$$;

revoke update (chassis) on public.motorcycle_private from authenticated;
revoke select on public.motorcycle_private from authenticated, anon;

create or replace function public.get_my_chassis(p_motorcycle_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v bytea;
begin
  if public.moto_owner_is_me(p_motorcycle_id) is not true then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  select chassis_enc into v from public.motorcycle_private where motorcycle_id = p_motorcycle_id;
  return case when v is null then null else extensions.pgp_sym_decrypt(v, public.chassis_key()) end;
end;
$$;

create or replace function public.set_my_chassis(p_motorcycle_id uuid, p_chassis text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new text := nullif(public.normalize_plate(p_chassis), '');
begin
  if public.moto_owner_is_me(p_motorcycle_id) is not true then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if v_new is not distinct from public.get_my_chassis(p_motorcycle_id) then
    return; -- sem mudança, sem auditoria
  end if;
  if v_new is null then
    update public.motorcycle_private set chassis_enc = null where motorcycle_id = p_motorcycle_id;
  else
    insert into public.motorcycle_private (motorcycle_id, chassis) values (p_motorcycle_id, v_new)
    on conflict (motorcycle_id) do update set chassis_enc = excluded.chassis_enc;
  end if;
end;
$$;

create or replace function public.moto_owner_is_me(p_motorcycle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.motorcycle_ownerships
     where motorcycle_id = p_motorcycle_id and owner_user_id = auth.uid() and ended_at is null);
$$;

revoke execute on function public.moto_owner_is_me(uuid) from public, anon, authenticated;
revoke execute on function public.get_my_chassis(uuid) from public, anon;
revoke execute on function public.set_my_chassis(uuid, text) from public, anon;
grant execute on function public.get_my_chassis(uuid) to authenticated;
grant execute on function public.set_my_chassis(uuid, text) to authenticated;

comment on table public.motorcycle_private is
  'Chassi cifrado (chassis_enc, ADR-032). A coluna chassis fica sempre vazia. Acesso só do titular atual, pelas funções get_my_chassis/set_my_chassis.';
