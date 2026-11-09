-- Volta a lista de OS, a política de gastos e remove os índices criados.
do $$
declare
  v_def text := pg_get_functiondef('public.workshop_list_orders(uuid,text,text,boolean)'::regprocedure);
begin
  execute replace(v_def, E'\n         order by (o.status in (''delivered'', ''canceled'')), o.created_at desc\n         limit 500', E'\n         limit 500');
end $$;
alter policy owner_expenses_select on public.owner_expenses using (user_id = auth.uid() and deleted_at is null);
do $$
declare r record;
begin
  for r in select schemaname, indexname from pg_indexes where schemaname = 'public' and indexname like '%\_fkx' loop
    execute format('drop index if exists %I.%I', r.schemaname, r.indexname);
  end loop;
end $$;
