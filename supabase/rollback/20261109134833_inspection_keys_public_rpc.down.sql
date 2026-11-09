-- Desfaz 20261109134833_inspection_keys_public_rpc.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.workshop_save_inspection(uuid, uuid, text, jsonb)'::regprocedure);
  v_def := replace(v_def, '(select case when d <> '''' then least(left(d, 3)::int, 10) end from regexp_replace(coalesce(p_data ->> ''keys_count'', ''''), ''\D'', '''', ''g'') d)',
                          'nullif(p_data ->> ''keys_count'', '''')::int');
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
