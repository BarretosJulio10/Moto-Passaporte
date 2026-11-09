-- KI-049: o banco roda em UTC; das 21h à meia-noite (Brasília) "current_date" já era amanhã.
-- Toda função pública que usa a data de hoje passa a rodar no horário de Brasília.
do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%current_date%'
  loop
    execute format('alter function %s set timezone to %L', f.sig, 'America/Sao_Paulo');
    n := n + 1;
  end loop;
  if n < 20 then
    raise exception 'esperava ao menos 20 funções com current_date, achou %', n;
  end if;
end $$;
