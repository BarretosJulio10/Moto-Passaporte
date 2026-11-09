drop function if exists public.messaging_set_fzap_instance(text, text, uuid);
alter table public.messaging_settings drop column if exists fzap_instance_id;
