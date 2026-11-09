-- =============================================================================
-- Conta da pista (PRD 2.5, ADR-058)
-- O responsável cria o mecânico com nome, apelido e senha, sem convite.
-- A conta só usa o App da Pista: a trava vale para toda chamada à API
-- (pré-requisição do PostgREST) e para o envio de arquivos.
-- Login: e-mail interno <apelido>.<código>@pista.motopassaporte.com.br,
-- criado pela Edge Function pista-accounts (service role).
-- =============================================================================

-- Código curto da oficina, usado no link e na tela de entrada da pista.
create or replace function public.pista_new_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alpha constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_code text;
begin
  loop
    select string_agg(substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.organizations where pista_code = v_code);
  end loop;
  return v_code;
end;
$$;
revoke execute on function public.pista_new_code() from public, anon, authenticated;

alter table public.organizations add column if not exists pista_code text;
update public.organizations set pista_code = public.pista_new_code() where pista_code is null;
alter table public.organizations alter column pista_code set not null;
alter table public.organizations add constraint organizations_pista_code_format check (pista_code ~ '^[a-z0-9]{6}$');
create unique index if not exists organizations_pista_code_key on public.organizations (pista_code);

create or replace function public.organizations_pista_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pista_code is null then
    new.pista_code := public.pista_new_code();
  end if;
  return new;
end;
$$;
revoke execute on function public.organizations_pista_code() from public, anon, authenticated;
drop trigger if exists organizations_pista_code on public.organizations;
create trigger organizations_pista_code before insert on public.organizations
  for each row execute function public.organizations_pista_code();

-- Contas da pista
create table public.pista_accounts (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  nickname        text not null check (nickname ~ '^[a-z0-9]{2,20}$'),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  disabled_at     timestamptz,
  unique (organization_id, nickname)
);
comment on table public.pista_accounts is
  'Contas criadas pelo responsável da oficina que só usam o App da Pista (ADR-058).';
alter table public.pista_accounts enable row level security;
revoke all on public.pista_accounts from public, anon, authenticated;

create trigger pista_accounts_audit
  after insert or update or delete on public.pista_accounts
  for each row execute function public.audit_row_change('', 'organization_id');

create or replace function public.is_pista_account(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.pista_accounts where user_id = p_user);
$$;
revoke execute on function public.is_pista_account(uuid) from public, anon;
grant execute on function public.is_pista_account(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Trava geral: conta da pista só chama funções pista_*.
-- Roda antes de toda requisição do PostgREST. Erro inesperado aqui nunca derruba
-- a API para as outras contas (só a recusa explícita é levantada).
-- -----------------------------------------------------------------------------
create or replace function public.pista_request_guard()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_found boolean := false;
  v_disabled timestamptz;
  v_path text;
begin
  begin
    v_uid := auth.uid();
    if v_uid is null then
      return;
    end if;
    select true, a.disabled_at into v_found, v_disabled from public.pista_accounts a where a.user_id = v_uid;
    v_path := coalesce(current_setting('request.path', true), '');
  exception when others then
    return;
  end;
  if not coalesce(v_found, false) then
    return;
  end if;
  if v_disabled is not null then
    raise exception 'Esta conta foi desligada pela oficina.' using errcode = '42501';
  end if;
  if v_path ~ '^/rpc/pista_[a-z_]+$' then
    return;
  end if;
  raise exception 'Esta conta só usa o App da Pista.' using errcode = '42501';
end;
$$;
revoke execute on function public.pista_request_guard() from public;
grant execute on function public.pista_request_guard() to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.pista_request_guard''';
  end if;
end;
$$;
notify pgrst, 'reload config';

-- Envio de arquivos: conta da pista só no bucket da oficina.
drop policy if exists pista_accounts_only_workshop_files on storage.objects;
create policy pista_accounts_only_workshop_files on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id = 'workshop-files' or not public.is_pista_account());

-- Sem Premium de boas-vindas para conta da pista.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.profiles_welcome_premium()'::regprocedure);
  if position('perform public.grant_welcome_premium(new.id);' in v_def) = 0 then
    raise exception 'profiles_welcome_premium mudou; revisar o patch';
  end if;
  v_def := replace(v_def, 'perform public.grant_welcome_premium(new.id);',
    'if coalesce((select u.raw_app_meta_data ->> ''account_kind'' from auth.users u where u.id = new.id), '''') <> ''pista'' then
      perform public.grant_welcome_premium(new.id);
    end if;');
  execute v_def;
end;
$$;

-- Sem assinatura para conta da pista (a cobrança roda pela Edge Function com service role).
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.billing_prepare_subscription(uuid, text)'::regprocedure);
  if position('select lower(email) into v_email from auth.users where id = p_user;' in v_def) = 0 then
    raise exception 'billing_prepare_subscription mudou; revisar o patch';
  end if;
  v_def := replace(v_def, 'select lower(email) into v_email from auth.users where id = p_user;',
    'if public.is_pista_account(p_user) then
    raise exception ''Esta conta só usa o App da Pista.'' using errcode = ''42501'';
  end if;
  select lower(email) into v_email from auth.users where id = p_user;');
  execute v_def;
end;
$$;

-- Conta da pista não vira responsável.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.update_org_member(uuid, public.org_member_role, boolean, boolean)'::regprocedure);
  if position('select * into m from public.organization_members where id = p_member_id for update;' in v_def) = 0 then
    raise exception 'update_org_member mudou; revisar o patch';
  end if;
  v_def := replace(v_def, 'select * into m from public.organization_members where id = p_member_id for update;',
    'select * into m from public.organization_members where id = p_member_id for update;
  if p_role = ''responsible'' and public.is_pista_account(m.user_id) then
    raise exception ''Conta da pista não pode ser responsável.'' using errcode = ''42501'';
  end if;');
  execute v_def;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tela de entrada: nome da oficina pelo código (público).
-- -----------------------------------------------------------------------------
create or replace function public.pista_workshop_by_code(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('code', o.pista_code, 'name', coalesce(w.business_name, o.name))
    from public.organizations o
    left join public.workshops w on w.organization_id = o.id
   where o.pista_code = lower(trim(p_code)) and o.status = 'active'
   limit 1;
$$;
revoke execute on function public.pista_workshop_by_code(text) from public;
grant execute on function public.pista_workshop_by_code(text) to anon, authenticated;

-- Contexto da pista com apelido e indicação de conta da pista.
create or replace function public.pista_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'organization_id', m.organization_id,
           'name', coalesce(w.business_name, o.name),
           'code', o.pista_code,
           'is_responsible', m.role = 'responsible',
           'allow_unassigned', coalesce(w.pista_allow_unassigned, true),
           'allow_ready', coalesce(w.pista_allow_ready, true),
           'user_name', coalesce((select p.full_name from public.profiles p where p.id = auth.uid()), ''),
           'nickname', (select a.nickname from public.pista_accounts a where a.user_id = auth.uid() and a.organization_id = m.organization_id),
           'pista_account', public.is_pista_account(auth.uid()))
         order by coalesce(w.business_name, o.name)), '[]'::jsonb)
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    left join public.workshops w on w.organization_id = m.organization_id
   where m.user_id = auth.uid() and m.status = 'active'
     and (m.role = 'responsible' or m.can_execute_orders);
$$;
revoke execute on function public.pista_context() from public, anon;
grant execute on function public.pista_context() to authenticated;

-- Lista para a tela Equipe (só o responsável).
create or replace function public.workshop_pista_accounts(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.pista_is_responsible(p_org) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'code', (select pista_code from public.organizations where id = p_org),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', a.user_id, 'nickname', a.nickname,
               'full_name', coalesce(p.full_name, ''),
               'active', a.disabled_at is null and m.status = 'active',
               'member_id', m.id,
               'last_sign_in_at', u.last_sign_in_at,
               'created_at', a.created_at)
             order by (a.disabled_at is null) desc, a.nickname)
        from public.pista_accounts a
        left join public.organization_members m on m.organization_id = a.organization_id and m.user_id = a.user_id
        left join public.profiles p on p.id = a.user_id
        left join auth.users u on u.id = a.user_id
       where a.organization_id = p_org), '[]'::jsonb));
end;
$$;
revoke execute on function public.workshop_pista_accounts(uuid) from public, anon;
grant execute on function public.workshop_pista_accounts(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Funções só para a Edge Function pista-accounts (service role).
-- Sempre conferem se p_actor é o responsável da oficina.
-- -----------------------------------------------------------------------------
create or replace function public.pista_assert_actor(p_actor uuid, p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor is null or public.is_pista_account(p_actor) or not exists (
       select 1 from public.organization_members m
         join public.organizations o on o.id = m.organization_id and o.status = 'active'
        where m.organization_id = p_org and m.user_id = p_actor and m.status = 'active' and m.role = 'responsible') then
    raise exception 'Só o responsável da oficina gerencia os mecânicos.' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.pista_assert_actor(uuid, uuid) from public, anon, authenticated;

create or replace function public.pista_account_prepare(p_actor uuid, p_org uuid, p_nickname text, p_replace_member uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  m public.organization_members;
begin
  perform public.pista_assert_actor(p_actor, p_org);
  if p_nickname is null or p_nickname !~ '^[a-z0-9]{2,20}$' then
    raise exception 'Apelido inválido: use de 2 a 20 letras ou números, sem espaço.' using errcode = '22023';
  end if;
  if exists (select 1 from public.pista_accounts where organization_id = p_org and nickname = p_nickname) then
    raise exception 'Já existe um mecânico com esse apelido nesta oficina.' using errcode = '23505';
  end if;
  if p_replace_member is not null then
    select * into m from public.organization_members where id = p_replace_member;
    if not found or m.organization_id <> p_org or m.status <> 'active' or m.role <> 'staff' or public.is_pista_account(m.user_id) then
      raise exception 'Este membro não pode virar conta da pista.' using errcode = '22023';
    end if;
  end if;
  select pista_code into v_code from public.organizations where id = p_org;
  return jsonb_build_object('code', v_code, 'email', p_nickname || '.' || v_code || '@pista.motopassaporte.com.br');
end;
$$;
revoke execute on function public.pista_account_prepare(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.pista_account_prepare(uuid, uuid, text, uuid) to service_role;

create or replace function public.pista_account_register(
  p_actor uuid, p_org uuid, p_user uuid, p_nickname text, p_full_name text, p_replace_member uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.organization_members;
begin
  perform public.pista_account_prepare(p_actor, p_org, p_nickname, p_replace_member);
  if not exists (select 1 from auth.users u where u.id = p_user and u.raw_app_meta_data ->> 'account_kind' = 'pista') then
    raise exception 'Conta da pista não encontrada.' using errcode = 'P0002';
  end if;
  insert into public.pista_accounts (user_id, organization_id, nickname, created_by)
  values (p_user, p_org, p_nickname, p_actor);
  update public.profiles set full_name = left(coalesce(nullif(trim(p_full_name), ''), p_nickname), 120) where id = p_user;
  insert into public.organization_members
    (organization_id, user_id, role, status, can_request_access, can_register_services,
     can_manage_quotes, can_manage_prices, can_execute_orders, can_manage_finance)
  values (p_org, p_user, 'staff', 'active', false, false, false, false, true, false);
  if p_replace_member is not null then
    select * into m from public.organization_members where id = p_replace_member for update;
    -- Serviços em andamento passam para a conta nova; a conta pessoal antiga deixa a equipe.
    update public.workshop_service_orders set mechanic_user_id = p_user
     where organization_id = p_org and mechanic_user_id = m.user_id
       and status not in ('completed', 'awaiting_pickup', 'delivered', 'canceled');
    update public.organization_members set status = 'removed' where id = p_replace_member;
  end if;
  return jsonb_build_object('user_id', p_user, 'nickname', p_nickname);
end;
$$;
revoke execute on function public.pista_account_register(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.pista_account_register(uuid, uuid, uuid, text, text, uuid) to service_role;

create or replace function public.pista_account_manage(p_actor uuid, p_org uuid, p_user uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.pista_accounts;
begin
  perform public.pista_assert_actor(p_actor, p_org);
  select * into a from public.pista_accounts where user_id = p_user and organization_id = p_org for update;
  if not found then
    raise exception 'Mecânico não encontrado nesta oficina.' using errcode = 'P0002';
  end if;
  if p_action = 'password' then
    if a.disabled_at is not null then
      raise exception 'Reative o mecânico antes de trocar a senha.' using errcode = '22023';
    end if;
  elsif p_action = 'disable' then
    update public.pista_accounts set disabled_at = coalesce(disabled_at, now()) where user_id = p_user;
    update public.organization_members set status = 'removed' where organization_id = p_org and user_id = p_user;
    update public.workshop_service_orders set mechanic_user_id = null
     where organization_id = p_org and mechanic_user_id = p_user
       and status not in ('completed', 'awaiting_pickup', 'delivered', 'canceled');
  elsif p_action = 'enable' then
    update public.pista_accounts set disabled_at = null where user_id = p_user;
    update public.organization_members set status = 'active' where organization_id = p_org and user_id = p_user;
  else
    raise exception 'Ação inválida.' using errcode = '22023';
  end if;
  return jsonb_build_object('user_id', p_user, 'action', p_action);
end;
$$;
revoke execute on function public.pista_account_manage(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.pista_account_manage(uuid, uuid, uuid, text) to service_role;
