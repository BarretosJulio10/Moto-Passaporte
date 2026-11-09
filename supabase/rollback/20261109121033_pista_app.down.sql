-- Reversão do App da Pista (ADR-057). Antes: nenhuma OS pode estar em 'ready' (volte para 'in_progress').
do $do$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'moto-passaporte-pista-audios';
  end if;
end $do$;
drop function if exists public.pista_save_inspection(uuid, uuid, text, jsonb);
drop function if exists public.pista_add_audio(uuid, uuid, text, int, text, uuid);
drop function if exists public.pista_add_photo(uuid, uuid, text, text, text);
drop function if exists public.pista_void_note(uuid, uuid, uuid);
drop function if exists public.pista_add_note(uuid, uuid, uuid, text, uuid);
drop function if exists public.pista_set_item(uuid, uuid, uuid, text);
drop function if exists public.pista_mark_ready(uuid, uuid, int);
drop function if exists public.pista_set_status(uuid, uuid, text);
drop function if exists public.pista_take_order(uuid, uuid);
drop function if exists public.workshop_order_media(uuid, uuid);
drop function if exists public.pista_get_order(uuid, uuid);
drop function if exists public.pista_order_audios(uuid);
drop function if exists public.pista_order_notes(uuid);
drop function if exists public.pista_list_orders(uuid);
drop function if exists public.workshop_set_pista_settings(uuid, boolean, boolean);
drop function if exists public.pista_context();
drop function if exists public.pista_lock(uuid, uuid);
drop function if exists public.pista_is_responsible(uuid);
drop function if exists public.system_expire_workshop_audios();
-- Recriar storage_unlinked_objects, can_access_workshop_object e workshop_file_object_info pelas migrações
-- 20261109022744_spending_phase_c.sql e 20261108201102_workshop_growth.sql; restringir o bucket a imagens.
drop table if exists public.workshop_os_audios;
drop table if exists public.workshop_os_notes;
alter table public.workshops drop column if exists pista_allow_unassigned, drop column if exists pista_allow_ready;
