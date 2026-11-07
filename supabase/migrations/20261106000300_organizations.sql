-- =============================================================================
-- Moto Passaporte — Migração 0300: organizações e oficinas
-- Objetivo: tenants (oficinas), membros e perfil da oficina (PRD 2.1, 6.1, 6.2).
--           Gestão de membros e autorizações de acesso a motos ficam na Fase 3.
-- Dependências: 0100_base, 0200_identity.
-- Reversão: remover tabelas, tipos e funções desta migração.
-- =============================================================================

create type public.organization_type   as enum ('workshop');
create type public.organization_status as enum ('active', 'suspended', 'blocked');
create type public.org_member_role     as enum ('responsible', 'staff');
create type public.org_member_status   as enum ('active', 'removed');
create type public.workshop_verification as enum ('unverified', 'verified', 'rejected');

-- -----------------------------------------------------------------------------
-- Organizações (tenant)
-- -----------------------------------------------------------------------------

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  type       public.organization_type not null,
  name       text not null check (char_length(name) between 2 and 120),
  status     public.organization_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger organizations_audit
  after insert or update or delete on public.organizations
  for each row execute function public.audit_row_change('', 'id');

-- -----------------------------------------------------------------------------
-- Membros
-- -----------------------------------------------------------------------------

create table public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            public.org_member_role   not null default 'staff',
  status          public.org_member_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_idx on public.organization_members (user_id) where status = 'active';

create trigger organization_members_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();

create trigger organization_members_audit
  after insert or update or delete on public.organization_members
  for each row execute function public.audit_row_change('', 'organization_id');

-- -----------------------------------------------------------------------------
-- Funções de verificação de organização
-- -----------------------------------------------------------------------------

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_org and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_org_responsible(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_org and user_id = auth.uid()
      and status = 'active' and role = 'responsible'
  );
$$;

create or replace function public.is_org_active(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.organizations where id = p_org and status = 'active');
$$;

revoke execute on function public.is_org_member(uuid)      from public, anon;
revoke execute on function public.is_org_responsible(uuid) from public, anon;
grant  execute on function public.is_org_member(uuid)      to authenticated;
grant  execute on function public.is_org_responsible(uuid) to authenticated;
grant  execute on function public.is_org_active(uuid)      to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Perfil da oficina
-- -----------------------------------------------------------------------------

create table public.workshops (
  organization_id     uuid primary key references public.organizations (id) on delete restrict,
  business_name       text not null check (char_length(business_name) between 2 and 120),
  legal_name          text check (legal_name is null or char_length(legal_name) <= 160),
  cnpj                text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  responsible_name    text check (responsible_name is null or char_length(responsible_name) <= 120),
  email               text check (email is null or char_length(email) <= 160),
  phone               text check (phone is null or char_length(phone) <= 20),
  whatsapp            text check (whatsapp is null or char_length(whatsapp) <= 20),
  address             text check (address is null or char_length(address) <= 200),
  city                text check (city is null or char_length(city) <= 80),
  state               text check (state is null or state ~ '^[A-Z]{2}$'),
  specialties         text[] not null default '{}',
  description         text check (description is null or char_length(description) <= 2000),
  logo_url            text check (logo_url is null or char_length(logo_url) <= 500),
  opening_hours       text check (opening_hours is null or char_length(opening_hours) <= 300),
  public_slug         text not null unique
                      check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(public_slug) between 3 and 60),
  is_public           boolean not null default true,
  verification_status public.workshop_verification not null default 'unverified',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column public.workshops.verification_status is
  'Indica verificação cadastral. NÃO representa certificação técnica (PRD 6.7).';

create trigger workshops_updated_at
  before update on public.workshops
  for each row execute function public.set_updated_at();

create trigger workshops_audit
  after insert or update or delete on public.workshops
  for each row execute function public.audit_row_change('', 'organization_id');

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.workshops            enable row level security;

revoke all on public.organizations        from anon, authenticated;
revoke all on public.organization_members from anon, authenticated;
revoke all on public.workshops            from anon, authenticated;

grant select on public.organizations        to authenticated;
grant select on public.organization_members to authenticated;
grant select on public.workshops            to anon, authenticated;
-- O responsável edita o perfil; status de verificação só pela administração.
grant update (business_name, legal_name, cnpj, responsible_name, email, phone, whatsapp,
              address, city, state, specialties, description, logo_url, opening_hours,
              public_slug, is_public)
  on public.workshops to authenticated;

create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id) or public.is_admin());

create policy organization_members_select on public.organization_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_responsible(organization_id) or public.is_admin());

create policy workshops_select_public on public.workshops
  for select to anon
  using (is_public and public.is_org_active(organization_id));

create policy workshops_select_auth on public.workshops
  for select to authenticated
  using (
    (is_public and public.is_org_active(organization_id))
    or public.is_org_member(organization_id)
    or public.is_admin()
  );

create policy workshops_update_responsible on public.workshops
  for update to authenticated
  using (public.is_org_responsible(organization_id))
  with check (public.is_org_responsible(organization_id));

-- -----------------------------------------------------------------------------
-- Cadastro gratuito de oficina (operação controlada)
-- -----------------------------------------------------------------------------

create or replace function public.create_workshop(
  p_business_name text,
  p_public_slug   text,
  p_city          text default null,
  p_state         text default null,
  p_phone         text default null,
  p_whatsapp      text default null,
  p_email         text default null,
  p_cnpj          text default null,
  p_legal_name    text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_count int;
  v_cnpj  text := nullif(regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g'), '');
begin
  if v_uid is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  -- Proteção contra abuso: no máximo 3 oficinas criadas por usuário.
  select count(*) into v_count from public.organizations where created_by = v_uid;
  if v_count >= 3 then
    raise exception 'Limite de oficinas cadastradas por usuário atingido.' using errcode = 'P0001';
  end if;

  insert into public.organizations (type, name, created_by)
  values ('workshop', trim(p_business_name), v_uid)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_uid, 'responsible');

  insert into public.workshops
    (organization_id, business_name, legal_name, cnpj, email, phone, whatsapp, city, state, public_slug)
  values
    (v_org, trim(p_business_name), p_legal_name, v_cnpj, p_email, p_phone, p_whatsapp,
     p_city, upper(p_state), lower(p_public_slug));

  insert into public.user_roles (user_id, role, granted_by)
  values (v_uid, 'workshop', v_uid)
  on conflict (user_id, role) do nothing;

  return v_org;
end;
$$;

revoke execute on function public.create_workshop(text, text, text, text, text, text, text, text, text) from public, anon;
grant  execute on function public.create_workshop(text, text, text, text, text, text, text, text, text) to authenticated;
