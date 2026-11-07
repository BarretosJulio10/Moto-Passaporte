-- =============================================================================
-- Moto Passaporte — Migração 0400: motocicletas, placas, titularidade e quilometragem
-- Objetivo: identidade permanente (PRD 9), histórico de placas, titularidade
--           do passaporte, chassi protegido, quilometragem (PRD 5.6) e
--           pedidos de verificação de duplicidade (ADR-007).
-- Dependências: 0100_base, 0200_identity, 0300_organizations.
-- Reversão: remover view, funções, tabelas e tipos desta migração.
-- =============================================================================

create type public.motorcycle_status as enum ('active', 'archived');
create type public.record_source     as enum ('owner', 'workshop', 'document');
create type public.claim_status      as enum ('pending', 'approved', 'rejected', 'canceled');

-- -----------------------------------------------------------------------------
-- Motocicletas — identidade permanente
-- -----------------------------------------------------------------------------

create table public.motorcycles (
  id                 uuid primary key default gen_random_uuid(),
  -- Identificador público não previsível (QR Code / link). Não é chave de autorização.
  public_id          text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  brand              text not null check (char_length(brand) between 1 and 60),
  model              text not null check (char_length(model) between 1 and 80),
  version            text check (version is null or char_length(version) <= 80),
  manufacturing_year smallint not null check (manufacturing_year between 1885 and 2100),
  model_year         smallint check (model_year is null or model_year between manufacturing_year and manufacturing_year + 1),
  displacement_cc    integer check (displacement_cc is null or displacement_cc between 1 and 10000),
  color              text check (color is null or char_length(color) <= 40),
  initial_notes      text check (initial_notes is null or char_length(initial_notes) <= 2000),
  status             public.motorcycle_status not null default 'active',
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.motorcycles is
  'Identidade permanente da moto. O id é imutável e independente de placa e proprietário.';

-- Garante a imutabilidade da identidade e impede exclusão.
create or replace function public.protect_motorcycle_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Motocicletas não podem ser excluídas: a identidade é permanente.' using errcode = '42501';
  end if;
  if new.id <> old.id
     or new.public_id <> old.public_id
     or new.created_at <> old.created_at
     or (new.created_by is distinct from old.created_by and new.created_by is not null) then
    raise exception 'Campos de identidade da motocicleta são imutáveis.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger motorcycles_protect_identity
  before update or delete on public.motorcycles
  for each row execute function public.protect_motorcycle_identity();

create trigger motorcycles_updated_at
  before update on public.motorcycles
  for each row execute function public.set_updated_at();

create trigger motorcycles_audit
  after insert or update on public.motorcycles
  for each row execute function public.audit_row_change('id', '');

-- -----------------------------------------------------------------------------
-- Histórico de placas
-- -----------------------------------------------------------------------------

create table public.motorcycle_plates (
  id            uuid primary key default gen_random_uuid(),
  motorcycle_id uuid not null references public.motorcycles (id) on delete restrict,
  plate         text not null check (public.is_valid_plate(plate) and plate = public.normalize_plate(plate)),
  valid_from    timestamptz not null default now(),
  valid_until   timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);

-- Uma placa ativa pertence a uma única moto; uma moto tem uma única placa ativa.
create unique index motorcycle_plates_active_plate_uidx on public.motorcycle_plates (plate) where valid_until is null;
create unique index motorcycle_plates_active_moto_uidx  on public.motorcycle_plates (motorcycle_id) where valid_until is null;
create index motorcycle_plates_moto_idx on public.motorcycle_plates (motorcycle_id, valid_from desc);

-- Só é permitido encerrar a vigência de uma placa ativa.
create or replace function public.protect_plate_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Histórico de placas não pode ser excluído.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by') and new.created_by is null then
    return new;
  end if;
  if old.valid_until is not null
     or new.valid_until is null
     or (to_jsonb(new) - 'valid_until') <> (to_jsonb(old) - 'valid_until') then
    raise exception 'Histórico de placas: apenas o encerramento da placa ativa é permitido.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger motorcycle_plates_protect
  before update or delete on public.motorcycle_plates
  for each row execute function public.protect_plate_history();

create trigger motorcycle_plates_audit
  after insert or update on public.motorcycle_plates
  for each row execute function public.audit_row_change('motorcycle_id', '');

-- -----------------------------------------------------------------------------
-- Titularidade do passaporte
-- -----------------------------------------------------------------------------

create table public.motorcycle_ownerships (
  id               uuid primary key default gen_random_uuid(),
  motorcycle_id    uuid not null references public.motorcycles (id) on delete restrict,
  -- RESTRICT: excluir uma conta não pode apagar a história da moto (PRD 14.16).
  owner_user_id    uuid not null references auth.users (id) on delete restrict,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  end_reason       text check (end_reason is null or end_reason in ('transfer', 'admin')),
  acquisition_date date,
  transfer_id      uuid, -- FK para transfer_requests na Fase 4
  created_at       timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  check ((ended_at is null) = (end_reason is null))
);

comment on table public.motorcycle_ownerships is
  'Titularidade do PASSAPORTE na plataforma. Não representa propriedade legal nem transferência no DETRAN.';

-- Apenas uma titularidade atual por motocicleta.
create unique index motorcycle_ownerships_current_uidx on public.motorcycle_ownerships (motorcycle_id) where ended_at is null;
create index motorcycle_ownerships_owner_idx on public.motorcycle_ownerships (owner_user_id) where ended_at is null;

-- Só é permitido encerrar a titularidade atual (fluxo de transferência, Fase 4).
create or replace function public.protect_ownership_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Histórico de titularidade não pode ser excluído.' using errcode = '42501';
  end if;
  if old.ended_at is not null
     or new.ended_at is null
     or (to_jsonb(new) - 'ended_at' - 'end_reason' - 'transfer_id') <> (to_jsonb(old) - 'ended_at' - 'end_reason' - 'transfer_id') then
    raise exception 'Histórico de titularidade: apenas o encerramento da titularidade atual é permitido.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger motorcycle_ownerships_protect
  before update or delete on public.motorcycle_ownerships
  for each row execute function public.protect_ownership_history();

create trigger motorcycle_ownerships_audit
  after insert or update on public.motorcycle_ownerships
  for each row execute function public.audit_row_change('motorcycle_id', '');

create or replace function public.is_current_owner(p_motorcycle uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.motorcycle_ownerships
    where motorcycle_id = p_motorcycle and owner_user_id = auth.uid() and ended_at is null
  );
$$;

revoke execute on function public.is_current_owner(uuid) from public, anon;
grant  execute on function public.is_current_owner(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Dados privados da moto (chassi) — acesso apenas do titular atual
-- -----------------------------------------------------------------------------

create table public.motorcycle_private (
  motorcycle_id uuid primary key references public.motorcycles (id) on delete restrict,
  chassis       text check (chassis is null or chassis ~ '^[A-Z0-9]{5,30}$'),
  updated_at    timestamptz not null default now()
);

comment on table public.motorcycle_private is
  'Chassi completo. Nunca exposto publicamente. Criptografia em coluna pendente (D-T3).';

create trigger motorcycle_private_updated_at
  before update on public.motorcycle_private
  for each row execute function public.set_updated_at();

-- Auditoria sem gravar o valor do chassi.
create or replace function public.audit_chassis_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.chassis is distinct from old.chassis then
    perform public.write_audit('motorcycle_private', new.motorcycle_id::text, 'chassis_changed', new.motorcycle_id);
  end if;
  return new;
end;
$$;

create trigger motorcycle_private_audit
  after update on public.motorcycle_private
  for each row execute function public.audit_chassis_change();

create or replace function public.prevent_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Exclusão não permitida em %.', tg_table_name using errcode = '42501';
end;
$$;

create trigger motorcycle_private_no_delete
  before delete on public.motorcycle_private
  for each row execute function public.prevent_delete();

-- -----------------------------------------------------------------------------
-- Quilometragem — leituras imutáveis; correção = novo registro
-- -----------------------------------------------------------------------------

create table public.mileage_records (
  id                 uuid primary key default gen_random_uuid(),
  motorcycle_id      uuid not null references public.motorcycles (id) on delete restrict,
  mileage            integer not null check (mileage between 0 and 2000000),
  recorded_at        date not null,
  source_type        public.record_source not null,
  created_by         uuid references auth.users (id) on delete set null,
  organization_id    uuid references public.organizations (id) on delete restrict,
  evidence_id        uuid, -- FK para attachments na Fase 2
  note               text check (note is null or char_length(note) <= 500),
  corrects_record_id uuid references public.mileage_records (id) on delete restrict,
  below_previous     boolean not null default false,
  created_at         timestamptz not null default now(),
  check (source_type <> 'workshop' or organization_id is not null)
);

comment on column public.mileage_records.below_previous is
  'Alerta de possível inconsistência: valor menor que leitura anterior. Não presume fraude (PRD 5.6).';

create index mileage_records_moto_idx on public.mileage_records (motorcycle_id, recorded_at desc, created_at desc);

-- Marca leituras inferiores ao histórico anterior.
create or replace function public.flag_mileage_inconsistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.below_previous := exists (
    select 1 from public.mileage_records
    where motorcycle_id = new.motorcycle_id
      and recorded_at <= new.recorded_at
      and mileage > new.mileage
  );
  return new;
end;
$$;

create trigger mileage_records_flag
  before insert on public.mileage_records
  for each row execute function public.flag_mileage_inconsistency();

create trigger mileage_records_immutable
  before update or delete on public.mileage_records
  for each row execute function public.prevent_history_mutation();

create trigger mileage_records_audit
  after insert on public.mileage_records
  for each row execute function public.audit_row_change('motorcycle_id', 'organization_id');

-- -----------------------------------------------------------------------------
-- Pedidos de verificação de duplicidade (ADR-007)
-- -----------------------------------------------------------------------------

create table public.motorcycle_claim_requests (
  id              uuid primary key default gen_random_uuid(),
  plate           text not null,
  requested_by    uuid not null references auth.users (id) on delete cascade,
  -- Oculto do solicitante (sem permissão de coluna).
  motorcycle_id   uuid references public.motorcycles (id) on delete restrict,
  status          public.claim_status not null default 'pending',
  requester_note  text check (requester_note is null or char_length(requester_note) <= 1000),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  resolved_by     uuid references auth.users (id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index motorcycle_claim_requests_requester_idx on public.motorcycle_claim_requests (requested_by, created_at desc);
create index motorcycle_claim_requests_pending_idx   on public.motorcycle_claim_requests (created_at) where status = 'pending';

-- -----------------------------------------------------------------------------
-- RLS e permissões
-- Escritas estruturais acontecem somente pelas funções abaixo.
-- -----------------------------------------------------------------------------

alter table public.motorcycles               enable row level security;
alter table public.motorcycle_plates         enable row level security;
alter table public.motorcycle_ownerships     enable row level security;
alter table public.motorcycle_private        enable row level security;
alter table public.mileage_records           enable row level security;
alter table public.motorcycle_claim_requests enable row level security;

revoke all on public.motorcycles               from anon, authenticated;
revoke all on public.motorcycle_plates         from anon, authenticated;
revoke all on public.motorcycle_ownerships     from anon, authenticated;
revoke all on public.motorcycle_private        from anon, authenticated;
revoke all on public.mileage_records           from anon, authenticated;
revoke all on public.motorcycle_claim_requests from anon, authenticated;

grant select on public.motorcycles           to authenticated;
grant update (brand, model, version, manufacturing_year, model_year, displacement_cc, color, initial_notes)
  on public.motorcycles to authenticated;
grant select on public.motorcycle_plates     to authenticated;
grant select on public.motorcycle_ownerships to authenticated;
grant select on public.motorcycle_private    to authenticated;
grant update (chassis) on public.motorcycle_private to authenticated;
grant select on public.mileage_records       to authenticated;
grant select (id, plate, status, requester_note, created_at, resolved_at)
  on public.motorcycle_claim_requests to authenticated;

-- Motocicletas: titular atual (acesso de oficinas entra na Fase 3).
create policy motorcycles_select on public.motorcycles
  for select to authenticated
  using (public.is_current_owner(id) or public.is_admin());

create policy motorcycles_update_owner on public.motorcycles
  for update to authenticated
  using (public.is_current_owner(id))
  with check (public.is_current_owner(id));

create policy motorcycle_plates_select on public.motorcycle_plates
  for select to authenticated
  using (public.is_current_owner(motorcycle_id));

-- Cada usuário vê apenas as próprias titularidades (atuais ou passadas).
create policy motorcycle_ownerships_select on public.motorcycle_ownerships
  for select to authenticated
  using (owner_user_id = auth.uid());

create policy motorcycle_private_select on public.motorcycle_private
  for select to authenticated
  using (public.is_current_owner(motorcycle_id));

create policy motorcycle_private_update on public.motorcycle_private
  for update to authenticated
  using (public.is_current_owner(motorcycle_id))
  with check (public.is_current_owner(motorcycle_id));

create policy mileage_records_select on public.mileage_records
  for select to authenticated
  using (public.is_current_owner(motorcycle_id));

create policy motorcycle_claim_requests_select on public.motorcycle_claim_requests
  for select to authenticated
  using (requested_by = auth.uid());

-- -----------------------------------------------------------------------------
-- Operação: cadastrar motocicleta (PRD 5.2)
-- Retorna {status: 'created', motorcycle_id, public_id}
--      ou {status: 'verification_required', claim_id} se a placa já estiver ativa.
-- -----------------------------------------------------------------------------

create or replace function public.register_motorcycle(
  p_brand              text,
  p_model              text,
  p_manufacturing_year integer,
  p_plate              text,
  p_current_mileage    integer,
  p_version            text    default null,
  p_model_year         integer default null,
  p_displacement_cc    integer default null,
  p_color              text    default null,
  p_chassis            text    default null,
  p_acquisition_date   date    default null,
  p_initial_notes      text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_plate    text := public.normalize_plate(p_plate);
  v_chassis  text := nullif(public.normalize_plate(p_chassis), '');
  v_rate     int;
  v_attempts int;
  v_limit    int;
  v_count    int;
  v_existing uuid;
  v_claim    uuid;
  v_moto     uuid;
  v_public   text;
begin
  if v_uid is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  -- Limite de tentativas por hora (proteção contra descoberta de placas).
  select coalesce((value #>> '{}')::int, 10) into v_rate
    from public.system_settings where key = 'registration_rate_limit_per_hour';
  select count(*) into v_attempts from (
    select 1 from public.motorcycles where created_by = v_uid and created_at > now() - interval '1 hour'
    union all
    select 1 from public.motorcycle_claim_requests where requested_by = v_uid and created_at > now() - interval '1 hour'
  ) t;
  if v_attempts >= coalesce(v_rate, 10) then
    raise exception 'Muitas tentativas de cadastro. Tente novamente mais tarde.' using errcode = 'P0001';
  end if;

  -- Limite do plano (Fase 5 passará a considerar a assinatura Premium).
  select coalesce((value #>> '{}')::int, 1) into v_limit
    from public.system_settings where key = 'free_plan_max_motorcycles';
  select count(*) into v_count
    from public.motorcycle_ownerships where owner_user_id = v_uid and ended_at is null;
  if v_count >= coalesce(v_limit, 1) then
    raise exception 'Limite de motocicletas do seu plano atingido.' using errcode = 'P0001';
  end if;

  -- Validações
  if not public.is_valid_plate(v_plate) then
    raise exception 'Placa inválida. Use o formato ABC1234 ou ABC1D23.' using errcode = '22023';
  end if;
  if p_manufacturing_year is null
     or p_manufacturing_year < 1885
     or p_manufacturing_year > extract(year from now())::int + 1 then
    raise exception 'Ano de fabricação inválido.' using errcode = '22023';
  end if;
  if p_current_mileage is null or p_current_mileage < 0 then
    raise exception 'Quilometragem inválida.' using errcode = '22023';
  end if;
  if p_acquisition_date is not null and p_acquisition_date > current_date then
    raise exception 'Data de aquisição não pode estar no futuro.' using errcode = '22023';
  end if;

  -- Duplicidade: não revela dados da moto existente.
  select motorcycle_id into v_existing
    from public.motorcycle_plates where plate = v_plate and valid_until is null;

  if v_existing is not null then
    insert into public.motorcycle_claim_requests (plate, requested_by, motorcycle_id)
    values (v_plate, v_uid, v_existing)
    returning id into v_claim;

    perform public.write_audit('motorcycle_claim_requests', v_claim::text, 'duplicate_plate_claim', v_existing);
    return jsonb_build_object('status', 'verification_required', 'claim_id', v_claim);
  end if;

  insert into public.motorcycles
    (brand, model, version, manufacturing_year, model_year, displacement_cc, color, initial_notes, created_by)
  values
    (trim(p_brand), trim(p_model), nullif(trim(p_version), ''), p_manufacturing_year, p_model_year,
     p_displacement_cc, nullif(trim(p_color), ''), nullif(trim(p_initial_notes), ''), v_uid)
  returning id, public_id into v_moto, v_public;

  insert into public.motorcycle_plates (motorcycle_id, plate, created_by)
  values (v_moto, v_plate, v_uid);

  insert into public.motorcycle_ownerships (motorcycle_id, owner_user_id, acquisition_date)
  values (v_moto, v_uid, p_acquisition_date);

  insert into public.motorcycle_private (motorcycle_id, chassis)
  values (v_moto, v_chassis);

  insert into public.mileage_records (motorcycle_id, mileage, recorded_at, source_type, created_by, note)
  values (v_moto, p_current_mileage, current_date, 'owner', v_uid, 'Quilometragem inicial informada no cadastro');

  return jsonb_build_object('status', 'created', 'motorcycle_id', v_moto, 'public_id', v_public);

exception
  when unique_violation then
    -- Corrida entre dois cadastros simultâneos da mesma placa.
    raise exception 'Não foi possível concluir o cadastro. Tente novamente.' using errcode = 'P0001';
end;
$$;

-- -----------------------------------------------------------------------------
-- Operação: trocar a placa (histórico preservado, mesma identidade)
-- -----------------------------------------------------------------------------

create or replace function public.change_motorcycle_plate(p_motorcycle_id uuid, p_new_plate text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plate   text := public.normalize_plate(p_new_plate);
  v_current text;
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if not public.is_valid_plate(v_plate) then
    raise exception 'Placa inválida. Use o formato ABC1234 ou ABC1D23.' using errcode = '22023';
  end if;

  select plate into v_current
    from public.motorcycle_plates
    where motorcycle_id = p_motorcycle_id and valid_until is null
    for update;

  if v_current = v_plate then
    return;
  end if;

  if exists (select 1 from public.motorcycle_plates where plate = v_plate and valid_until is null) then
    raise exception 'Esta placa não pode ser utilizada. Se acredita que é um erro, contate o suporte.' using errcode = 'P0001';
  end if;

  update public.motorcycle_plates
    set valid_until = now()
    where motorcycle_id = p_motorcycle_id and valid_until is null;

  insert into public.motorcycle_plates (motorcycle_id, plate, created_by)
  values (p_motorcycle_id, v_plate, auth.uid());
end;
$$;

-- -----------------------------------------------------------------------------
-- Operação: registrar quilometragem (proprietário)
-- Retorna {id, below_previous}
-- -----------------------------------------------------------------------------

create or replace function public.record_mileage(
  p_motorcycle_id      uuid,
  p_mileage            integer,
  p_recorded_at        date default current_date,
  p_note               text default null,
  p_corrects_record_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_below boolean;
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if p_mileage is null or p_mileage < 0 then
    raise exception 'Quilometragem inválida.' using errcode = '22023';
  end if;
  if p_recorded_at is null or p_recorded_at > current_date then
    raise exception 'Data da leitura inválida.' using errcode = '22023';
  end if;
  if p_corrects_record_id is not null and not exists (
       select 1 from public.mileage_records
       where id = p_corrects_record_id and motorcycle_id = p_motorcycle_id) then
    raise exception 'Registro a corrigir não encontrado nesta motocicleta.' using errcode = '22023';
  end if;
  if p_corrects_record_id is not null and nullif(trim(p_note), '') is null then
    raise exception 'Informe o motivo da correção.' using errcode = '22023';
  end if;

  insert into public.mileage_records
    (motorcycle_id, mileage, recorded_at, source_type, created_by, note, corrects_record_id)
  values
    (p_motorcycle_id, p_mileage, p_recorded_at, 'owner', auth.uid(), nullif(trim(p_note), ''), p_corrects_record_id)
  returning id, below_previous into v_id, v_below;

  return jsonb_build_object('id', v_id, 'below_previous', v_below);
end;
$$;

revoke execute on function public.register_motorcycle(text, text, integer, text, integer, text, integer, integer, text, text, date, text) from public, anon;
revoke execute on function public.change_motorcycle_plate(uuid, text) from public, anon;
revoke execute on function public.record_mileage(uuid, integer, date, text, uuid) from public, anon;
grant  execute on function public.register_motorcycle(text, text, integer, text, integer, text, integer, integer, text, text, date, text) to authenticated;
grant  execute on function public.change_motorcycle_plate(uuid, text) to authenticated;
grant  execute on function public.record_mileage(uuid, integer, date, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- View: minhas motocicletas (respeita RLS do usuário — security_invoker)
-- -----------------------------------------------------------------------------

create view public.my_motorcycles
with (security_invoker = true)
as
select
  m.id,
  m.public_id,
  m.brand,
  m.model,
  m.version,
  m.manufacturing_year,
  m.model_year,
  m.displacement_cc,
  m.color,
  m.status,
  m.created_at as passport_created_at,
  p.plate      as current_plate,
  o.started_at as owned_since,
  o.acquisition_date,
  lm.mileage     as latest_mileage,
  lm.recorded_at as latest_mileage_at
from public.motorcycles m
join public.motorcycle_ownerships o
  on o.motorcycle_id = m.id and o.ended_at is null and o.owner_user_id = auth.uid()
left join public.motorcycle_plates p
  on p.motorcycle_id = m.id and p.valid_until is null
left join lateral (
  select mr.mileage, mr.recorded_at
  from public.mileage_records mr
  where mr.motorcycle_id = m.id
  order by mr.recorded_at desc, mr.created_at desc
  limit 1
) lm on true;

revoke all on public.my_motorcycles from anon, authenticated;
grant select on public.my_motorcycles to authenticated;
