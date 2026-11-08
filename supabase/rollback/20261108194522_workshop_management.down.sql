-- Reversão da Fase 4 do módulo Oficina (PRD 2.1): peças, financeiro, agenda, lembretes, contatos e relatórios.
-- ATENÇÃO: apaga os recebimentos, agendamentos, lembretes e contatos registrados. Exporte antes (CSV do Financeiro)
-- se a reversão for feita com dados reais. Não toca no histórico das motos nem em orçamentos/OS.
drop function if exists
  public.workshop_reports(uuid, date, date),
  public.workshop_customer_contacts(uuid, uuid),
  public.workshop_relationship(uuid, integer, integer),
  public.workshop_log_contact(uuid, uuid, text, uuid, text, text),
  public.workshop_set_reminder_status(uuid, uuid, text),
  public.workshop_save_reminder(uuid, uuid, jsonb),
  public.workshop_list_appointments(uuid, timestamptz, timestamptz),
  public.workshop_set_appointment_status(uuid, uuid, text, uuid, uuid),
  public.workshop_save_appointment(uuid, uuid, jsonb),
  public.workshop_finance(uuid, date, date),
  public.workshop_order_payments(uuid, uuid),
  public.workshop_void_payment(uuid, uuid, text),
  public.workshop_record_payment(uuid, uuid, bigint, text, date, text),
  public.workshop_list_parts(uuid, text, boolean),
  public.workshop_save_part(uuid, uuid, jsonb);

drop table if exists public.workshop_contact_log, public.workshop_reminders, public.workshop_appointments,
  public.workshop_payments, public.workshop_parts_catalog;
drop function if exists public.wf_protect_payment();

-- Recriar wq_immutable() como em 20261108184011_workshop_quotes.sql e
-- wo_protect_item() como em 20261108191115_workshop_service_orders.sql; só então:
-- drop function if exists public.wq_only_user_nulled(jsonb, jsonb);

drop function if exists public.set_org_member_extra_permissions(uuid, boolean, boolean, boolean, boolean);
drop function if exists public.get_org_member_extra_permissions(uuid);
-- Recriar set_org_member_extra_permissions(uuid, boolean, boolean, boolean) e get_org_member_extra_permissions(uuid)
-- (4 colunas), get_my_workshop_permissions(uuid) e has_org_permission(uuid, text) como em
-- 20261108191115_workshop_service_orders.sql; só então:
-- alter table public.organization_members drop column if exists can_manage_finance;
