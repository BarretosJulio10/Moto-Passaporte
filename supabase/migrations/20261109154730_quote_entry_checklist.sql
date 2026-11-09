-- Orçamento nascido de uma entrada mostra o checklist de entrada e as fotos da OS (ADR-060).
create or replace function public.workshop_quote_entry(p_org uuid, p_quote uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare q public.workshop_quotes;
        o public.workshop_service_orders;
begin
  perform public.wq_assert(p_org, 'member');
  select * into q from public.workshop_quotes where id = p_quote and organization_id = p_org;
  if not found or q.entry_order_id is null then return null; end if;
  select * into o from public.workshop_service_orders where id = q.entry_order_id and organization_id = p_org;
  if not found then return null; end if;
  return jsonb_build_object(
    'order_id', o.id, 'order_number', o.number, 'km_in', o.km_in, 'problem', o.notes,
    'photos', (select count(*) from public.workshop_os_photos p where p.order_id = o.id and p.phase = 'entry' and p.removed_at is null),
    'entry', (select jsonb_build_object('items', i.items, 'fuel_level', i.fuel_level, 'keys_count', i.keys_count, 'km', i.km,
                                        'notes', i.notes, 'recorded_at', i.recorded_at, 'customer_ack_at', i.customer_ack_at,
                                        'customer_ack_name', i.customer_ack_name)
                from public.workshop_inspections i where i.order_id = o.id and i.phase = 'entry'));
end;
$$;
revoke execute on function public.workshop_quote_entry(uuid, uuid) from public, anon;
grant execute on function public.workshop_quote_entry(uuid, uuid) to authenticated;
