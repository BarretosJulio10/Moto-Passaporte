-- Reversão da Fase 1 do módulo Oficina (PRD 2.1). APAGA clientes, motos, catálogo, preços e orçamentos
-- das oficinas. Fazer backup antes (supabase db dump --data-only -t 'public.workshop_*') e só com aprovação.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'moto-passaporte-quotes-expire';
  end if;
end $$;
drop function if exists public.get_quote_by_token(text), public.decide_quote_by_token(text, integer[], text, boolean, text, text, text),
  public.wq_public_payload(public.workshop_quote_shares), public.wq_share_by_token(text), public.workshop_expire_quotes(),
  public.workshop_dashboard(uuid, date, date), public.workshop_get_quote(uuid, uuid), public.workshop_list_quotes(uuid, text, text),
  public.workshop_log_quote_event(uuid, uuid, text), public.workshop_cancel_quote(uuid, uuid, text),
  public.workshop_revoke_quote_link(uuid, uuid), public.workshop_revise_quote(uuid, uuid, text), public.workshop_send_quote(uuid, uuid),
  public.wq_issue_link(uuid, uuid, uuid, integer, date, text), public.wq_new_token(), public.workshop_save_quote_draft(uuid, uuid, jsonb),
  public.workshop_create_quote(uuid, uuid, uuid, uuid, text), public.wq_recalc(uuid),
  public.workshop_suggest_price(uuid, uuid, uuid, uuid, text), public.workshop_list_catalog(uuid),
  public.workshop_delete_price_rule(uuid, uuid), public.workshop_save_price_rule(uuid, uuid, jsonb),
  public.workshop_save_price_table(uuid, uuid, text, text, boolean, boolean), public.workshop_save_service(uuid, uuid, jsonb),
  public.workshop_link_vehicle_passport(uuid, uuid, uuid), public.workshop_list_vehicles(uuid, text),
  public.workshop_save_vehicle(uuid, uuid, uuid, jsonb), public.workshop_get_customer(uuid, uuid),
  public.workshop_list_customers(uuid, text, boolean), public.workshop_set_customer_status(uuid, uuid, text),
  public.workshop_save_customer(uuid, uuid, jsonb), public.wq_notify_team(uuid, text, text, text, text, text),
  public.wq_event(uuid, uuid, integer, text, jsonb, text), public.wq_actor_label(), public.wq_digits(jsonb, text), public.wq_txt(jsonb, text),
  public.set_org_member_extra_permissions(uuid, boolean, boolean), public.get_org_member_extra_permissions(uuid),
  public.get_my_workshop_permissions(uuid), public.wq_assert(uuid, text), public.wq_next_number(uuid, text);
drop table if exists public.workshop_quote_events, public.workshop_quote_approvals, public.workshop_quote_shares,
  public.workshop_quote_items, public.workshop_quote_versions, public.workshop_quotes, public.workshop_service_prices,
  public.workshop_price_tables, public.workshop_service_catalog, public.workshop_vehicles, public.workshop_customers,
  public.workshop_counters;
drop function if exists public.wq_protect_org(), public.wq_protect_version(), public.wq_protect_items(), public.wq_immutable();
delete from public.notifications where kind in ('quote_viewed', 'quote_decided', 'quote_expired');
delete from public.notification_preferences where kind in ('quote_viewed', 'quote_decided', 'quote_expired');
-- Recriar notifications_kind_check, notification_kind_optional e get_my_notification_preferences
-- como em 20261108175020_care_routines.sql, e has_org_permission como em 20261107103155_workshop_team.sql.
alter table public.organization_members drop column if exists can_manage_quotes, drop column if exists can_manage_prices;
