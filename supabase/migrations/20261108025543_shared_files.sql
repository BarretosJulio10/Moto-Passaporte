-- =============================================================================
-- Comprovantes abertos pelo link de compartilhamento (PRD 11; KI-022; ADR-034)
-- - get_shared_passport passa a informar id e tipo de cada comprovante (só se o titular marcou
--   "mostrar comprovantes"). Sem o código do link, o id não dá acesso a nada.
-- - shared_attachment_for_download (service_role): a Edge Function shared-file pede o caminho do
--   arquivo; o banco confere o link (vigente, não revogado, criado pelo titular atual), as opções
--   (histórico e comprovantes), que o arquivo é comprovante de um serviço vigente daquela moto e
--   o limite de 60 aberturas por link por hora. Cada abertura fica registrada.
-- - Fotos do diário e arquivos sem serviço nunca saem pelo link.
-- Rollback: supabase/rollback/20261108025543_shared_files.down.sql
-- =============================================================================

create table if not exists public.passport_share_file_views (
  id            bigint generated always as identity primary key,
  share_id      uuid not null references public.passport_shares (id) on delete cascade,
  attachment_id uuid not null references public.attachments (id) on delete cascade,
  viewed_at     timestamptz not null default now()
);
create index if not exists passport_share_file_views_share_idx on public.passport_share_file_views (share_id, viewed_at desc);
create index if not exists passport_share_file_views_attachment_idx on public.passport_share_file_views (attachment_id);
alter table public.passport_share_file_views enable row level security;
revoke all on public.passport_share_file_views from public, anon, authenticated;
comment on table public.passport_share_file_views is 'Comprovantes abertos por links de compartilhamento (ADR-034). Sem dados do visitante.';

insert into public.system_settings (key, value, description, is_public) values
  ('share_file_views_per_hour', '60', 'Aberturas de comprovantes por link de compartilhamento, por hora', false)
on conflict (key) do nothing;

create or replace function public.shared_attachment_for_download(p_token text, p_attachment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.passport_shares;
  a public.attachments;
  v_limit int := public.setting_int('share_file_views_per_hour', 60);
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' or p_attachment_id is null then
    return null;
  end if;
  select * into s from public.passport_shares where token = p_token;
  if not found or s.revoked_at is not null or (s.expires_at is not null and s.expires_at <= now())
     or not s.show_history or not s.show_attachments then
    return null;
  end if;
  if not exists (select 1 from public.motorcycle_ownerships
                  where motorcycle_id = s.motorcycle_id and owner_user_id = s.created_by and ended_at is null)
     or not exists (select 1 from public.motorcycles where id = s.motorcycle_id and status = 'active') then
    return null;
  end if;
  select * into a from public.attachments where id = p_attachment_id and motorcycle_id = s.motorcycle_id;
  if not found or a.maintenance_record_id is null or a.diary_entry_id is not null then
    return null;
  end if;
  if not exists (select 1 from public.maintenance_timeline t
                  where t.id = a.maintenance_record_id and t.motorcycle_id = s.motorcycle_id
                    and t.status = 'current' and not t.is_void) then
    return null;
  end if;
  if (select count(*) from public.passport_share_file_views
       where share_id = s.id and viewed_at > now() - interval '1 hour') >= v_limit then
    raise exception 'Muitas aberturas por este link. Tente de novo mais tarde.' using errcode = 'P0001';
  end if;
  insert into public.passport_share_file_views (share_id, attachment_id) values (s.id, a.id);
  return jsonb_build_object('path', a.storage_path, 'file_name', a.file_name, 'mime_type', a.mime_type);
end;
$$;
revoke execute on function public.shared_attachment_for_download(text, uuid) from public, anon, authenticated;
grant execute on function public.shared_attachment_for_download(text, uuid) to service_role;

create or replace function public.get_shared_passport(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s public.passport_shares;
  m public.motorcycles;
  v_result jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    return null;
  end if;
  select * into s from public.passport_shares where token = p_token;
  if not found or s.revoked_at is not null or (s.expires_at is not null and s.expires_at <= now()) then
    return null;
  end if;
  if not exists (select 1 from public.motorcycle_ownerships
                 where motorcycle_id = s.motorcycle_id and owner_user_id = s.created_by and ended_at is null) then
    return null;
  end if;
  select * into m from public.motorcycles where id = s.motorcycle_id and status = 'active';
  if not found then
    return null;
  end if;

  update public.passport_shares set view_count = view_count + 1, last_viewed_at = now() where id = s.id;

  v_result := jsonb_build_object(
    'brand', m.brand, 'model', m.model, 'version', m.version,
    'manufacturing_year', m.manufacturing_year, 'model_year', m.model_year,
    'displacement_cc', m.displacement_cc, 'color', m.color,
    'passport_created_at', m.created_at,
    'shared_at', s.created_at, 'expires_at', s.expires_at,
    'options', jsonb_build_object(
      'plate', s.show_plate, 'mileage', s.show_mileage, 'history', s.show_history,
      'values', s.show_values, 'attachments', s.show_attachments, 'diary', s.show_diary),
    'origin_workshop', (
      select coalesce(w.business_name, o.name)
        from public.motorcycle_workshop_access a
        join public.organizations o on o.id = a.organization_id
        left join public.workshops w on w.organization_id = a.organization_id
       where a.motorcycle_id = m.id and a.access_type = 'origin' and a.status = 'approved'
       limit 1)
  );

  if s.show_plate then
    v_result := v_result || jsonb_build_object('plate',
      (select plate from public.motorcycle_plates where motorcycle_id = m.id and valid_until is null));
  end if;

  if s.show_mileage then
    v_result := v_result || jsonb_build_object('mileage', coalesce((
      select jsonb_agg(jsonb_build_object(
               'recorded_at', r.recorded_at, 'mileage', r.mileage, 'source_type', r.source_type,
               'below_previous', r.below_previous) order by r.recorded_at desc, r.created_at desc)
        from (select mr.* from public.mileage_records mr
               where mr.motorcycle_id = m.id
                 and not exists (select 1 from public.mileage_records c where c.corrects_record_id = mr.id)
               order by mr.recorded_at desc, mr.created_at desc limit 200) r
    ), '[]'::jsonb));
  end if;

  if s.show_history then
    v_result := v_result || jsonb_build_object('history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'service_date', t.service_date, 'category', t.category, 'title', t.title,
               'description', t.description, 'mileage', t.mileage,
               'evidence_level', t.evidence_level, 'workshop_name', t.workshop_name,
               'is_correction', t.corrects_record_id is not null,
               'items', (select coalesce(jsonb_agg(jsonb_build_object('item_name', i ->> 'item_name', 'brand', i ->> 'brand', 'quantity', i -> 'quantity')), '[]'::jsonb)
                           from jsonb_array_elements(t.items) i),
               'service_value_cents', case when s.show_values then t.service_value_cents end,
               'attachments', case when s.show_attachments then
                  (select coalesce(jsonb_agg(jsonb_build_object('id', a ->> 'id', 'kind', a ->> 'kind', 'mime_type', a ->> 'mime_type')), '[]'::jsonb) from jsonb_array_elements(t.attachments) a)
                end
             ) order by t.service_date desc, t.created_at desc)
        from (select * from public.maintenance_timeline v
               where v.motorcycle_id = m.id and v.status = 'current' and not v.is_void
               order by v.service_date desc, v.created_at desc limit 300) t
    ), '[]'::jsonb));
  end if;

  if s.show_diary then
    v_result := v_result || jsonb_build_object('diary', coalesce((
      select jsonb_agg(jsonb_build_object(
               'entry_date', d.entry_date, 'category', d.category, 'title', d.title,
               'body', d.body, 'location', d.location,
               'photo_count', (select count(*) from public.attachments a where a.diary_entry_id = d.id)
             ) order by d.entry_date desc, d.created_at desc)
        from (select * from public.motorcycle_diary
               where motorcycle_id = m.id and visibility = 'shareable'
               order by entry_date desc, created_at desc limit 100) d
    ), '[]'::jsonb));
  end if;

  return v_result;
end;
$function$;
