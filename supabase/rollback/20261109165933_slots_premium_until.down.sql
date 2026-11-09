-- Remove os campos grant_until e free_max de get_my_motorcycle_slots.
do $$
declare
  v_def text := pg_get_functiondef('public.get_my_motorcycle_slots()'::regprocedure);
begin
  execute replace(v_def, $q$
    'grant_until', case when v_mode = 'grant' then (public.user_active_grant(v_uid)).expires_at end,
    'free_max', (select max_motorcycles from public.subscription_plans where kind = 'free' and is_active order by price_cents limit 1),$q$, '');
end $$;
