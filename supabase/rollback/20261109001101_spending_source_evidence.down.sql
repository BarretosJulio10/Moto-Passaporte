-- Volta sp_records a filtrar pela origem gravada (source_type).
create or replace function public.sp_records(p_user uuid, p_motorcycle uuid, p_scope text)
returns table (id uuid, motorcycle_id uuid, category text, title text, service_date date, workshop_name text,
               source_type text, value_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.motorcycle_id, r.category::text, r.title, r.service_date, nullif(btrim(r.workshop_name), ''),
         r.source_type::text, r.service_value_cents
    from public.motorcycle_ownerships o
    join public.maintenance_records r on r.motorcycle_id = o.motorcycle_id
   where o.owner_user_id = p_user and o.ended_at is null
     and (p_motorcycle is null or o.motorcycle_id = p_motorcycle)
     and not r.is_void
     and not exists (select 1 from public.maintenance_records c where c.corrects_record_id = r.id)
     and (p_scope = 'all' or r.service_date >= coalesce(public.sp_ownership_start(o.id), r.service_date));
$$;
revoke execute on function public.sp_records(uuid, uuid, text) from public, anon, authenticated;
