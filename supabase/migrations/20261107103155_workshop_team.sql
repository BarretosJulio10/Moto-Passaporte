-- =============================================================================
-- Moto Passaporte — Migração: membros da oficina e permissões (Fase 3, PRD 6.2; item 3.6)
-- Objetivo: o responsável convida funcionários (link de uso único para o e-mail
--           convidado), define permissões proporcionais e remove membros.
--           Ninguém altera o próprio papel ou as próprias permissões. Toda ação
--           fica auditada com o usuário que a executou.
-- Permissões do membro "staff" (o responsável tem todas):
--   can_request_access     — pesquisar placa e pedir acesso a motos
--   can_register_services  — registrar serviços (passa a valer no item 3.7)
-- Dependências: organizations, workshop_access, origin_workshop.
-- Reversão: drop functions create_org_invite, revoke_org_invite, get_invite_preview,
--           accept_org_invite, get_org_members, get_org_invites, update_org_member,
--           remove_org_member, leave_organization, has_org_permission,
--           protect_org_members; recriar assert_workshop_member e
--           cancel_workshop_access_request das migrações anteriores; drop table
--           organization_invites; alter table organization_members drop column
--           can_request_access, can_register_services.
-- =============================================================================

alter table public.organization_members
  add column can_request_access    boolean not null default true,
  add column can_register_services boolean not null default true;

comment on column public.organization_members.can_request_access is
  'Funcionário pode pesquisar placa e pedir acesso. Responsável sempre pode.';
comment on column public.organization_members.can_register_services is
  'Funcionário pode registrar serviços (Fase 3, item 3.7). Responsável sempre pode.';

-- Pelo menos um responsável ativo por oficina, e membros só mudam por função.
create or replace function public.protect_org_members()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Única exceção: exclusão da conta do usuário (cascata de auth.users).
    if not exists (select 1 from auth.users where id = old.user_id) then
      return old;
    end if;
    raise exception 'Membros não são excluídos; use a remoção.' using errcode = '42501';
  end if;
  if new.organization_id <> old.organization_id or new.user_id <> old.user_id then
    raise exception 'Vínculo do membro não pode ser alterado.' using errcode = '42501';
  end if;
  if old.role = 'responsible' and old.status = 'active'
     and (new.role <> 'responsible' or new.status <> 'active')
     and not exists (
       select 1 from public.organization_members
       where organization_id = old.organization_id and id <> old.id
         and role = 'responsible' and status = 'active') then
    raise exception 'A oficina precisa de pelo menos um responsável.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_org_members() from public, anon, authenticated;

create trigger organization_members_protect
  before update or delete on public.organization_members
  for each row execute function public.protect_org_members();

create or replace function public.has_org_permission(p_organization uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    where m.organization_id = p_organization and m.user_id = auth.uid() and m.status = 'active'
      and (m.role = 'responsible'
           or (p_permission = 'request_access' and m.can_request_access)
           or (p_permission = 'register_services' and m.can_register_services))
  );
$$;
revoke execute on function public.has_org_permission(uuid, text) from public, anon;
grant  execute on function public.has_org_permission(uuid, text) to authenticated;

-- Pesquisar e pedir acesso passam a exigir a permissão "request_access".
create or replace function public.assert_workshop_member(p_organization uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_org_permission(p_organization, 'request_access') then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.cancel_workshop_access_request(p_access_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.motorcycle_workshop_access;
begin
  select * into a from public.motorcycle_workshop_access where id = p_access_id for update;
  if not found or not public.has_org_permission(a.organization_id, 'request_access') then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if a.status <> 'pending' then
    raise exception 'Só pedidos pendentes podem ser cancelados.' using errcode = 'P0001';
  end if;
  update public.motorcycle_workshop_access
     set status = 'canceled', ended_by = auth.uid(), ended_at = now(), end_reason = 'workshop'
   where id = p_access_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Convites
-- -----------------------------------------------------------------------------

create table public.organization_invites (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,
  email                 text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 160),
  can_request_access    boolean not null default true,
  can_register_services boolean not null default true,
  token_hash            text not null unique,
  invited_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null default now() + interval '7 days',
  accepted_at           timestamptz,
  accepted_by           uuid references auth.users (id) on delete set null,
  revoked_at            timestamptz,
  check (accepted_at is null or revoked_at is null)
);

comment on table public.organization_invites is
  'Convites para a equipe da oficina. O link é de uso único; só o hash do token é guardado.';

create index organization_invites_org_idx on public.organization_invites (organization_id, created_at desc);
create index organization_invites_invited_by_idx  on public.organization_invites (invited_by);
create index organization_invites_accepted_by_idx on public.organization_invites (accepted_by);
create unique index organization_invites_open_uidx on public.organization_invites (organization_id, email)
  where accepted_at is null and revoked_at is null;

create trigger organization_invites_audit
  after insert or update on public.organization_invites
  for each row execute function public.audit_row_change('', 'organization_id');

alter table public.organization_invites enable row level security;
revoke all on public.organization_invites from anon, authenticated;
-- Leitura e escrita só pelas funções abaixo.

create or replace function public.create_org_invite(
  p_organization_id       uuid,
  p_email                 text,
  p_can_request_access    boolean default true,
  p_can_register_services boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id    uuid;
  v_exp   timestamptz;
begin
  if not public.is_org_responsible(p_organization_id) or not public.is_org_active(p_organization_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 160 then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;
  if exists (
       select 1 from public.organization_members m join auth.users u on u.id = m.user_id
       where m.organization_id = p_organization_id and m.status = 'active' and lower(u.email) = v_email) then
    raise exception 'Esta pessoa já faz parte da equipe.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.organization_invites
       where organization_id = p_organization_id and accepted_at is null and revoked_at is null and expires_at > now()) >= 20 then
    raise exception 'Muitos convites em aberto. Cancele alguns antes de criar outro.' using errcode = 'P0001';
  end if;

  -- Um convite em aberto por e-mail: o anterior é cancelado.
  update public.organization_invites set revoked_at = now()
   where organization_id = p_organization_id and email = v_email and accepted_at is null and revoked_at is null;

  insert into public.organization_invites
    (organization_id, email, can_request_access, can_register_services, token_hash, invited_by)
  values
    (p_organization_id, v_email, coalesce(p_can_request_access, true), coalesce(p_can_register_services, true),
     encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid())
  returning id, expires_at into v_id, v_exp;

  -- O token só é devolvido agora; o banco guarda apenas o hash.
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_exp);
end;
$$;
revoke execute on function public.create_org_invite(uuid, text, boolean, boolean) from public, anon;
grant  execute on function public.create_org_invite(uuid, text, boolean, boolean) to authenticated;

create or replace function public.revoke_org_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.organization_invites;
begin
  select * into i from public.organization_invites where id = p_invite_id for update;
  if not found or not public.is_org_responsible(i.organization_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if i.accepted_at is not null or i.revoked_at is not null then
    raise exception 'Este convite já foi usado ou cancelado.' using errcode = 'P0001';
  end if;
  update public.organization_invites set revoked_at = now() where id = p_invite_id;
end;
$$;
revoke execute on function public.revoke_org_invite(uuid) from public, anon;
grant  execute on function public.revoke_org_invite(uuid) to authenticated;

-- Prévia do convite para quem tem o link (nome da oficina e situação).
create or replace function public.get_invite_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i public.organization_invites;
  v_name text;
  v_user_email text;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para ver o convite.' using errcode = '42501';
  end if;
  select * into i from public.organization_invites
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  select coalesce(w.business_name, o.name) into v_name
    from public.organizations o left join public.workshops w on w.organization_id = o.id
   where o.id = i.organization_id;
  select lower(email) into v_user_email from auth.users where id = auth.uid();
  return jsonb_build_object(
    'status', case
      when i.accepted_at is not null then 'accepted'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at <= now() then 'expired'
      when not public.is_org_active(i.organization_id) then 'inactive'
      else 'open' end,
    'workshop_name', v_name,
    'email_matches', v_user_email = i.email,
    -- Mostra o e-mail convidado mascarado, para a pessoa saber com qual conta entrar.
    'email_hint', left(i.email, 2) || '•••@' || split_part(i.email, '@', 2),
    'can_request_access', i.can_request_access,
    'can_register_services', i.can_register_services,
    'expires_at', i.expires_at
  );
end;
$$;
revoke execute on function public.get_invite_preview(text) from public, anon;
grant  execute on function public.get_invite_preview(text) to authenticated;

create or replace function public.accept_org_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  i       public.organization_invites;
  v_email text;
  v_member public.organization_members;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para aceitar o convite.' using errcode = '42501';
  end if;
  select * into i from public.organization_invites
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;
  if not found or i.accepted_at is not null or i.revoked_at is not null or i.expires_at <= now() then
    raise exception 'Convite inválido, expirado ou já usado.' using errcode = 'P0001';
  end if;
  if not public.is_org_active(i.organization_id) then
    raise exception 'Esta oficina não está ativa na plataforma.' using errcode = 'P0001';
  end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is distinct from i.email then
    raise exception 'Este convite foi enviado para outro e-mail. Entre com a conta do e-mail convidado.' using errcode = '42501';
  end if;

  select * into v_member from public.organization_members
   where organization_id = i.organization_id and user_id = v_uid for update;
  if found and v_member.status = 'active' then
    raise exception 'Você já faz parte desta equipe.' using errcode = 'P0001';
  elsif found then
    update public.organization_members
       set status = 'active', role = 'staff',
           can_request_access = i.can_request_access, can_register_services = i.can_register_services
     where id = v_member.id;
  else
    insert into public.organization_members (organization_id, user_id, role, can_request_access, can_register_services)
    values (i.organization_id, v_uid, 'staff', i.can_request_access, i.can_register_services);
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (v_uid, 'workshop', i.invited_by)
  on conflict do nothing;

  update public.organization_invites set accepted_at = now(), accepted_by = v_uid where id = i.id;
  return i.organization_id;
end;
$$;
revoke execute on function public.accept_org_invite(text) from public, anon;
grant  execute on function public.accept_org_invite(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Gestão da equipe
-- -----------------------------------------------------------------------------

create or replace function public.get_org_members(p_organization_id uuid)
returns table (
  id uuid, user_id uuid, full_name text, email text, role public.org_member_role,
  can_request_access boolean, can_register_services boolean, is_me boolean, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select m.id, m.user_id, p.full_name,
           -- E-mail dos colegas só para o responsável.
           case when public.is_org_responsible(p_organization_id) or m.user_id = auth.uid() then u.email::text end,
           m.role, m.can_request_access, m.can_register_services, m.user_id = auth.uid(), m.created_at
      from public.organization_members m
      left join public.profiles p on p.id = m.user_id
      left join auth.users u on u.id = m.user_id
     where m.organization_id = p_organization_id and m.status = 'active'
     order by (m.role = 'responsible') desc, p.full_name nulls last, m.created_at;
end;
$$;
revoke execute on function public.get_org_members(uuid) from public, anon;
grant  execute on function public.get_org_members(uuid) to authenticated;

create or replace function public.get_org_invites(p_organization_id uuid)
returns table (
  id uuid, email text, can_request_access boolean, can_register_services boolean,
  created_at timestamptz, expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_org_responsible(p_organization_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select i.id, i.email, i.can_request_access, i.can_register_services, i.created_at, i.expires_at
      from public.organization_invites i
     where i.organization_id = p_organization_id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
     order by i.created_at desc;
end;
$$;
revoke execute on function public.get_org_invites(uuid) from public, anon;
grant  execute on function public.get_org_invites(uuid) to authenticated;

create or replace function public.update_org_member(
  p_member_id             uuid,
  p_role                  public.org_member_role,
  p_can_request_access    boolean,
  p_can_register_services boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.organization_members;
begin
  select * into m from public.organization_members where id = p_member_id for update;
  if not found or m.status <> 'active' or not public.is_org_responsible(m.organization_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if m.user_id = auth.uid() then
    raise exception 'Você não pode alterar o próprio papel ou as próprias permissões.' using errcode = '42501';
  end if;
  update public.organization_members
     set role = p_role,
         can_request_access = coalesce(p_can_request_access, true),
         can_register_services = coalesce(p_can_register_services, true)
   where id = p_member_id;
end;
$$;
revoke execute on function public.update_org_member(uuid, public.org_member_role, boolean, boolean) from public, anon;
grant  execute on function public.update_org_member(uuid, public.org_member_role, boolean, boolean) to authenticated;

create or replace function public.remove_org_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.organization_members;
begin
  select * into m from public.organization_members where id = p_member_id for update;
  if not found or m.status <> 'active' or not public.is_org_responsible(m.organization_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if m.user_id = auth.uid() then
    raise exception 'Para sair da equipe, use "Sair da oficina".' using errcode = '42501';
  end if;
  update public.organization_members set status = 'removed' where id = p_member_id;
end;
$$;
revoke execute on function public.remove_org_member(uuid) from public, anon;
grant  execute on function public.remove_org_member(uuid) to authenticated;

create or replace function public.leave_organization(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  update public.organization_members set status = 'removed'
   where organization_id = p_organization_id and user_id = auth.uid() and status = 'active';
end;
$$;
revoke execute on function public.leave_organization(uuid) from public, anon;
grant  execute on function public.leave_organization(uuid) to authenticated;
