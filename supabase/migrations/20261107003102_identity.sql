-- =============================================================================
-- Moto Passaporte — Migração 0200: identidade, papéis e configurações
-- Objetivo: perfis, papéis globais, criação automática no cadastro,
--           funções de verificação de papel e configurações do sistema.
-- Dependências: 0100_base.
-- Reversão: remover trigger em auth.users, tabelas e funções desta migração.
-- =============================================================================

create type public.app_role as enum ('owner', 'workshop', 'admin');

-- -----------------------------------------------------------------------------
-- Perfis
-- -----------------------------------------------------------------------------

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text not null default '' check (char_length(full_name) <= 120),
  email               text,
  phone               text check (phone is null or char_length(phone) <= 20),
  avatar_url          text check (avatar_url is null or char_length(avatar_url) <= 500),
  terms_accepted_at   timestamptz,
  terms_version       text,
  privacy_accepted_at timestamptz,
  privacy_version     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.profiles is 'Dados pessoais básicos. Separados dos dados históricos da motocicleta (LGPD).';

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- O usuário só altera estes campos. E-mail vem do Auth; aceites, do cadastro.
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- Papéis globais (PRD 2.3) — concedidos somente pelo backend
-- -----------------------------------------------------------------------------

create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index user_roles_user_idx on public.user_roles (user_id);

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
-- Sem permissão de insert/update/delete para usuários:
-- o papel admin só pode ser concedido via service role / SQL interno.

create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change('', '');

-- -----------------------------------------------------------------------------
-- Funções de verificação (usadas nas políticas RLS)
-- -----------------------------------------------------------------------------

create or replace function public.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = p_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin');
$$;

revoke execute on function public.has_role(public.app_role) from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Políticas
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (public.is_admin());

grant select on public.audit_logs to authenticated;

-- -----------------------------------------------------------------------------
-- Criação automática de perfil e papel 'owner' no cadastro
-- Metadados esperados no signUp: full_name, terms_accepted, terms_version,
-- privacy_version.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta     jsonb   := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_accepted boolean := coalesce(v_meta ->> 'terms_accepted', '') = 'true';
begin
  insert into public.profiles
    (id, full_name, email, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version)
  values (
    new.id,
    left(coalesce(v_meta ->> 'full_name', ''), 120),
    new.email,
    case when v_accepted then now() end,
    case when v_accepted then left(v_meta ->> 'terms_version', 20) end,
    case when v_accepted then now() end,
    case when v_accepted then left(v_meta ->> 'privacy_version', 20) end
  );

  insert into public.user_roles (user_id, role) values (new.id, 'owner');
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém o e-mail do perfil em sincronia com o Auth.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Configurações do sistema (PRD 7.8) — sem segredos
-- -----------------------------------------------------------------------------

create table public.system_settings (
  key         text primary key check (key ~ '^[a-z0-9_]+$'),
  value       jsonb not null,
  description text,
  is_public   boolean not null default false,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);

comment on table public.system_settings is
  'Parâmetros operacionais configuráveis. NUNCA armazenar segredos ou tokens aqui.';

create or replace function public.set_settings_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger system_settings_updated_by
  before insert or update on public.system_settings
  for each row execute function public.set_settings_updated_by();

create trigger system_settings_audit
  after insert or update or delete on public.system_settings
  for each row execute function public.audit_row_change('', '');

alter table public.system_settings enable row level security;
revoke all on public.system_settings from anon, authenticated;
grant select on public.system_settings to anon, authenticated;
grant insert, update on public.system_settings to authenticated;

create policy system_settings_select_public on public.system_settings
  for select to anon
  using (is_public);

create policy system_settings_select_auth on public.system_settings
  for select to authenticated
  using (is_public or public.is_admin());

create policy system_settings_insert_admin on public.system_settings
  for insert to authenticated
  with check (public.is_admin());

create policy system_settings_update_admin on public.system_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.system_settings (key, value, description, is_public) values
  ('free_plan_max_motorcycles', '1',
   'Quantidade máxima de motocicletas no plano gratuito (ADR-006).', true),
  ('registration_rate_limit_per_hour', '10',
   'Máximo de tentativas de cadastro de motocicleta por usuário por hora.', false);
