-- Reversão da Fase 3 do módulo Oficina (PRD 2.1). NÃO apaga registros já gerados no histórico das motos
-- (eles pertencem à história da moto, PRD 2.1 §29.3); só desfaz o vínculo e as funções.
drop function if exists public.workshop_order_history(uuid, uuid), public.workshop_link_photo_to_history(uuid, uuid, uuid, uuid),
  public.workshop_publish_order_to_history(uuid, uuid, text, text, boolean),
  public.wo_publish(uuid, public.workshop_service_orders, text, text, boolean),
  public.wo_history_state(uuid, public.workshop_service_orders), public.wo_history_category(uuid);
drop function if exists public.workshop_complete_order(uuid, uuid, integer, text, bigint, text, jsonb);
-- Recriar workshop_complete_order(uuid, uuid, integer, text, bigint, text) como em 20261108191115_workshop_service_orders.sql.
drop trigger if exists workshop_service_orders_protect on public.workshop_service_orders;
drop function if exists public.wo_protect_order();
alter table public.workshop_os_photos drop column if exists history_attachment_id;
alter table public.workshop_service_orders drop column if exists maintenance_record_id,
  drop column if exists history_published_at, drop column if exists history_published_by;
