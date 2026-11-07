-- =============================================================================
-- Moto Passaporte — Migração: transferência do passaporte (Fase 4, PRD 10; itens 4.1–4.3; ADR-016)
-- Objetivo: titular atual pede a transferência para o e-mail do comprador; o
--           comprador (logado com esse e-mail) aceita ou recusa; o titular pode
--           cancelar. Na aceitação, numa única transação: encerra a titularidade
--           anterior, cria a nova, encerra TODAS as autorizações de oficina
--           (inclusive Oficina de Origem) e cancela pedidos pendentes. Histórico,
--           autoria e quilometragem permanecem. Não é transferência no DETRAN.
-- Dependências: motorcycles, workshop_access, diary.
-- Reversão: drop functions create_transfer_request, cancel_transfer_request,
--           reject_transfer_request, accept_transfer_request, get_motorcycle_transfers,
--           get_my_incoming_transfers, get_my_previous_motorcycles,
--           protect_transfer_request, transfer_status_of; alter table
--           motorcycle_ownerships drop constraint motorcycle_ownerships_transfer_fk;
--           drop table transfer_requests; drop type transfer_status;
--           delete settings transfer_*.
-- =============================================================================

insert into public.system_settings (key, value, description, is_public) values
  ('transfer_request_days', '7', 'Dias para o comprador aceitar um pedido de transferência.', false),
  ('transfer_requests_per_day', '10', 'Pedidos de transferência por titular, por dia.', false)
on conflict (key) do nothing;

create type public.transfer_status as enum ('pending', 'accepted', 'rejected', 'canceled');

create table public.transfer_requests (
  id            uuid primary key default gen_random_uuid(),
  motorcycle_id uuid not null references public.motorcycles (id) on delete restrict,
  from_user_id  uuid references auth.users (id) on delete set null,
  to_email      text not null check (to_email = lower(to_email) and to_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(to_email) <= 160),
  to_user_id    uuid references auth.users (id) on delete set null,
  message       text check (message is null or char_length(message) <= 280),
  status        public.transfer_status not null default 'pending',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  decided_at    timestamptz,
  check ((status = 'pending') = (decided_at is null))
);

comment on table public.transfer_requests is
  'Transferência do passaporte entre contas (PRD 10). Não representa transferência no DETRAN nem valida propriedade.';

create unique index transfer_requests_open_uidx on public.transfer_requests (motorcycle_id) where status = 'pending';
create index transfer_requests_to_email_idx on public.transfer_requests (to_email) where status = 'pending';
create index transfer_requests_from_idx on public.transfer_requests (from_user_id, created_at desc);
create index transfer_requests_to_user_idx on public.transfer_requests (to_user_id);
create index transfer_requests_moto_idx on public.transfer_requests (motorcycle_id, created_at desc);

alter table public.motorcycle_ownerships
  add constraint motorcycle_ownerships_transfer_fk foreign key (transfer_id) references public.transfer_requests (id) on delete restrict;
create index motorcycle_ownerships_transfer_idx on public.motorcycle_ownerships (transfer_id) where transfer_id is not null;

-- Só sai de "pendente" uma vez; nada mais muda (exceto autoria nula por exclusão de conta).
create or replace function public.protect_transfer_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Histórico de transferências não pode ser excluído.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'status' - 'decided_at' - 'to_user_id' - 'from_user_id')
     <> (to_jsonb(old) - 'status' - 'decided_at' - 'to_user_id' - 'from_user_id')
     or (new.from_user_id is not null and new.from_user_id is distinct from old.from_user_id) then
    raise exception 'Dados da transferência não podem ser alterados.' using errcode = '42501';
  end if;
  if new.status = old.status and new.decided_at is not distinct from old.decided_at
     and (new.to_user_id is null or new.to_user_id is not distinct from old.to_user_id) then
    return new;
  end if;
  if old.status <> 'pending' or new.status = 'pending' then
    raise exception 'Mudança de situação não permitida.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_transfer_request() from public, anon, authenticated;

create trigger transfer_requests_protect
  before update or delete on public.transfer_requests
  for each row execute function public.protect_transfer_request();

create trigger transfer_requests_audit
  after insert or update on public.transfer_requests
  for each row execute function public.audit_row_change('motorcycle_id', '');

alter table public.transfer_requests enable row level security;
revoke all on public.transfer_requests from anon, authenticated;
-- Leitura e escrita pelas funções abaixo.

-- Situação vista pelas pessoas: pendente vencido aparece como "expirado".
create or replace function public.transfer_status_of(p_status public.transfer_status, p_expires timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_status = 'pending' and p_expires <= now() then 'expired' else p_status::text end;
$$;

create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(email) from auth.users where id = auth.uid();
$$;
revoke execute on function public.current_user_email() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Pedido (titular)
-- -----------------------------------------------------------------------------

create or replace function public.create_transfer_request(p_motorcycle_id uuid, p_to_email text, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(trim(p_to_email));
  v_id    uuid;
begin
  if not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 160 then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;
  if v_email = public.current_user_email() then
    raise exception 'Informe o e-mail da conta de quem vai receber a moto.' using errcode = '22023';
  end if;
  if p_message is not null and char_length(trim(p_message)) > 280 then
    raise exception 'A mensagem pode ter até 280 caracteres.' using errcode = '22023';
  end if;
  if exists (select 1 from public.transfer_requests
             where motorcycle_id = p_motorcycle_id and status = 'pending' and expires_at > now()) then
    raise exception 'Já existe um pedido de transferência em aberto para esta moto. Cancele-o antes de criar outro.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.transfer_requests
       where from_user_id = v_uid and created_at > now() - interval '1 day')
       >= public.setting_int('transfer_requests_per_day', 10) then
    raise exception 'Muitos pedidos de transferência hoje. Tente amanhã.' using errcode = 'P0001';
  end if;

  -- Pedido vencido sai da frente.
  update public.transfer_requests set status = 'canceled', decided_at = now()
   where motorcycle_id = p_motorcycle_id and status = 'pending' and expires_at <= now();

  insert into public.transfer_requests (motorcycle_id, from_user_id, to_email, message, expires_at)
  values (p_motorcycle_id, v_uid, v_email, nullif(trim(p_message), ''),
          now() + make_interval(days => public.setting_int('transfer_request_days', 7)))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.create_transfer_request(uuid, text, text) from public, anon;
grant  execute on function public.create_transfer_request(uuid, text, text) to authenticated;

create or replace function public.cancel_transfer_request(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.transfer_requests;
begin
  select * into t from public.transfer_requests where id = p_transfer_id for update;
  if not found or not public.is_current_owner(t.motorcycle_id) then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if t.status <> 'pending' then
    raise exception 'Este pedido já foi encerrado.' using errcode = 'P0001';
  end if;
  update public.transfer_requests set status = 'canceled', decided_at = now() where id = p_transfer_id;
end;
$$;
revoke execute on function public.cancel_transfer_request(uuid) from public, anon;
grant  execute on function public.cancel_transfer_request(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Resposta do comprador (conta com o e-mail informado)
-- -----------------------------------------------------------------------------

create or replace function public.reject_transfer_request(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.transfer_requests;
begin
  select * into t from public.transfer_requests where id = p_transfer_id for update;
  if not found or t.to_email is distinct from public.current_user_email() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if t.status <> 'pending' or t.expires_at <= now() then
    raise exception 'Este pedido não está mais em aberto.' using errcode = 'P0001';
  end if;
  update public.transfer_requests set status = 'rejected', decided_at = now(), to_user_id = auth.uid() where id = p_transfer_id;
end;
$$;
revoke execute on function public.reject_transfer_request(uuid) from public, anon;
grant  execute on function public.reject_transfer_request(uuid) to authenticated;

create or replace function public.accept_transfer_request(p_transfer_id uuid, p_acquisition_date date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Limite do plano de quem recebe (Fase 5 considera o Premium).
  v_limit := public.setting_int('free_plan_max_motorcycles', 1);
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
$$;
revoke execute on function public.accept_transfer_request(uuid, date) from public, anon;
grant  execute on function public.accept_transfer_request(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Leituras
-- -----------------------------------------------------------------------------

-- Titular: pedidos de transferência da moto.
create or replace function public.get_motorcycle_transfers(p_motorcycle_id uuid)
returns table (id uuid, to_email text, message text, status text, created_at timestamptz, expires_at timestamptz, decided_at timestamptz)
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
    select t.id, t.to_email, t.message, public.transfer_status_of(t.status, t.expires_at), t.created_at, t.expires_at, t.decided_at
      from public.transfer_requests t
     where t.motorcycle_id = p_motorcycle_id and t.from_user_id = auth.uid()
     order by t.created_at desc;
end;
$$;
revoke execute on function public.get_motorcycle_transfers(uuid) from public, anon;
grant  execute on function public.get_motorcycle_transfers(uuid) to authenticated;

-- Comprador: pedidos em aberto para o e-mail da conta, com o que precisa para conferir.
create or replace function public.get_my_incoming_transfers()
returns table (
  id uuid, brand text, model text, version text, manufacturing_year smallint, plate text,
  from_name text, message text, created_at timestamptz, expires_at timestamptz,
  maintenance_count bigint, latest_mileage integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, m.brand, m.model, m.version, m.manufacturing_year, p.plate,
         pr.full_name, t.message, t.created_at, t.expires_at,
         (select count(*) from public.maintenance_records r
           where r.motorcycle_id = m.id and not r.is_void
             and not exists (select 1 from public.maintenance_records c where c.corrects_record_id = r.id)),
         (select mr.mileage from public.mileage_records mr where mr.motorcycle_id = m.id
           order by mr.recorded_at desc, mr.created_at desc limit 1)
    from public.transfer_requests t
    join public.motorcycles m on m.id = t.motorcycle_id
    left join public.motorcycle_plates p on p.motorcycle_id = m.id and p.valid_until is null
    left join public.profiles pr on pr.id = t.from_user_id
   where t.status = 'pending' and t.expires_at > now()
     and t.to_email = public.current_user_email()
   order by t.created_at desc;
$$;
revoke execute on function public.get_my_incoming_transfers() from public, anon;
grant  execute on function public.get_my_incoming_transfers() to authenticated;

-- Antigo titular: motos que já foram suas (para acessar o próprio diário — KI-019).
create or replace function public.get_my_previous_motorcycles()
returns table (
  motorcycle_id uuid, brand text, model text, version text, manufacturing_year smallint,
  owned_from timestamptz, owned_until timestamptz, my_diary_entries bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.brand, m.model, m.version, m.manufacturing_year,
         min(o.started_at), max(o.ended_at),
         (select count(*) from public.motorcycle_diary d where d.motorcycle_id = m.id and d.author_id = auth.uid())
    from public.motorcycle_ownerships o
    join public.motorcycles m on m.id = o.motorcycle_id
   where o.owner_user_id = auth.uid() and o.ended_at is not null
     and not exists (select 1 from public.motorcycle_ownerships cur
                     where cur.motorcycle_id = o.motorcycle_id and cur.owner_user_id = auth.uid() and cur.ended_at is null)
   group by m.id
   order by max(o.ended_at) desc;
$$;
revoke execute on function public.get_my_previous_motorcycles() from public, anon;
grant  execute on function public.get_my_previous_motorcycles() to authenticated;
