-- =============================================================================
-- Fase 5.1 — Planos e preços configuráveis (PRD 4, 7.4, 8.5, 8.6; ADR-018)
-- - subscription_plans: catálogo interno (gratuito + Premium por periodicidade),
--   configurável pelo administrador sem alterar código.
-- - subscription_plan_versions: histórico imutável de cada alteração (quem, quando, o quê).
-- - Limites (motos e espaço) passam a vir do plano vigente do usuário; hoje o
--   gratuito (assinaturas pagas entram com o Mercado Pago, itens 5.2 e 5.4).
-- - As configurações free_plan_max_motorcycles e free_plan_storage_quota_mb deixam
--   de ser lidas (o plano gratuito passa a ser a única fonte; remoção em KI-023).
-- Rollback: restaurar register_motorcycle,
--   get_storage_usage e accept_transfer_request das migrações anteriores e
--   remover as funções e tabelas desta migração.
-- =============================================================================

create table public.subscription_plans (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  kind              text not null check (kind in ('free', 'premium')),
  billing_period    text not null check (billing_period in ('none', 'monthly', 'semiannual', 'annual')),
  name              text not null check (char_length(name) between 2 and 60),
  description       text check (char_length(description) <= 300),
  price_cents       int  not null check (price_cents between 0 and 1000000),
  currency          text not null default 'BRL' check (currency = 'BRL'),
  price_note        text check (char_length(price_note) <= 40),
  max_motorcycles   int  not null check (max_motorcycles between 1 and 100),
  storage_quota_mb  int  not null check (storage_quota_mb between 1 and 100000),
  features          text[] not null default '{}'
                    check (cardinality(features) <= 12),
  trial_days        int  not null default 0 check (trial_days between 0 and 90),
  cancellation_text text check (char_length(cancellation_text) <= 1000),
  is_active         boolean not null default true,
  is_public         boolean not null default true,
  sort_order        int  not null default 100 check (sort_order between 0 and 999),
  version           int  not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null,
  constraint subscription_plans_kind_rules check (
    (kind = 'free' and billing_period = 'none' and price_cents = 0 and trial_days = 0)
    or (kind = 'premium' and billing_period <> 'none' and price_cents > 0)
  )
);

comment on table public.subscription_plans is
  'Catálogo de planos (PRD 8.6). Alterar um plano não muda contratos existentes: a assinatura guarda o preço contratado (8.5).';

-- Só um plano gratuito.
create unique index subscription_plans_one_free on public.subscription_plans ((true)) where kind = 'free';

create table public.subscription_plan_versions (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.subscription_plans (id) on delete restrict,
  version    int  not null,
  snapshot   jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  unique (plan_id, version)
);

comment on table public.subscription_plan_versions is
  'Histórico imutável de alterações comerciais dos planos (PRD 7.4).';

create index subscription_plan_versions_created_by on public.subscription_plan_versions (created_by);

-- Regras: código, tipo e periodicidade não mudam; plano não é apagado; gratuito sempre ativo.
create or replace function public.protect_subscription_plans()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Planos não são excluídos; desative.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    -- Conta de quem alterou foi removida: só limpa a referência.
    if (to_jsonb(new) - 'updated_by') = (to_jsonb(old) - 'updated_by') and new.updated_by is null then
      return new;
    end if;
    if new.code <> old.code or new.kind <> old.kind or new.billing_period <> old.billing_period
       or new.created_at <> old.created_at then
      raise exception 'Código, tipo e periodicidade do plano não mudam; crie outro plano.' using errcode = 'P0001';
    end if;
    new.version := old.version + 1;
  else
    new.version := 1;
  end if;
  if new.kind = 'free' and (not new.is_active or not new.is_public) then
    raise exception 'O plano gratuito fica sempre ativo e visível.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(new.features) f where char_length(f) not between 1 and 120) then
    raise exception 'Cada benefício deve ter de 1 a 120 caracteres.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger subscription_plans_protect
  before insert or update or delete on public.subscription_plans
  for each row execute function public.protect_subscription_plans();

create or replace function public.record_subscription_plan_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.version = old.version then
    return null;
  end if;
  insert into public.subscription_plan_versions (plan_id, version, snapshot, created_by)
  values (new.id, new.version,
          to_jsonb(new) - 'id' - 'version' - 'created_at' - 'updated_at' - 'updated_by',
          auth.uid());
  return null;
end;
$$;

revoke execute on function public.record_subscription_plan_version() from public, anon, authenticated;

create trigger subscription_plans_version
  after insert or update on public.subscription_plans
  for each row execute function public.record_subscription_plan_version();

create trigger subscription_plans_audit
  after insert or update or delete on public.subscription_plans
  for each row execute function public.audit_row_change('', '');

create trigger subscription_plan_versions_immutable
  before update or delete on public.subscription_plan_versions
  for each row execute function public.prevent_history_mutation();

alter table public.subscription_plans enable row level security;
alter table public.subscription_plan_versions enable row level security;
revoke all on public.subscription_plans from anon, authenticated;
revoke all on public.subscription_plan_versions from anon, authenticated;
-- Sem políticas: leitura e escrita só pelas funções abaixo.

-- Plano inicial (PRD 4.1, 4.2, 4.3, 13.2). Valores do Premium são propostas (P-1).
insert into public.subscription_plans
  (code, kind, billing_period, name, description, price_cents, price_note, max_motorcycles, storage_quota_mb, features, sort_order)
values
  ('gratuito', 'free', 'none', 'Gratuito', 'Para começar a documentar sua moto.', 0, null,
   coalesce((select (value #>> '{}')::int from public.system_settings where key = 'free_plan_max_motorcycles'), 1),
   coalesce((select (value #>> '{}')::int from public.system_settings where key = 'free_plan_storage_quota_mb'), 100),
   array['Identidade digital da moto', 'Histórico de manutenções', 'Registros de oficinas autorizadas',
         'Compartilhamento com compradores'], 10),
  ('premium_mensal', 'premium', 'monthly', 'Premium mensal', 'Mais espaço e recursos para quem cuida de perto.', 990, null,
   3, 500, array['Mais motos e mais espaço para anexos', 'Relatórios em PDF', 'Lembretes de manutenção',
                 'Compartilhamento avançado'], 20),
  ('premium_semestral', 'premium', 'semiannual', 'Premium semestral', 'Mais espaço e recursos para quem cuida de perto.', 4990, 'R$ 8,32 por mês',
   3, 500, array['Mais motos e mais espaço para anexos', 'Relatórios em PDF', 'Lembretes de manutenção',
                 'Compartilhamento avançado'], 30),
  ('premium_anual', 'premium', 'annual', 'Premium anual', 'Mais espaço e recursos para quem cuida de perto.', 8990, 'R$ 7,49 por mês',
   3, 500, array['Mais motos e mais espaço para anexos', 'Relatórios em PDF', 'Lembretes de manutenção',
                 'Compartilhamento avançado'], 40);

-- As configurações antigas free_plan_max_motorcycles e free_plan_storage_quota_mb deixam de ser lidas
-- (o plano gratuito é a fonte). Remoção numa migração separada (KI-023).

insert into public.system_settings (key, value, description, is_public) values
  ('billing_enabled', 'false',
   'Contratação do Premium liberada no site (só depois do Mercado Pago validado — PRD 8.7).', true)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Limites do plano vigente (internos; 5.4 passará a considerar assinatura ativa)
-- -----------------------------------------------------------------------------

create or replace function public.user_plan(p_user uuid)
returns public.subscription_plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.subscription_plans p where p.kind = 'free' limit 1;
$$;

create or replace function public.user_max_motorcycles(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((public.user_plan(p_user)).max_motorcycles, 1);
$$;

create or replace function public.user_storage_quota_mb(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((public.user_plan(p_user)).storage_quota_mb, 100);
$$;

revoke execute on function public.user_plan(uuid) from public, anon, authenticated;
revoke execute on function public.user_max_motorcycles(uuid) from public, anon, authenticated;
revoke execute on function public.user_storage_quota_mb(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Leitura pública e do usuário
-- -----------------------------------------------------------------------------

create or replace function public.get_public_plans()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', code, 'kind', kind, 'billing_period', billing_period, 'name', name,
    'description', description, 'price_cents', price_cents, 'currency', currency,
    'price_note', price_note, 'max_motorcycles', max_motorcycles,
    'storage_quota_mb', storage_quota_mb, 'features', to_jsonb(features),
    'trial_days', trial_days, 'cancellation_text', cancellation_text
  ) order by sort_order, price_cents), '[]'::jsonb)
  from public.subscription_plans
  where is_active and is_public;
$$;

revoke execute on function public.get_public_plans() from public;
grant execute on function public.get_public_plans() to anon, authenticated;

create or replace function public.get_my_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.subscription_plans;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  p := public.user_plan(v_uid);
  return jsonb_build_object(
    'code', p.code, 'kind', p.kind, 'name', p.name, 'billing_period', p.billing_period,
    'max_motorcycles', coalesce(p.max_motorcycles, 1),
    'storage_quota_mb', coalesce(p.storage_quota_mb, 100),
    'motorcycles_used', (select count(*) from public.motorcycle_ownerships
                          where owner_user_id = v_uid and ended_at is null),
    'features', to_jsonb(coalesce(p.features, '{}'))
  );
end;
$$;

revoke execute on function public.get_my_plan() from public, anon;
grant execute on function public.get_my_plan() to authenticated;

-- -----------------------------------------------------------------------------
-- Administração (PRD 7.4)
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_plans()
returns setof public.subscription_plans
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query select * from public.subscription_plans order by sort_order, price_cents;
end;
$$;

revoke execute on function public.admin_list_plans() from public, anon;
grant execute on function public.admin_list_plans() to authenticated;

create or replace function public.admin_save_plan(
  p_id                uuid,
  p_code              text,
  p_kind              text,
  p_billing_period    text,
  p_name              text,
  p_description       text,
  p_price_cents       int,
  p_price_note        text,
  p_max_motorcycles   int,
  p_storage_quota_mb  int,
  p_features          text[],
  p_trial_days        int,
  p_cancellation_text text,
  p_is_public         boolean,
  p_sort_order        int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_features text[];
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  select coalesce(array_agg(btrim(f)) filter (where btrim(f) <> ''), '{}')
    into v_features from unnest(coalesce(p_features, '{}')) f;

  if p_id is null then
    insert into public.subscription_plans
      (code, kind, billing_period, name, description, price_cents, price_note, max_motorcycles,
       storage_quota_mb, features, trial_days, cancellation_text, is_public, sort_order)
    values
      (lower(btrim(p_code)), p_kind, p_billing_period, btrim(p_name), nullif(btrim(p_description), ''),
       p_price_cents, nullif(btrim(p_price_note), ''), p_max_motorcycles, p_storage_quota_mb, v_features,
       coalesce(p_trial_days, 0), nullif(btrim(p_cancellation_text), ''), coalesce(p_is_public, true),
       coalesce(p_sort_order, 100))
    returning id into v_id;
  else
    update public.subscription_plans set
      name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      price_cents = p_price_cents,
      price_note = nullif(btrim(p_price_note), ''),
      max_motorcycles = p_max_motorcycles,
      storage_quota_mb = p_storage_quota_mb,
      features = v_features,
      trial_days = coalesce(p_trial_days, 0),
      cancellation_text = nullif(btrim(p_cancellation_text), ''),
      is_public = coalesce(p_is_public, is_public),
      sort_order = coalesce(p_sort_order, sort_order)
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Plano não encontrado.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
exception
  when check_violation then
    raise exception 'Dados do plano inválidos: confira preço, periodicidade, limites e textos.' using errcode = 'P0001';
  when unique_violation then
    raise exception 'Já existe um plano com esse código (ou um plano gratuito).' using errcode = 'P0001';
end;
$$;

revoke execute on function public.admin_save_plan(uuid, text, text, text, text, text, int, text, int, int, text[], int, text, boolean, int) from public, anon;
grant execute on function public.admin_save_plan(uuid, text, text, text, text, text, int, text, int, int, text[], int, text, boolean, int) to authenticated;

create or replace function public.admin_set_plan_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  update public.subscription_plans set is_active = p_active where id = p_id and is_active <> p_active;
  if not found and not exists (select 1 from public.subscription_plans where id = p_id) then
    raise exception 'Plano não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.admin_set_plan_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_plan_active(uuid, boolean) to authenticated;

create or replace function public.admin_get_plan_history(p_id uuid)
returns table (version int, snapshot jsonb, changed_by_name text, changed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select v.version, v.snapshot, coalesce(pr.full_name, case when v.created_by is null then 'Sistema' else 'Usuário removido' end), v.changed_at
    from public.subscription_plan_versions v
    left join public.profiles pr on pr.id = v.created_by
    where v.plan_id = p_id
    order by v.version desc;
end;
$$;

revoke execute on function public.admin_get_plan_history(uuid) from public, anon;
grant execute on function public.admin_get_plan_history(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Funções existentes passam a usar o plano vigente
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_motorcycle(p_brand text, p_model text, p_manufacturing_year integer, p_plate text, p_current_mileage integer, p_version text DEFAULT NULL::text, p_model_year integer DEFAULT NULL::integer, p_displacement_cc integer DEFAULT NULL::integer, p_color text DEFAULT NULL::text, p_chassis text DEFAULT NULL::text, p_acquisition_date date DEFAULT NULL::date, p_initial_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Limite do plano vigente do usuário (ADR-018).
  v_limit := public.user_max_motorcycles(v_uid);
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
$function$;
CREATE OR REPLACE FUNCTION public.get_storage_usage()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'used_bytes', coalesce((
      select sum(a.file_size)
      from public.attachments a
      join public.motorcycle_ownerships o
        on o.motorcycle_id = a.motorcycle_id and o.ended_at is null and o.owner_user_id = auth.uid()
      where a.organization_id is null
        and (a.diary_entry_id is null
             or exists (select 1 from public.motorcycle_diary d where d.id = a.diary_entry_id and d.author_id = auth.uid()))
    ), 0),
    'quota_bytes', public.user_storage_quota_mb(auth.uid())::bigint * 1048576,
    'max_file_bytes', coalesce((select (value #>> '{}')::bigint from public.system_settings where key = 'attachment_max_file_mb'), 10) * 1048576
  );
$function$;
CREATE OR REPLACE FUNCTION public.accept_transfer_request(p_transfer_id uuid, p_acquisition_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid   uuid := auth.uid();
  t       public.transfer_requests;
  v_own   public.motorcycle_ownerships;
  v_limit int;
  v_count int;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para aceitar.' using errcode = '42501';
  end if;
  select * into t from public.transfer_requests where id = p_transfer_id for update;
  if not found or t.to_email is distinct from public.current_user_email() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if t.status <> 'pending' or t.expires_at <= now() then
    raise exception 'Este pedido não está mais em aberto.' using errcode = 'P0001';
  end if;
  if p_acquisition_date is not null and (p_acquisition_date > current_date or p_acquisition_date < date '1885-01-01') then
    raise exception 'Data de aquisição inválida.' using errcode = '22023';
  end if;

  -- A titularidade de quem pediu precisa continuar a atual.
  select * into v_own from public.motorcycle_ownerships
   where motorcycle_id = t.motorcycle_id and ended_at is null for update;
  if not found or v_own.owner_user_id is distinct from t.from_user_id then
    raise exception 'Este pedido não vale mais: a titularidade da moto mudou.' using errcode = 'P0001';
  end if;
  if v_own.owner_user_id = v_uid then
    raise exception 'Você já é o titular desta moto.' using errcode = 'P0001';
  end if;

  -- Limite do plano vigente de quem recebe (ADR-018).
  v_limit := public.user_max_motorcycles(v_uid);
  select count(*) into v_count from public.motorcycle_ownerships where owner_user_id = v_uid and ended_at is null;
  if v_count >= v_limit then
    raise exception 'Sua conta já tem o máximo de motos do plano. Libere espaço antes de aceitar.' using errcode = 'P0001';
  end if;

  update public.motorcycle_ownerships
     set ended_at = now(), end_reason = 'transfer', transfer_id = t.id
   where id = v_own.id;

  insert into public.motorcycle_ownerships (motorcycle_id, owner_user_id, acquisition_date, transfer_id)
  values (t.motorcycle_id, v_uid, p_acquisition_date, t.id);

  -- PRD 10: todas as autorizações anteriores terminam, inclusive Oficina de Origem.
  update public.motorcycle_workshop_access
     set status = 'ended', ended_at = now(), end_reason = 'transfer'
   where motorcycle_id = t.motorcycle_id and status = 'approved';
  update public.motorcycle_workshop_access
     set status = 'canceled', ended_at = now(), end_reason = 'transfer'
   where motorcycle_id = t.motorcycle_id and status = 'pending';

  insert into public.user_roles (user_id, role) values (v_uid, 'owner') on conflict do nothing;

  update public.transfer_requests set status = 'accepted', decided_at = now(), to_user_id = v_uid where id = t.id;
  return t.motorcycle_id;
end;
$function$;
