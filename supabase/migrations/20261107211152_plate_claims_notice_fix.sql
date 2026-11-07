create or replace function public.get_my_ownership_notices()
returns table (claim_id uuid, motorcycle_id uuid, motorcycle_name text, notified_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, m.id, m.brand || ' ' || m.model || ' ' || m.manufacturing_year, c.owner_notified_at
    from public.motorcycle_claim_requests c
    join public.motorcycle_ownerships o on o.motorcycle_id = c.motorcycle_id and o.ended_at is null and o.owner_user_id = auth.uid()
    join public.motorcycles m on m.id = c.motorcycle_id
   where c.owner_notified_at is not null and c.owner_notice_dismissed_at is null
     and c.owner_notified_at >= o.started_at
   order by c.owner_notified_at desc;
$$;
