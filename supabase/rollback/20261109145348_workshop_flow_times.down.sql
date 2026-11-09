-- Desfaz 20261109145348_workshop_flow_times (Fase D do fluxo da oficina, ADR-061).
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.workshop_list_orders(uuid, text, text, boolean)'::regprocedure);
  v_def := replace(v_def, 'o.opened_at_entry, o.diagnosed_at, o.status_changed_at, c.whatsapp as customer_whatsapp,', 'o.opened_at_entry, o.diagnosed_at,');
  execute v_def;
end;
$$;
drop function if exists public.workshop_stage_times(uuid, date, date);
drop trigger if exists workshop_service_orders_status_changed on public.workshop_service_orders;
drop function if exists public.wo_track_status_change();
alter table public.workshop_service_orders drop column if exists status_changed_at;
