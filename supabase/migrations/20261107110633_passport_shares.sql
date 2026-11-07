-- =============================================================================
-- Moto Passaporte — Migração: compartilhamento controlado (Fase 4, PRD 11; itens 4.4, 4.5; ADR-017)
-- Objetivo: o titular cria links de compartilhamento com código imprevisível,
--           escolhe o que mostrar, define validade opcional e revoga quando
--           quiser. Links valem só enquanto quem criou é o titular (venda
--           encerra os links do antigo dono). A página pública básica (QR Code
--           permanente, ADR-008) pode ser desativada pelo titular (resolve KI-013).
--           Nunca expõe: dados pessoais, chassi, autoria de pessoas, observações
--           privadas, diário privado. Arquivos dos comprovantes não são expostos
--           (só quantidade e tipo) até existir assinatura no servidor (KI-022).
-- Dependências: motorcycles, maintenance, attachments, diary, workshop_access.
-- Reversão: drop functions create_passport_share, revoke_passport_share,
--           get_motorcycle_shares, get_shared_passport, set_public_page_enabled,
--           get_passport_settings, protect_passport_share; recriar
--           get_public_passport da migração public_passport; drop tables
--           passport_shares, passport_settings.
-- =============================================================================

create table public.passport_settings (
  motorcycle_id       uuid primary key references public.motorcycles (id) on delete restrict,
  public_page_enabled boolean not null default true,
  updated_by          uuid references auth.users (id) on delete set null,
  updated_at          timestamptz not null default now()
);
comment on table public.passport_settings is 'Preferências de exibição pública do passaporte (página básica do QR Code permanente).';
create index passport_settings_updated_by_idx on public.passport_settings (updated_by);

create trigger passport_settings_audit
  after insert or update on public.passport_settings
  for each row execute function public.audit_row_change('motorcycle_id', '');

alter table public.passport_settings enable row level security;
revoke all on public.passport_settings from anon, authenticated;

create table public.passport_shares (
  id               uuid primary key default gen_random_uuid(),
  motorcycle_id    uuid not null references public.motorcycles (id) on delete restrict,
  token            text not null unique check (token ~ '^[0-9a-f]{48}$'),
  label            text check (label is null or char_length(label) <= 60),
  show_plate       boolean not null default false,
  show_mileage     boolean not null default true,
  show_history     boolean not null default true,
  show_values      boolean not null default false,
  show_attachments boolean not null default false,
  show_diary       boolean not null default false,
  expires_at       timestamptz,
  revoked_at       timestamptz,
  view_count       integer not null default 0,
  last_viewed_at   timestamptz,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  check (expires_at is null or expires_at > created_at)
);
comment on table public.passport_shares is
  'Links de compartilhamento do passaporte (PRD 11). Código imprevisível; revogáveis; valem só enquanto quem criou é o titular.';

create index passport_shares_moto_idx on public.passport_shares (motorcycle_id, created_at desc);
create index passport_shares_created_by_idx on public.passport_shares (created_by);

-- Opções e código não mudam; só revogação (uma vez), contagem de acessos e autoria nula.
create or replace function public.protect_passport_share()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Links de compartilhamento não são excluídos; revogue.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'revoked_at' - 'view_count' - 'last_viewed_at' - 'created_by')
     <> (to_jsonb(old) - 'revoked_at' - 'view_count' - 'last_viewed_at' - 'created_by')
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
     or (new.created_by is not null and new.created_by is distinct from old.created_by)
     or new.view_count < old.view_count then
    raise exception 'Link de compartilhamento não pode ser alterado; crie outro.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_passport_share() from public, anon, authenticated;

create trigger passport_shares_protect
  before update or delete on public.passport_shares
  for each row execute function public.protect_passport_share();

-- Auditoria de criação e revogação (contagem de acessos não gera log).
create trigger passport_shares_audit_insert
  after insert on public.passport_shares
  for each row execute function public.audit_row_change('motorcycle_id', '');
create trigger passport_shares_audit_revoke
  after update of revoked_at on public.passport_shares
  for each row when (old.revoked_at is null and new.revoked_at is not null)
  execute function public.audit_row_change('motorcycle_id', '');

alter table public.passport_shares enable row level security;
revoke all on public.passport_shares from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Página pública básica: pode ser desativada
-- -----------------------------------------------------------------------------

create or replace function public.get_public_passport(p_public_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
  where p_public_id ~ '^[0-9a-f]{32}$'
    and m.public_id = p_public_id
    and m.status = 'active'
    and coalesce(s.public_page_enabled, true);
$$;

create or replace function public.get_passport_settings(p_motorcycle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return jsonb_build_object('public_page_enabled',
    coalesce((select public_page_enabled from public.passport_settings where motorcycle_id = p_motorcycle_id), true));
end;
$$;
revoke execute on function public.get_passport_settings(uuid) from public, anon;
grant  execute on function public.get_passport_settings(uuid) to authenticated;

create or replace function public.set_public_page_enabled(p_motorcycle_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  insert into public.passport_settings (motorcycle_id, public_page_enabled, updated_by, updated_at)
  values (p_motorcycle_id, coalesce(p_enabled, true), auth.uid(), now())
  on conflict (motorcycle_id) do update
    set public_page_enabled = excluded.public_page_enabled, updated_by = excluded.updated_by, updated_at = now();
end;
$$;
revoke execute on function public.set_public_page_enabled(uuid, boolean) from public, anon;
grant  execute on function public.set_public_page_enabled(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Links de compartilhamento (titular)
-- -----------------------------------------------------------------------------

create or replace function public.create_passport_share(
  p_motorcycle_id    uuid,
  p_label            text    default null,
  p_expires_in_days  integer default null,
  p_show_plate       boolean default false,
  p_show_mileage     boolean default true,
  p_show_history     boolean default true,
  p_show_values      boolean default false,
  p_show_attachments boolean default false,
  p_show_diary       boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id    uuid;
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if p_label is not null and char_length(trim(p_label)) > 60 then
    raise exception 'O nome do link pode ter até 60 caracteres.' using errcode = '22023';
  end if;
  if p_expires_in_days is not null and p_expires_in_days not between 1 and 365 then
    raise exception 'Validade entre 1 e 365 dias.' using errcode = '22023';
  end if;
  if (select count(*) from public.passport_shares
       where motorcycle_id = p_motorcycle_id and created_by = auth.uid() and revoked_at is null
         and (expires_at is null or expires_at > now())) >= 10 then
    raise exception 'Limite de 10 links ativos. Revogue algum antes de criar outro.' using errcode = 'P0001';
  end if;

  insert into public.passport_shares
    (motorcycle_id, token, label, show_plate, show_mileage, show_history, show_values, show_attachments, show_diary, expires_at, created_by)
  values
    (p_motorcycle_id, v_token, nullif(trim(p_label), ''),
     coalesce(p_show_plate, false), coalesce(p_show_mileage, true), coalesce(p_show_history, true),
     coalesce(p_show_values, false) and coalesce(p_show_history, true),
     coalesce(p_show_attachments, false) and coalesce(p_show_history, true),
     coalesce(p_show_diary, false),
     case when p_expires_in_days is null then null else now() + make_interval(days => p_expires_in_days) end,
     auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;
revoke execute on function public.create_passport_share(uuid, text, integer, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant  execute on function public.create_passport_share(uuid, text, integer, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

create or replace function public.revoke_passport_share(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.passport_shares;
begin
  select * into s from public.passport_shares where id = p_share_id for update;
  if not found or not public.is_current_owner(s.motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if s.revoked_at is not null then
    raise exception 'Este link já foi revogado.' using errcode = 'P0001';
  end if;
  update public.passport_shares set revoked_at = now() where id = p_share_id;
end;
$$;
revoke execute on function public.revoke_passport_share(uuid) from public, anon;
grant  execute on function public.revoke_passport_share(uuid) to authenticated;

create or replace function public.get_motorcycle_shares(p_motorcycle_id uuid)
returns table (
  id uuid, token text, label text, status text,
  show_plate boolean, show_mileage boolean, show_history boolean, show_values boolean,
  show_attachments boolean, show_diary boolean,
  expires_at timestamptz, revoked_at timestamptz, view_count integer, last_viewed_at timestamptz, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select s.id, s.token, s.label,
           case when s.revoked_at is not null then 'revoked'
                when s.expires_at is not null and s.expires_at <= now() then 'expired'
                else 'active' end,
           s.show_plate, s.show_mileage, s.show_history, s.show_values, s.show_attachments, s.show_diary,
           s.expires_at, s.revoked_at, s.view_count, s.last_viewed_at, s.created_at
      from public.passport_shares s
     where s.motorcycle_id = p_motorcycle_id and s.created_by = auth.uid()
     order by (s.revoked_at is null and (s.expires_at is null or s.expires_at > now())) desc, s.created_at desc;
end;
$$;
revoke execute on function public.get_motorcycle_shares(uuid) from public, anon;
grant  execute on function public.get_motorcycle_shares(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Leitura pública pelo código (sem cadastro). NULL para qualquer link inválido.
-- -----------------------------------------------------------------------------

create or replace function public.get_shared_passport(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
  -- Vale só enquanto quem criou continua titular (venda encerra o link).
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
$$;
revoke execute on function public.get_shared_passport(text) from public;
grant  execute on function public.get_shared_passport(text) to anon, authenticated;
