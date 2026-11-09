-- Reversão do cofre (PRD 2.4 / ADR-056). Antes de aplicar, desligue: update system_settings set value='0' where key='vault_enabled'.
-- 1) Políticas e funções originais: recriar a partir das migrações
--    20261107014505_maintenance.sql (maintenance_records_select), 20261107104321_workshop_services.sql /
--    a migração mais recente que define attachments_select e can_access_attachment_object,
--    get_shared_passport, shared_attachment_for_download, get_spending_entries (20261109003133/20261109022744),
--    system_generate_notifications (20261108165626) e trg_notify_workshop_service.
drop policy if exists maintenance_records_select on public.maintenance_records;
create policy maintenance_records_select on public.maintenance_records
  for select to authenticated using (public.is_current_owner(motorcycle_id));
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (public.can_view_attachment(motorcycle_id, diary_entry_id)
         or (organization_id is not null and public.workshop_has_access(motorcycle_id, organization_id)));
drop function if exists public.get_maintenance_timeline(uuid);
drop function if exists public.get_my_vault();
drop function if exists public.export_my_attachments();
drop function if exists public.accept_current_terms(text, text);
drop table if exists public.attachment_exports;
-- As funções vault_* ficam inofensivas com vault_enabled = 0; remover depois de recriar as que as usam.
delete from public.system_settings where key in ('vault_enabled', 'free_open_records');
