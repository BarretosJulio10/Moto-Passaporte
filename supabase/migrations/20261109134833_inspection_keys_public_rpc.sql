-- 1) Checklist: "chaves" aceita só a quantidade; texto ("sim") deixa de derrubar o salvamento.
-- 2) Conta da pista logada no celular ainda abre páginas públicas (orçamento, OS, passaporte):
--    a trava libera funções que qualquer visitante já pode chamar.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.workshop_save_inspection(uuid, uuid, text, jsonb)'::regprocedure);
  if position('nullif(p_data ->> ''keys_count'', '''')::int' in v_def) = 0 then
    raise exception 'workshop_save_inspection mudou; revisar o patch';
  end if;
  v_def := replace(v_def, 'nullif(p_data ->> ''keys_count'', '''')::int',
    '(select case when d <> '''' then least(left(d, 3)::int, 10) end from regexp_replace(coalesce(p_data ->> ''keys_count'', ''''), ''\D'', '''', ''g'') d)');
  execute v_def;
end;
$$;

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
  v_public boolean := false;
begin
  begin
    v_uid := auth.uid();
    if v_uid is null then
      return;
    end if;
    select true, a.disabled_at into v_found, v_disabled from public.pista_accounts a where a.user_id = v_uid;
    if not coalesce(v_found, false) then
      return;
    end if;
    v_path := coalesce(current_setting('request.path', true), '');
    -- Funções públicas (as mesmas que um visitante sem conta chama).
    if v_path ~ '^/rpc/[a-z_0-9]+$' then
      select exists (select 1 from pg_catalog.pg_proc p
                       join pg_catalog.pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
                      where p.proname = substr(v_path, 6) and has_function_privilege('anon', p.oid, 'execute'))
        into v_public;
    end if;
  exception when others then
    return;
  end;
  if v_disabled is not null then
    raise exception 'Esta conta foi desligada pela oficina.' using errcode = '42501';
  end if;
  if v_path ~ '^/rpc/pista_[a-z_]+$' or v_public then
    return;
  end if;
  raise exception 'Esta conta só usa o App da Pista.' using errcode = '42501';
end;
$$;
revoke execute on function public.pista_request_guard() from public;
grant execute on function public.pista_request_guard() to anon, authenticated, service_role;
