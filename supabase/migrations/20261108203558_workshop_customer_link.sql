-- =============================================================================
-- PRD 2.1 — Fase 5.1 do módulo Oficina: acabamento (ADR-048)
-- §4.3 convite e vínculo seguro do cliente com a conta Moto Passaporte (por link que só ele recebeu, com
-- confirmação; nunca por coincidência de placa ou telefone); painel "Meus atendimentos"; avisos do §23 que
-- faltavam (cliente: orçamento, OS, agendamento, lembrete; equipe: lembrete vencendo, agendamento cancelado);
-- logotipo do perfil nos documentos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vínculo do cliente da oficina com a conta
-- -----------------------------------------------------------------------------
alter table public.workshop_customers
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists linked_at timestamptz,
  add column if not exists link_source text check (link_source is null or link_source in ('invite', 'quote', 'order'));
comment on column public.workshop_customers.user_id is
  'Conta Moto Passaporte do cliente, ligada só pelo próprio cliente ao abrir um link que a oficina enviou (convite, orçamento ou OS) e confirmar (PRD 2.1 §4.3).';
create index if not exists workshop_customers_user_idx on public.workshop_customers (user_id) where user_id is not null;

create table public.workshop_customer_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id     uuid not null,
  token_hash      text not null unique,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  used_at         timestamptz,
  used_by         uuid references auth.users (id) on delete set null,
  foreign key (organization_id, customer_id) references public.workshop_customers (organization_id, id) on delete restrict
);
comment on table public.workshop_customer_invites is 'Convites da oficina para o cliente ligar o cadastro à conta (só o hash do token é guardado; 30 dias; um ativo por cliente).';
create index workshop_customer_invites_customer_idx on public.workshop_customer_invites (customer_id);
alter table public.workshop_customer_invites enable row level security;
revoke all on public.workshop_customer_invites from anon, authenticated;
create trigger workshop_customer_invites_protect_org before update on public.workshop_customer_invites
  for each row execute function public.wq_protect_org();

create or replace function public.workshop_create_customer_invite(p_org uuid, p_customer uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_token text := public.wq_new_token();
        v_exp timestamptz := now() + interval '30 days';
        c public.workshop_customers;
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  select * into c from public.workshop_customers where id = p_customer and organization_id = p_org and status = 'active';
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
  if c.user_id is not null then raise exception 'Este cliente já ligou o cadastro à conta Moto Passaporte.' using errcode = 'P0001'; end if;
  update public.workshop_customer_invites set revoked_at = now() where customer_id = p_customer and revoked_at is null and used_at is null;
  insert into public.workshop_customer_invites (organization_id, customer_id, token_hash, created_by, expires_at)
  values (p_org, p_customer, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), v_exp);
  return jsonb_build_object('token', v_token, 'expires_at', v_exp);
end;
$$;

-- Resolve o link (convite, orçamento ou OS) para o cadastro do cliente. Uso interno.
create or replace function public.wl_customer_by_token(p_kind text, p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_id uuid;
        qs public.workshop_quote_shares;
        os public.workshop_os_shares;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
  if p_kind = 'invite' then
    if not public.anon_rate_limit_ok('quote_link', 'quote_link_requests_per_hour') then
      raise exception 'Muitas consultas a partir desta conexão. Tente de novo em alguns minutos.' using errcode = 'P0001', hint = 'rate_limited';
    end if;
    select customer_id into v_id from public.workshop_customer_invites
     where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and revoked_at is null and used_at is null and expires_at > now();
  elsif p_kind = 'quote' then
    qs := public.wq_share_by_token(p_token);
    if qs.id is not null and qs.revoked_at is null and qs.expires_at > now() then
      select customer_id into v_id from public.workshop_quotes where id = qs.quote_id;
    end if;
  elsif p_kind = 'order' then
    os := public.wo_share_by_token(p_token);
    if os.id is not null and os.revoked_at is null and os.expires_at > now() then
      select customer_id into v_id from public.workshop_service_orders where id = os.order_id;
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.get_customer_link_preview(p_kind text, p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare c public.workshop_customers;
        v_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  v_id := public.wl_customer_by_token(p_kind, p_token);
  if v_id is null then return jsonb_build_object('state', 'invalid'); end if;
  select * into c from public.workshop_customers where id = v_id;
  return jsonb_build_object(
    'state', case when c.user_id = auth.uid() then 'mine' when c.user_id is not null then 'taken' else 'open' end,
    'workshop', (select business_name from public.workshops where organization_id = c.organization_id),
    'customer_first_name', split_part(btrim(c.full_name), ' ', 1),
    'vehicles', coalesce((select jsonb_agg(concat_ws(' ', v.brand, v.model, v.year::text) order by v.created_at)
                           from public.workshop_vehicles v where v.customer_id = c.id and v.status = 'active'), '[]'::jsonb),
    'quotes', (select count(*) from public.workshop_quotes q where q.customer_id = c.id and q.status <> 'draft'),
    'orders', (select count(*) from public.workshop_service_orders o where o.customer_id = c.id));
end;
$$;

create or replace function public.claim_workshop_customer(p_kind text, p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare c public.workshop_customers;
        v_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  v_id := public.wl_customer_by_token(p_kind, p_token);
  if v_id is null then raise exception 'Link inválido ou vencido. Peça um novo à oficina.' using errcode = 'P0002'; end if;
  select * into c from public.workshop_customers where id = v_id for update;
  if c.user_id = auth.uid() then return jsonb_build_object('ok', true, 'already', true); end if;
  if c.user_id is not null then
    raise exception 'Este cadastro já está ligado a outra conta. Fale com a oficina.' using errcode = 'P0001';
  end if;
  update public.workshop_customers set user_id = auth.uid(), linked_at = now(), link_source = p_kind where id = c.id;
  if p_kind = 'invite' then
    update public.workshop_customer_invites set used_at = now(), used_by = auth.uid()
     where customer_id = c.id and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  end if;
  return jsonb_build_object('ok', true, 'already', false,
    'workshop', (select business_name from public.workshops where organization_id = c.organization_id));
end;
$$;

create or replace function public.unlink_my_workshop_customer(p_customer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workshop_customers set user_id = null, linked_at = null, link_source = null
   where id = p_customer and user_id = auth.uid();
  if not found then raise exception 'Cadastro não encontrado.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.workshop_unlink_customer(p_org uuid, p_customer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_responsible(p_org) then raise exception 'Só o responsável desfaz o vínculo.' using errcode = '42501'; end if;
  update public.workshop_customers set user_id = null, linked_at = null, link_source = null
   where id = p_customer and organization_id = p_org and user_id is not null;
  if not found then raise exception 'Cliente sem conta ligada.' using errcode = 'P0002'; end if;
end;
$$;

-- O que o cliente vê: atendimentos das oficinas que ele mesmo ligou. Sem observações internas nem custos.
create or replace function public.get_my_workshop_records()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'customer_id', c.id, 'linked_at', c.linked_at,
      'workshop', jsonb_build_object('name', w.business_name, 'slug', case when w.is_public then w.public_slug end, 'phone', w.phone,
                                     'whatsapp', w.whatsapp, 'city', w.city, 'state', w.state),
      'vehicles', coalesce((select jsonb_agg(concat_ws(' ', v.brand, v.model, v.year::text) order by v.created_at)
                             from public.workshop_vehicles v where v.customer_id = c.id and v.status = 'active'), '[]'::jsonb),
      'quotes', coalesce((select jsonb_agg(jsonb_build_object('number', q.number, 'status', q.status, 'total_cents', qv.total_cents,
                            'approved_total_cents', q.approved_total_cents, 'sent_at', qv.sent_at, 'decided_at', q.decided_at,
                            'is_complement', q.parent_quote_id is not null,
                            'items', coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity,
                                                 'subtotal_cents', i.subtotal_cents) order by i.position)
                                                 from public.workshop_quote_items i where i.version_id = qv.id), '[]'::jsonb))
                            order by q.created_at desc)
                           from public.workshop_quotes q
                           join public.workshop_quote_versions qv on qv.quote_id = q.id and qv.version_no = q.current_version
                          where q.customer_id = c.id and q.status <> 'draft'), '[]'::jsonb),
      'orders', coalesce((select jsonb_agg(jsonb_build_object('number', o.number, 'status', o.status, 'created_at', o.created_at,
                            'completed_at', o.completed_at, 'delivered_at', o.delivered_at, 'final_total_cents', o.final_total_cents,
                            'km_out', o.km_out, 'receipt_code', o.receipt_code,
                            'items', coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'status', i.status,
                                                 'part_brand', i.part_brand) order by i.position)
                                                 from public.workshop_service_order_items i where i.order_id = o.id), '[]'::jsonb))
                            order by o.created_at desc)
                           from public.workshop_service_orders o where o.customer_id = c.id), '[]'::jsonb),
      'appointments', coalesce((select jsonb_agg(jsonb_build_object('starts_at', a.starts_at, 'status', a.status, 'service', a.service_description)
                                  order by a.starts_at desc)
                                  from public.workshop_appointments a where a.customer_id = c.id and a.starts_at > now() - interval '30 days'), '[]'::jsonb),
      'reminders', coalesce((select jsonb_agg(jsonb_build_object('title', r.title, 'due_date', r.due_date, 'due_km', r.due_km) order by r.due_date nulls last)
                               from public.workshop_reminders r where r.customer_id = c.id and r.status = 'open'), '[]'::jsonb))
      order by c.linked_at desc)
    from public.workshop_customers c
    join public.workshops w on w.organization_id = c.organization_id
   where c.user_id = auth.uid()), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Avisos do §23 que faltavam
-- -----------------------------------------------------------------------------
alter table public.workshop_reminders add column if not exists notified_at timestamptz;

create or replace function public.wl_notify_customer(p_customer uuid, p_title text, p_body text, p_dedupe text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid;
begin
  select user_id into v_user from public.workshop_customers where id = p_customer;
  if v_user is not null then
    perform public.notify(v_user, 'workshop_update', p_title, p_body, '/painel/atendimentos', p_dedupe);
  end if;
end;
$$;

create or replace function public.wl_quote_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_shop text;
        v_total bigint;
begin
  if new.status = 'sent' and old.status = 'draft' then
    select business_name into v_shop from public.workshops where organization_id = new.organization_id;
    select total_cents into v_total from public.workshop_quote_versions where quote_id = new.id and version_no = new.current_version;
    perform public.wl_notify_customer(new.customer_id,
      case when new.parent_quote_id is null then 'Novo orçamento da ' else 'Orçamento complementar da ' end || v_shop,
      'Orçamento nº ' || new.number || ': ' || to_char(coalesce(v_total, 0) / 100.0, 'FM"R$ "999G999G990D00') ||
      '. Para aprovar, use o link que a oficina enviou pelo WhatsApp.', 'quote-sent:' || new.id);
  end if;
  return new;
end;
$$;
create trigger workshop_quotes_customer_notify after update of status on public.workshop_quotes
  for each row execute function public.wl_quote_notify();

create or replace function public.wl_order_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_shop text;
        v_msg text;
begin
  select business_name into v_shop from public.workshops where organization_id = new.organization_id;
  if tg_op = 'INSERT' then
    perform public.wl_notify_customer(new.customer_id, v_shop || ': ordem de serviço aberta',
      'OS nº ' || new.number || ' aberta. Você recebe aviso a cada etapa importante.', 'os:' || new.id || ':open');
    return new;
  end if;
  if new.status is not distinct from old.status then return new; end if;
  v_msg := case new.status
    when 'in_progress' then 'Serviço em execução.'
    when 'awaiting_parts' then 'Aguardando peças.'
    when 'completed' then 'Serviço concluído.'
    when 'awaiting_pickup' then 'Sua moto está pronta para retirada.'
    when 'delivered' then 'Moto entregue. Obrigado pela preferência!'
    when 'canceled' then 'Ordem de serviço cancelada.' end;
  if v_msg is not null then
    perform public.wl_notify_customer(new.customer_id, v_shop || ': OS nº ' || new.number, v_msg, 'os:' || new.id || ':' || new.status);
  end if;
  return new;
end;
$$;
create trigger workshop_service_orders_customer_notify after insert or update of status on public.workshop_service_orders
  for each row execute function public.wl_order_notify();

create or replace function public.wl_appointment_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_shop text;
        v_when text;
begin
  if new.status is not distinct from old.status then return new; end if;
  select business_name into v_shop from public.workshops where organization_id = new.organization_id;
  v_when := to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  if new.status in ('canceled', 'no_show') and new.responsible_user_id is not null and new.responsible_user_id is distinct from auth.uid() then
    perform public.notify(new.responsible_user_id, 'appointment_canceled',
      case new.status when 'canceled' then 'Agendamento cancelado' else 'Cliente não compareceu' end,
      coalesce((select full_name from public.workshop_customers where id = new.customer_id), new.contact_name, 'Cliente') || ' · ' || v_when || ' · ' || left(new.service_description, 80),
      '/oficina/' || new.organization_id || '/agenda', 'appt:' || new.id || ':' || new.status);
  end if;
  if new.customer_id is not null and new.status in ('confirmed', 'canceled') then
    perform public.wl_notify_customer(new.customer_id, v_shop || ': agendamento ' || case new.status when 'confirmed' then 'confirmado' else 'cancelado' end,
      v_when || ' · ' || left(new.service_description, 80), 'appt:' || new.id || ':' || new.status);
  end if;
  return new;
end;
$$;
create trigger workshop_appointments_notify after update of status on public.workshop_appointments
  for each row execute function public.wl_appointment_notify();

-- Rotina diária: lembretes de manutenção vencendo (data em até 3 dias ou km a 300 da meta) → equipe e cliente com conta.
create or replace function public.system_workshop_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
        n int := 0;
        v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for r in select rm.*, c.full_name as customer_name, w.business_name, concat_ws(' ', v.brand, v.model) as vehicle
             from public.workshop_reminders rm
             join public.workshop_customers c on c.id = rm.customer_id
             join public.workshops w on w.organization_id = rm.organization_id
             join public.organizations o on o.id = rm.organization_id and o.status = 'active'
             left join public.workshop_vehicles v on v.id = rm.vehicle_id
            where rm.status = 'open' and rm.notified_at is null
              and ((rm.due_date is not null and rm.due_date <= v_today + 3)
                   or (rm.due_km is not null and v.km is not null and v.km >= rm.due_km - 300))
            limit 2000 loop
    perform public.wq_notify_team(r.organization_id, 'workshop_reminder_due', 'Lembrete: ' || left(r.title, 80),
      r.customer_name || coalesce(' · ' || nullif(r.vehicle, ''), '') || coalesce(' · ' || to_char(r.due_date, 'DD/MM'), ''),
      '/oficina/' || r.organization_id || '/relacionamento', 'reminder:' || r.id);
    perform public.wl_notify_customer(r.customer_id, r.business_name || ': hora da manutenção',
      r.title || coalesce(' (' || nullif(r.vehicle, '') || ')', '') || '. Fale com a oficina para agendar.', 'reminder:' || r.id);
    update public.workshop_reminders set notified_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.system_workshop_reminders() from public, anon, authenticated;
grant execute on function public.system_workshop_reminders() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'moto-passaporte-workshop-reminders') then
    perform cron.unschedule('moto-passaporte-workshop-reminders');
  end if;
  perform cron.schedule('moto-passaporte-workshop-reminders', '17 11 * * *', 'select public.system_workshop_reminders()');
end $$;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workshop_access_request', 'workshop_access_decided', 'workshop_access_revoked', 'workshop_service',
  'transfer_received', 'transfer_decided', 'reminder_due', 'subscription_ending', 'payment_approved',
  'payment_failed', 'storage_limit', 'claim_decided', 'ownership_notice', 'admin_notice',
  'care_checkup', 'oil_change', 'quote_viewed', 'quote_decided', 'quote_expired', 'service_order_assigned',
  'appointment_requested', 'workshop_review', 'workshop_update', 'workshop_reminder_due', 'appointment_canceled'));

create or replace function public.notification_kind_optional(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_kind in ('reminder_due', 'storage_limit', 'subscription_ending', 'workshop_service', 'care_checkup', 'oil_change',
                        'quote_viewed', 'quote_expired', 'workshop_review', 'workshop_update', 'workshop_reminder_due', 'appointment_canceled') $$;

create or replace function public.get_my_notification_preferences()
returns table (kind text, optional boolean, in_app boolean, email boolean, push boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select k.kind, public.notification_kind_optional(k.kind), coalesce(p.in_app, true), coalesce(p.email, false),
         coalesce(p.push, public.notification_push_default(k.kind))
    from unnest(array['care_checkup', 'oil_change', 'workshop_access_request', 'workshop_access_decided', 'workshop_access_revoked',
                      'workshop_service', 'transfer_received', 'transfer_decided', 'reminder_due', 'subscription_ending',
                      'payment_approved', 'payment_failed', 'storage_limit', 'claim_decided', 'ownership_notice', 'admin_notice',
                      'quote_viewed', 'quote_decided', 'quote_expired', 'service_order_assigned',
                      'appointment_requested', 'workshop_review', 'workshop_update', 'workshop_reminder_due', 'appointment_canceled']) k(kind)
    left join public.notification_preferences p on p.user_id = auth.uid() and p.kind = k.kind;
$$;

-- -----------------------------------------------------------------------------
-- Logotipo do perfil nos documentos (orçamento e comprovante usam logo_url)
-- -----------------------------------------------------------------------------
create or replace function public.wl_sync_logo_url()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.logo_path is distinct from old.logo_path then
    new.logo_url := case when new.logo_path is not null then 'storage:workshop-files/' || new.logo_path end;
  end if;
  return new;
end;
$$;
revoke execute on function public.wl_sync_logo_url() from public, anon, authenticated;
create trigger workshops_sync_logo_url before update of logo_path on public.workshops
  for each row execute function public.wl_sync_logo_url();
update public.workshops set logo_url = 'storage:workshop-files/' || logo_path where logo_path is not null;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['workshop_create_customer_invite(uuid, uuid)', 'get_customer_link_preview(text, text)',
                           'claim_workshop_customer(text, text)', 'unlink_my_workshop_customer(uuid)', 'workshop_unlink_customer(uuid, uuid)',
                           'get_my_workshop_records()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['wl_customer_by_token(text, text)', 'wl_notify_customer(uuid, text, text, text)', 'wl_quote_notify()',
                           'wl_order_notify()', 'wl_appointment_notify()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
