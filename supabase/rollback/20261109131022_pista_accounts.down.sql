-- Desfaz 20261109131022_pista_accounts (conta da pista, ADR-058).
-- Atenção: apaga a ligação das contas da pista; as contas no Auth ficam e devem ser
-- desligadas antes pela tela Equipe.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator reset pgrst.db_pre_request';
  end if;
end;
$$;
notify pgrst, 'reload config';

drop policy if exists pista_accounts_only_workshop_files on storage.objects;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.profiles_welcome_premium()'::regprocedure);
  v_def := replace(v_def, 'if coalesce((select u.raw_app_meta_data ->> ''account_kind'' from auth.users u where u.id = new.id), '''') <> ''pista'' then
      perform public.grant_welcome_premium(new.id);
    end if;', 'perform public.grant_welcome_premium(new.id);');
  execute v_def;

  v_def := pg_get_functiondef('public.billing_prepare_subscription(uuid, text)'::regprocedure);
  v_def := replace(v_def, 'if public.is_pista_account(p_user) then
    raise exception ''Esta conta só usa o App da Pista.'' using errcode = ''42501'';
  end if;
  ', '');
  execute v_def;

  v_def := pg_get_functiondef('public.update_org_member(uuid, public.org_member_role, boolean, boolean)'::regprocedure);
  v_def := replace(v_def, '
  if p_role = ''responsible'' and public.is_pista_account(m.user_id) then
    raise exception ''Conta da pista não pode ser responsável.'' using errcode = ''42501'';
  end if;', '');
  execute v_def;
end;
$$;

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
           'is_responsible', m.role = 'responsible',
           'allow_unassigned', coalesce(w.pista_allow_unassigned, true),
           'allow_ready', coalesce(w.pista_allow_ready, true),
           'user_name', coalesce((select p.full_name from public.profiles p where p.id = auth.uid()), ''))
         order by coalesce(w.business_name, o.name)), '[]'::jsonb)
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    left join public.workshops w on w.organization_id = m.organization_id
   where m.user_id = auth.uid() and m.status = 'active'
     and (m.role = 'responsible' or m.can_execute_orders);
$$;

drop function if exists public.pista_account_manage(uuid, uuid, uuid, text);
drop function if exists public.pista_account_register(uuid, uuid, uuid, text, text, uuid);
drop function if exists public.pista_account_prepare(uuid, uuid, text, uuid);
drop function if exists public.pista_assert_actor(uuid, uuid);
drop function if exists public.workshop_pista_accounts(uuid);
drop function if exists public.pista_workshop_by_code(text);
drop function if exists public.pista_request_guard();
drop table if exists public.pista_accounts;
drop function if exists public.is_pista_account(uuid);
drop trigger if exists organizations_pista_code on public.organizations;
drop function if exists public.organizations_pista_code();
alter table public.organizations drop column if exists pista_code;
drop function if exists public.pista_new_code();
