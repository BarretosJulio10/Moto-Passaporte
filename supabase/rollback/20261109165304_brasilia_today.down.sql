-- Volta as funções ao fuso da sessão (UTC).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f'
      and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where lower(c) = 'timezone=america/sao_paulo')
  loop
    execute format('alter function %s reset timezone', f.sig);
  end loop;
end $$;
