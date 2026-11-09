-- KI-052: aviso antes do Premium (boas-vindas ou Pix) acabar quando há mais motos que o plano grátis cobre.
do $$
declare
  v_def text := pg_get_functiondef('public.get_my_motorcycle_slots()'::regprocedure);
  v_old text := $q$'pass_until', case when x.id is not null then x.ends_at end,$q$;
  v_new text := $q$'pass_until', case when x.id is not null then x.ends_at end,
    'grant_until', case when v_mode = 'grant' then (public.user_active_grant(v_uid)).expires_at end,
    'free_max', (select max_motorcycles from public.subscription_plans where kind = 'free' and is_active order by price_cents limit 1),$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'get_my_motorcycle_slots: trecho esperado não encontrado';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;
