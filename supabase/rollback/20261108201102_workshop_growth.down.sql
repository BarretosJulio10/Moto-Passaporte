-- Reversão da Fase 5 do módulo Oficina (PRD 2.1): perfil avançado, avaliações, agendamento público, campanhas.
-- ATENÇÃO: apaga avaliações, campanhas e o cadastro das fotos do perfil (os arquivos ficam no Storage até a limpeza).
-- Exporte as avaliações antes se a reversão for feita com dados reais. Pedidos de agendamento já feitos continuam na agenda.
drop policy if exists workshop_files_select_public on storage.objects;
drop function if exists
  public.get_public_workshop(text), public.get_public_booking_slots(text, date),
  public.request_public_appointment(text, date, text, text, text, text, text, boolean),
  public.submit_workshop_review(text, integer, text, text, boolean),
  public.workshop_list_reviews(uuid), public.workshop_reply_review(uuid, uuid, text), public.workshop_report_review(uuid, uuid, text),
  public.admin_list_reviews(boolean), public.admin_moderate_review(uuid, text, text),
  public.workshop_save_campaign(uuid, uuid, jsonb), public.workshop_close_campaign(uuid, uuid), public.workshop_list_campaigns(uuid),
  public.workshop_campaign_recipients(uuid, uuid), public.workshop_set_marketing_opt_out(uuid, uuid, boolean),
  public.workshop_register_public_photo(uuid, text, text, text), public.workshop_remove_public_photo(uuid, uuid),
  public.workshop_list_public_photos(uuid), public.is_public_workshop_file(text),
  public.wp_free_slots(uuid, date), public.wp_public_org(text), public.wr_display_name(text);
drop function if exists public.wp_campaign_audience(uuid, public.workshop_campaigns);
drop table if exists public.workshop_campaigns, public.workshop_reviews, public.workshop_public_photos;
drop function if exists public.wr_protect_review();

-- Recriar como em 20261108194522_workshop_management.sql: workshop_log_contact(...).
-- Recriar como em 20261108191115_workshop_service_orders.sql: get_service_order_by_token(text), workshop_file_object_info(text),
-- notifications_kind_check e get_my_notification_preferences(); e notification_kind_optional(text) como em 20261108184011.
-- Só então (sem contatos 'campaign' nem avisos dos tipos novos):
-- delete from public.notifications where kind in ('appointment_requested', 'workshop_review');
-- alter table public.workshop_contact_log drop column delivery_status, drop column provider, drop column provider_message_id;
-- (restaurar os checks de reason e channel da Fase 4)
alter table public.workshop_customers drop column if exists marketing_opt_out_at;
alter table public.workshop_appointments drop column if exists vehicle_text, drop column if exists consent_at;
alter table public.workshops drop constraint if exists workshops_booking_needs_hours;
alter table public.workshops drop column if exists brands_served, drop column if exists weekly_hours, drop column if exists website_url,
  drop column if exists show_services, drop column if exists show_prices, drop column if exists booking_enabled,
  drop column if exists booking_slot_minutes, drop column if exists booking_capacity, drop column if exists booking_days_ahead,
  drop column if exists booking_min_hours, drop column if exists logo_path;
drop function if exists public.wp_valid_hours(jsonb);
delete from public.system_settings where key in ('public_booking_requests_per_hour', 'public_workshop_views_per_hour');
