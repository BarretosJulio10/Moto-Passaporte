-- Reversão da Fase 2 do módulo Oficina (PRD 2.1). APAGA ordens de serviço, checklists, registros de fotos e links.
-- Backup antes e só com aprovação. As fotos no bucket "workshop-files" precisam ser removidas pelo painel/API do Storage.
drop policy if exists workshop_files_insert on storage.objects;
drop policy if exists workshop_files_select on storage.objects;
drop function if exists public.ack_service_order_entry(text, text, boolean), public.get_service_order_by_token(text),
  public.wo_share_by_token(text), public.workshop_create_order_link(uuid, uuid, text), public.workshop_customer_orders(uuid, uuid),
  public.workshop_orders_summary(uuid, date, date), public.workshop_get_order(uuid, uuid), public.workshop_list_orders(uuid, text, text, boolean),
  public.workshop_cancel_order(uuid, uuid, text), public.workshop_deliver_order(uuid, uuid, text, text), public.workshop_notify_pickup(uuid, uuid),
  public.workshop_complete_order(uuid, uuid, integer, text, bigint, text), public.workshop_remove_os_photo(uuid, uuid, uuid),
  public.workshop_register_os_photo(uuid, uuid, text, text, text), public.workshop_save_inspection(uuid, uuid, text, jsonb),
  public.workshop_set_technical_notes(uuid, uuid, text), public.workshop_update_order_item(uuid, uuid, uuid, jsonb),
  public.workshop_update_order(uuid, uuid, jsonb), public.workshop_set_order_status(uuid, uuid, text, text),
  public.workshop_add_complement_to_order(uuid, uuid, uuid), public.workshop_add_order_item(uuid, uuid, jsonb, text, text, text),
  public.workshop_create_order_manual(uuid, uuid, uuid, text, text, text, jsonb, integer), public.workshop_create_order_from_quote(uuid, uuid),
  public.wo_copy_quote_items(uuid, uuid, uuid, text), public.wo_is_closed(text), public.wo_lock(uuid, uuid, text),
  public.wo_event(uuid, uuid, text, text, text, jsonb, text), public.workshop_file_object_info(text), public.can_access_workshop_object(text, text);
drop table if exists public.workshop_os_shares, public.workshop_os_photos, public.workshop_inspections,
  public.workshop_service_order_events, public.workshop_service_order_items, public.workshop_service_orders;
drop function if exists public.wo_protect_item();
delete from public.notifications where kind = 'service_order_assigned';
delete from public.notification_preferences where kind = 'service_order_assigned';
-- Recriar: notifications_kind_check e get_my_notification_preferences (como em 20261108184011_workshop_quotes.sql),
-- has_org_permission, get_my_workshop_permissions, get_org_member_extra_permissions e set_org_member_extra_permissions (idem).
alter table public.organization_members drop column if exists can_execute_orders;
