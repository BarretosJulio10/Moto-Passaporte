-- KI-051: a lista de OS cortava em 500 sem ordem definida (uma OS aberta podia sumir da Esteira).
-- Abertas primeiro, depois as mais recentes.
do $$
declare
  v_def text := pg_get_functiondef('public.workshop_list_orders(uuid,text,text,boolean)'::regprocedure);
  v_old text := E'                or (v_plate is not null and v.plate like v_plate || ''%''))\n         limit 500';
  v_new text := E'                or (v_plate is not null and v.plate like v_plate || ''%''))\n         order by (o.status in (''delivered'', ''canceled'')), o.created_at desc\n         limit 500';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'workshop_list_orders: trecho esperado não encontrado';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;

-- Desempenho (advisor): RLS com auth.uid() avaliado uma vez por consulta, não por linha.
alter policy owner_expenses_select on public.owner_expenses
  using (user_id = (select auth.uid()) and deleted_at is null);

-- Desempenho (advisor): índice para toda chave estrangeira do esquema público que ainda não tem.
do $$
declare
  fk record;
  v_name text;
begin
  for fk in
    select c.conrelid, c.conrelid::regclass as tbl, c.conkey,
           (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols,
           (select string_agg(a.attname, '_' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as colnames,
           (select relname from pg_class where oid = c.conrelid) as relname
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
          and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey
      )
  loop
    v_name := left(fk.relname || '_' || fk.colnames, 55) || '_fkx';
    execute format('create index if not exists %I on %s (%s)', v_name, fk.tbl, fk.cols);
  end loop;
end $$;
