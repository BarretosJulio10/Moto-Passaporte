-- =============================================================================
-- Fluxo da oficina, Fase D (ADR-061): tempo real em cada etapa, WhatsApp do
-- cliente na esteira e tempo médio por etapa nos relatórios.
-- =============================================================================

alter table public.workshop_service_orders add column if not exists status_changed_at timestamptz;
update public.workshop_service_orders o
   set status_changed_at = coalesce((select max(e.created_at) from public.workshop_service_order_events e
                                      where e.order_id = o.id and e.to_status is not null), o.created_at)
 where status_changed_at is null;
alter table public.workshop_service_orders alter column status_changed_at set default now();
alter table public.workshop_service_orders alter column status_changed_at set not null;

create or replace function public.wo_track_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status or new.diagnosed_at is distinct from old.diagnosed_at then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.wo_track_status_change() from public, anon, authenticated;
drop trigger if exists workshop_service_orders_status_changed on public.workshop_service_orders;
create trigger workshop_service_orders_status_changed before update on public.workshop_service_orders
  for each row execute function public.wo_track_status_change();

-- Lista de OS: quando entrou na etapa e o WhatsApp do cliente (para as mensagens prontas).
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.workshop_list_orders(uuid, text, text, boolean)'::regprocedure);
  if position('o.opened_at_entry, o.diagnosed_at,' in v_def) = 0 then
    raise exception 'workshop_list_orders mudou; revisar o patch';
  end if;
  v_def := replace(v_def, 'o.opened_at_entry, o.diagnosed_at,',
    'o.opened_at_entry, o.diagnosed_at, o.status_changed_at, c.whatsapp as customer_whatsapp,');
  execute v_def;
end;
$$;

-- Tempo médio por etapa das OS entregues no período (horas).
create or replace function public.workshop_stage_times(p_org uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'member');
  if not (public.has_org_permission(p_org, 'manage_quotes') or public.has_org_permission(p_org, 'manage_finance')) then
    raise exception 'Seu acesso não inclui relatórios.' using errcode = '42501';
  end if;
  return (
    with os as (
      select o.created_at, o.opened_at_entry, o.diagnosed_at, o.completed_at, o.delivered_at,
             (select q.decided_at from public.workshop_quotes q where q.id = o.quote_id) as approved_at,
             (select min(e.created_at) from public.workshop_service_order_events e
               where e.order_id = o.id and e.kind = 'mechanic_ready') as ready_at
        from public.workshop_service_orders o
       where o.organization_id = p_org and o.status = 'delivered'
         and o.delivered_at >= p_from::timestamptz and o.delivered_at < (p_to + 1)::timestamptz
    ), h as (
      select
        case when opened_at_entry and diagnosed_at is not null then extract(epoch from diagnosed_at - created_at) / 3600 end as diag,
        case when opened_at_entry and diagnosed_at is not null and approved_at > diagnosed_at
             then extract(epoch from approved_at - diagnosed_at) / 3600 end as approval,
        case when coalesce(ready_at, completed_at) is not null
             then extract(epoch from coalesce(ready_at, completed_at) - greatest(created_at, coalesce(approved_at, created_at))) / 3600 end as execution,
        case when completed_at is not null then extract(epoch from delivered_at - completed_at) / 3600 end as pickup,
        extract(epoch from delivered_at - created_at) / 3600 as total
      from os
    )
    select jsonb_build_object(
      'orders', count(*),
      'diagnosis_hours', round(avg(diag)::numeric, 1),
      'approval_hours', round(avg(approval)::numeric, 1),
      'execution_hours', round(avg(execution)::numeric, 1),
      'pickup_hours', round(avg(pickup)::numeric, 1),
      'total_hours', round(avg(total)::numeric, 1))
    from h);
end;
$$;
revoke execute on function public.workshop_stage_times(uuid, date, date) from public, anon;
grant execute on function public.workshop_stage_times(uuid, date, date) to authenticated;
