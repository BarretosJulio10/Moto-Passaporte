-- =============================================================================
-- Moto Passaporte — Migração 0100: base
-- Objetivo: extensões, funções utilitárias e trilha de auditoria imutável.
-- Dependências: nenhuma (requer schema auth do Supabase).
-- Reversão: remover os objetos desta migração (não há dados de negócio nesta fase).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------

-- Mantém updated_at atualizado.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Normaliza placa/chassi: maiúsculas, somente letras e números.
create or replace function public.normalize_plate(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_value, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Placa brasileira: padrão antigo (ABC1234) ou Mercosul (ABC1D23).
create or replace function public.is_valid_plate(p_plate text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$', false);
$$;

-- -----------------------------------------------------------------------------
-- Auditoria (PRD 15.5 / 7.7) — somente inserção
-- -----------------------------------------------------------------------------

create table public.audit_logs (
  id              bigint generated always as identity primary key,
  actor_user_id   uuid,
  motorcycle_id   uuid,
  organization_id uuid,
  entity_type     text        not null,
  entity_id       text,
  action          text        not null,
  previous_data   jsonb,
  new_data        jsonb,
  created_at      timestamptz not null default now()
);

comment on table public.audit_logs is
  'Trilha de auditoria imutável. Inserção apenas por funções/triggers do backend. Não registrar segredos nem dados pessoais desnecessários.';

create index audit_logs_motorcycle_idx on public.audit_logs (motorcycle_id, created_at desc);
create index audit_logs_actor_idx      on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_entity_idx     on public.audit_logs (entity_type, entity_id);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
-- Leitura: política para administradores criada na migração de identidade.

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs é somente inserção: alteração e exclusão não são permitidas'
    using errcode = '42501';
end;
$$;

create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();

create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.prevent_audit_mutation();

-- Grava um evento de auditoria. Uso interno (funções do backend).
create or replace function public.write_audit(
  p_entity_type     text,
  p_entity_id       text,
  p_action          text,
  p_motorcycle_id   uuid  default null,
  p_organization_id uuid  default null,
  p_previous        jsonb default null,
  p_new             jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs
    (actor_user_id, motorcycle_id, organization_id, entity_type, entity_id, action, previous_data, new_data)
  values
    (auth.uid(), p_motorcycle_id, p_organization_id, p_entity_type, p_entity_id, p_action, p_previous, p_new);
end;
$$;

revoke execute on function public.write_audit(text, text, text, uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;

-- Trigger genérico de auditoria por linha.
-- TG_ARGV[0]: nome da coluna com o id da motocicleta ('' se não houver)
-- TG_ARGV[1]: nome da coluna com o id da organização ('' se não houver)
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_moto   uuid;
  v_org    uuid;
begin
  if tg_nargs > 0 and tg_argv[0] <> '' then
    v_moto := (v_row ->> tg_argv[0])::uuid;
  end if;
  if tg_nargs > 1 and tg_argv[1] <> '' then
    v_org := (v_row ->> tg_argv[1])::uuid;
  end if;

  insert into public.audit_logs
    (actor_user_id, motorcycle_id, organization_id, entity_type, entity_id, action, previous_data, new_data)
  values (
    auth.uid(),
    v_moto,
    v_org,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'organization_id', v_row ->> 'motorcycle_id', v_row ->> 'key'),
    lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- Bloqueia alteração/exclusão de registros históricos.
-- Exceção única: a remoção de um usuário pode zerar colunas created_by
-- (ON DELETE SET NULL) sem alterar mais nada na linha.
create or replace function public.prevent_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by')
     and new.created_by is null then
    return new;
  end if;
  raise exception 'Registro histórico não pode ser alterado ou excluído (%). Use um evento de correção.', tg_table_name
    using errcode = '42501';
end;
$$;
