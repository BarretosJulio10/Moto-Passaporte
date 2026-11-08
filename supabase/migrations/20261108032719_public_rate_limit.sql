-- =============================================================================
-- Limite de consultas anônimas por conexão (KI-003; ADR-035)
-- Passaporte público (/p/...) e passaporte compartilhado (/c/...): até N consultas por hora por
-- conexão (padrão 120). A conexão é identificada por um resumo SHA-256 do IP com uma chave
-- secreta que muda todo dia — o IP nunca é guardado e não dá para seguir alguém de um dia para
-- o outro. Registros com mais de 2 dias são apagados. Sem IP no pedido, não há limite.
-- Rollback: supabase/rollback/20261108032719_public_rate_limit.down.sql
-- =============================================================================

create table if not exists public.anon_rate_limits (
  bucket       text not null check (bucket in ('public_passport', 'shared_passport')),
  key_hash     text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, key_hash, window_start)
);
create index if not exists anon_rate_limits_window_idx on public.anon_rate_limits (window_start);
alter table public.anon_rate_limits enable row level security;
revoke all on public.anon_rate_limits from public, anon, authenticated;
comment on table public.anon_rate_limits is
  'Contagem de consultas anônimas por hora (ADR-035). Só resumo do IP com chave diária; apagada após 2 dias.';

insert into public.system_settings (key, value, description, is_public) values
  ('public_passport_views_per_hour', '120', 'Consultas ao passaporte público por conexão, por hora', false),
  ('shared_passport_views_per_hour', '120', 'Consultas a passaportes compartilhados por conexão, por hora', false)
on conflict (key) do nothing;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'rate_limit_salt') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'rate_limit_salt',
                                'Chave do resumo de IP do limite de consultas anônimas (ADR-035)');
  end if;
end $$;

-- true = pode seguir. Uso interno (sem grant).
create or replace function public.anon_rate_limit_ok(p_bucket text, p_setting text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  v_ip text;
  v_hash text;
  v_hits int;
  v_limit int := public.setting_int(p_setting, 120);
begin
  v_ip := nullif(trim(coalesce(v_headers ->> 'cf-connecting-ip',
                               split_part(v_headers ->> 'x-forwarded-for', ',', 1),
                               v_headers ->> 'x-real-ip')), '');
  if v_ip is null then
    return true;
  end if;
  v_hash := encode(extensions.digest(
              v_ip || '|' || current_date::text || '|' ||
              coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'rate_limit_salt'), ''), 'sha256'), 'hex');
  insert into public.anon_rate_limits (bucket, key_hash, window_start, hits)
  values (p_bucket, v_hash, date_trunc('hour', now()), 1)
  on conflict (bucket, key_hash, window_start) do update set hits = public.anon_rate_limits.hits + 1
  returning hits into v_hits;
  if random() < 0.02 then
    delete from public.anon_rate_limits where window_start < now() - interval '2 days';
  end if;
  return v_hits <= v_limit;
end;
$$;
revoke execute on function public.anon_rate_limit_ok(text, text) from public, anon, authenticated;

create or replace function public.get_public_passport(p_public_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_public_id is null or p_public_id !~ '^[0-9a-f]{32}$' then
    return null;
  end if;
  if not public.anon_rate_limit_ok('public_passport', 'public_passport_views_per_hour') then
    raise exception 'Muitas consultas a partir desta conexão. Tente de novo em alguns minutos.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return (
    select jsonb_build_object(
      'public_id',           m.public_id,
      'brand',               m.brand,
      'model',               m.model,
      'version',             m.version,
      'manufacturing_year',  m.manufacturing_year,
      'model_year',          m.model_year,
      'displacement_cc',     m.displacement_cc,
      'color',               m.color,
      'passport_created_at', m.created_at
    )
    from public.motorcycles m
    left join public.passport_settings s on s.motorcycle_id = m.id
    where m.public_id = p_public_id
      and m.status = 'active'
      and coalesce(s.public_page_enabled, true));
end;
$function$;

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
  if not public.anon_rate_limit_ok('shared_passport', 'shared_passport_views_per_hour') then
    raise exception 'Muitas consultas a partir desta conexão. Tente de novo em alguns minutos.' using errcode = 'P0001', hint = 'rate_limited';
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
