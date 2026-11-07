-- =============================================================================
-- Exige a conferência de conteúdo para registrar anexos (KI-018; ADR-033)
-- Só registra arquivo conferido pela Edge Function attachment-check, com o mesmo tipo, nas
-- últimas 2 horas. Não dá para pular a conferência chamando register_* direto.
-- Rollback: drop trigger attachments_require_check on public.attachments (ver rollback de attachment_checks).
-- =============================================================================

create or replace function public.require_attachment_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.attachment_checks c
                  where c.storage_path = new.storage_path and c.ok and c.mime_type = new.mime_type
                    and c.checked_at > now() - interval '2 hours') then
    raise exception 'O arquivo não passou pela conferência de conteúdo. Envie de novo.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists attachments_require_check on public.attachments;
create trigger attachments_require_check before insert on public.attachments
  for each row execute function public.require_attachment_check();

revoke execute on function public.require_attachment_check() from public, anon, authenticated;
