-- =============================================================================
-- ROLLBACK de 20261108025543_shared_files (v0.33.0, ADR-034). Ver docs/OPERATIONS.md §4.
-- O link volta a mostrar só o tipo e a quantidade de comprovantes (sem abrir os arquivos).
-- Perde: registro das aberturas. Remover antes a Edge Function shared-file e publicar o site anterior.
-- =============================================================================
begin;
drop function if exists public.shared_attachment_for_download(text, uuid);
drop table if exists public.passport_share_file_views;
delete from public.system_settings where key = 'share_file_views_per_hour';
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
                  (select coalesce(jsonb_agg(jsonb_build_object('kind', a ->> 'kind')), '[]'::jsonb) from jsonb_array_elements(t.attachments) a)
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
commit;
