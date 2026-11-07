-- =============================================================================
-- Conferência do conteúdo dos arquivos no servidor (KI-018; ADR-033)
-- - A Edge Function attachment-check baixa o arquivo enviado, confere a assinatura dos
--   primeiros bytes (JPEG, PNG, WebP, PDF) contra o tipo declarado e grava o resultado aqui.
--   Conteúdo que não bate é apagado do Storage.
-- - A exigência (gatilho em attachments) vem na migração seguinte, attachment_checks_enforce,
--   aplicada depois de publicar a Edge Function e o site.
-- Rollback: supabase/rollback/<versão>_attachment_checks.down.sql
-- =============================================================================

create table if not exists public.attachment_checks (
  storage_path text primary key,
  mime_type    text not null,
  ok           boolean not null,
  checked_by   uuid references auth.users (id) on delete set null,
  checked_at   timestamptz not null default now()
);
alter table public.attachment_checks enable row level security;
revoke all on public.attachment_checks from public, anon, authenticated;
comment on table public.attachment_checks is 'Resultado da conferência de conteúdo dos envios (ADR-033). Escrita só pela Edge Function attachment-check.';

-- Dados do objeto para a Edge Function (service_role).
create or replace function public.attachment_object_info(p_path text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('owner', coalesce(o.owner_id, o.owner::text), 'mime', o.metadata ->> 'mimetype',
                            'size', (o.metadata ->> 'size')::bigint,
                            'registered', exists (select 1 from public.attachments a where a.storage_path = o.name))
    from storage.objects o where o.bucket_id = 'attachments' and o.name = p_path;
$$;

create or replace function public.record_attachment_check(p_path text, p_user uuid, p_mime text, p_ok boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.attachment_checks (storage_path, mime_type, ok, checked_by)
  values (p_path, p_mime, p_ok, p_user)
  on conflict (storage_path) do update set mime_type = excluded.mime_type, ok = excluded.ok, checked_by = excluded.checked_by, checked_at = now();
$$;

revoke execute on function public.attachment_object_info(text) from public, anon, authenticated;
revoke execute on function public.record_attachment_check(text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.attachment_object_info(text) to service_role;
grant execute on function public.record_attachment_check(text, uuid, text, boolean) to service_role;
