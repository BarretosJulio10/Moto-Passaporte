-- =============================================================================
-- App da Pista — PWA do mecânico (plano de 09/11/2026, ADR-057)
-- Fases A, B e C: lista e OS sem preços, fotos/notas/áudio idempotentes (fila sem internet),
-- "Pronto" pelo mecânico, áudio arquivado (sem transcrição) apagado 90 dias após a entrega.
-- Acesso: membro ativo com "Executar OS" (can_execute_orders) ou responsável.
-- Rollback: supabase/rollback/20261109120000_pista_app.down.sql
-- =============================================================================

-- Configurações da oficina
alter table public.workshops add column if not exists pista_allow_unassigned boolean not null default true;
alter table public.workshops add column if not exists pista_allow_ready boolean not null default true;
comment on column public.workshops.pista_allow_unassigned is 'App da Pista: mecânico vê e pega OS sem mecânico.';
comment on column public.workshops.pista_allow_ready is 'App da Pista: mecânico marca a OS como "Pronto".';

-- Situação "Pronto" (mecânico terminou; o painel confere e conclui)
do $do$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.workshop_service_orders'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%awaiting_complement%';
  execute format('alter table public.workshop_service_orders drop constraint %I', c);
  select conname into c from pg_constraint
   where conrelid = 'public.workshop_service_order_events'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%history_photo_added%';
  execute format('alter table public.workshop_service_order_events drop constraint %I', c);
end
$do$;
alter table public.workshop_service_orders add constraint workshop_service_orders_status_check check (status in (
  'open', 'awaiting_diagnosis', 'awaiting_approval', 'awaiting_parts', 'awaiting_execution',
  'in_progress', 'paused', 'awaiting_complement', 'ready', 'completed', 'awaiting_pickup', 'delivered', 'canceled'));
alter table public.workshop_service_order_events add constraint workshop_service_order_events_kind_check check (kind in (
  'created', 'status_changed', 'assigned', 'item_added', 'item_updated', 'complement_added', 'checklist_saved',
  'photo_added', 'photo_removed', 'link_created', 'customer_ack', 'completed', 'pickup_notified', 'delivered',
  'canceled', 'notes_updated', 'history_published', 'history_photo_added',
  'note_added', 'note_voided', 'audio_added', 'mechanic_ready', 'taken'));

do $do$
declare d text;
begin
  d := pg_get_functiondef('public.workshop_set_order_status(uuid, uuid, text, text)'::regprocedure);
  if position('''in_progress'', ''paused'', ''awaiting_complement'') then' in d) = 0 then
    raise exception 'workshop_set_order_status: trecho esperado não encontrado';
  end if;
  d := replace(d, '''in_progress'', ''paused'', ''awaiting_complement'') then',
                  '''in_progress'', ''paused'', ''awaiting_complement'', ''ready'') then');
  execute d;
end
$do$;

-- Retenção do áudio
insert into public.system_settings (key, value, description, is_public)
values ('workshop_audio_retention_days', '90'::jsonb, 'Dias depois da entrega (ou cancelamento) da OS até apagar os áudios do App da Pista.', false)
on conflict (key) do nothing;
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.setting_spec(text)'::regprocedure);
  if position('when ''storage_alert_percent''' in d) = 0 then
    raise exception 'setting_spec: trecho esperado não encontrado';
  end if;
  d := replace(d, 'when ''storage_alert_percent''',
    'when ''workshop_audio_retention_days''    then ''{"kind":"int","min":7,"max":3650,"group":"Armazenamento","label":"Dias para apagar os áudios da pista depois da entrega da OS"}''
    when ''storage_alert_percent''');
  execute d;
end
$do$;

-- -----------------------------------------------------------------------------
-- Notas e áudios da OS
-- -----------------------------------------------------------------------------
create table public.workshop_os_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id        uuid not null,
  item_id         uuid references public.workshop_service_order_items (id) on delete set null,
  client_id       uuid not null unique,
  body            text not null check (char_length(body) between 1 and 2000),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  voided_at       timestamptz,
  voided_by       uuid references auth.users (id) on delete set null,
  foreign key (organization_id, order_id) references public.workshop_service_orders (organization_id, id) on delete restrict
);
create index workshop_os_notes_order_idx on public.workshop_os_notes (order_id, created_at);
comment on table public.workshop_os_notes is 'Notas rápidas da OS feitas pela equipe (App da Pista). Não se apagam, se anulam.';

create table public.workshop_os_audios (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  order_id         uuid not null,
  item_id          uuid references public.workshop_service_order_items (id) on delete set null,
  storage_path     text unique,
  mime_type        text not null check (mime_type in ('audio/mp4', 'audio/webm', 'audio/ogg')),
  file_size        bigint not null check (file_size > 0),
  duration_seconds int not null check (duration_seconds between 1 and 120),
  title            text check (title is null or char_length(title) <= 120),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  expired_at       timestamptz,
  check ((storage_path is null) = (expired_at is not null)),
  foreign key (organization_id, order_id) references public.workshop_service_orders (organization_id, id) on delete restrict
);
create index workshop_os_audios_order_idx on public.workshop_os_audios (order_id, created_at);
comment on table public.workshop_os_audios is
  'Áudios da OS gravados na pista (sem transcrição). Só a equipe ouve. Apagados workshop_audio_retention_days após a entrega.';

alter table public.workshop_os_notes enable row level security;
alter table public.workshop_os_audios enable row level security;
revoke all on public.workshop_os_notes, public.workshop_os_audios from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Storage: áudio no bucket da oficina
-- -----------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'audio/webm', 'audio/ogg']
 where id = 'workshop-files';

create or replace function public.can_access_workshop_object(p_name text, p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_folder text := split_part(p_name, '/', 1);
begin
  if v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|m4a|webm|ogg)$' then
    return false;
  end if;
  return public.has_org_permission(v_folder::uuid, p_permission);
end;
$$;

create or replace function public.workshop_file_object_info(p_path text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('owner', coalesce(o.owner_id, o.owner::text), 'mime', o.metadata ->> 'mimetype',
                            'size', (o.metadata ->> 'size')::bigint,
                            'registered', exists (select 1 from public.workshop_os_photos p where p.storage_path = o.name)
                                          or exists (select 1 from public.workshop_public_photos p where p.storage_path = o.name)
                                          or exists (select 1 from public.workshop_os_audios a where a.storage_path = o.name))
    from storage.objects o where o.bucket_id = 'workshop-files' and o.name = p_path;
$$;

-- Arquivos da oficina sem registro (envio que falhou ou áudio vencido) entram na limpeza automática.
create or replace view public.storage_unlinked_objects
with (security_invoker = true) as
  select o.name, coalesce((o.metadata ->> 'size')::bigint, 0) as size_bytes, o.created_at,
         o.created_at < now() - make_interval(hours => public.setting_int('storage_orphan_retention_hours', 24)) as is_orphan
    from storage.objects o
   where o.bucket_id = 'attachments'
     and not exists (select 1 from public.attachments a where a.storage_path = o.name)
  union all
  select 'expense-receipts:' || o.name, coalesce((o.metadata ->> 'size')::bigint, 0), o.created_at,
         o.created_at < now() - make_interval(hours => public.setting_int('storage_orphan_retention_hours', 24))
    from storage.objects o
   where o.bucket_id = 'expense-receipts'
     and not exists (select 1 from public.owner_expenses e where e.receipt_path = o.name)
  union all
  select 'workshop-files:' || o.name, coalesce((o.metadata ->> 'size')::bigint, 0), o.created_at,
         o.created_at < now() - make_interval(hours => public.setting_int('storage_orphan_retention_hours', 24))
    from storage.objects o
   where o.bucket_id = 'workshop-files'
     and not exists (select 1 from public.workshop_os_photos p where p.storage_path = o.name)
     and not exists (select 1 from public.workshop_public_photos p where p.storage_path = o.name)
     and not exists (select 1 from public.workshop_os_audios a where a.storage_path = o.name);
revoke all on public.storage_unlinked_objects from public, anon, authenticated;

-- Áudios vencidos: o registro fica ("áudio expirado"), o arquivo vira órfão e a limpeza apaga.
create or replace function public.system_expire_workshop_audios()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  update public.workshop_os_audios a
     set storage_path = null, expired_at = now()
    from public.workshop_service_orders o
   where o.id = a.order_id and a.expired_at is null
     and o.status in ('delivered', 'canceled')
     and coalesce(o.delivered_at, o.updated_at)
         < now() - make_interval(days => public.setting_int('workshop_audio_retention_days', 90));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.system_expire_workshop_audios() from public, anon, authenticated;

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'moto-passaporte-pista-audios';
    perform cron.schedule('moto-passaporte-pista-audios', '29 6 * * *', 'select public.system_expire_workshop_audios()');
  end if;
end
$do$;

-- -----------------------------------------------------------------------------
-- Regras de acesso da pista
-- -----------------------------------------------------------------------------
create or replace function public.pista_is_responsible(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.organization_members m
                  join public.organizations o on o.id = m.organization_id and o.status = 'active'
                 where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active' and m.role = 'responsible');
$$;
revoke execute on function public.pista_is_responsible(uuid) from public, anon, authenticated;

-- Trava a OS e confere se o mecânico pode mexer nela.
create or replace function public.pista_lock(p_org uuid, p_order uuid)
returns public.workshop_service_orders
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.wo_lock(p_org, p_order, 'execute_orders');
  if not public.pista_is_responsible(p_org) and o.mechanic_user_id is distinct from auth.uid() then
    if o.mechanic_user_id is not null then
      raise exception 'Esta OS é de outro mecânico.' using errcode = '42501';
    end if;
    if not coalesce((select pista_allow_unassigned from public.workshops where organization_id = p_org), true) then
      raise exception 'Peça ao responsável para designar esta OS para você.' using errcode = '42501';
    end if;
  end if;
  return o;
end;
$$;
revoke execute on function public.pista_lock(uuid, uuid) from public, anon, authenticated;

-- Oficinas em que a pessoa pode usar a pista.
create or replace function public.pista_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'organization_id', m.organization_id,
           'name', coalesce(w.business_name, o.name),
           'is_responsible', m.role = 'responsible',
           'allow_unassigned', coalesce(w.pista_allow_unassigned, true),
           'allow_ready', coalesce(w.pista_allow_ready, true),
           'user_name', coalesce((select p.full_name from public.profiles p where p.id = auth.uid()), ''))
         order by coalesce(w.business_name, o.name)), '[]'::jsonb)
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    left join public.workshops w on w.organization_id = m.organization_id
   where m.user_id = auth.uid() and m.status = 'active'
     and (m.role = 'responsible' or m.can_execute_orders);
$$;
revoke execute on function public.pista_context() from public, anon;
grant execute on function public.pista_context() to authenticated;

create or replace function public.workshop_set_pista_settings(p_org uuid, p_allow_unassigned boolean, p_allow_ready boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.pista_is_responsible(p_org) then
    raise exception 'Só o responsável muda as regras do App da Pista.' using errcode = '42501';
  end if;
  update public.workshops
     set pista_allow_unassigned = coalesce(p_allow_unassigned, true), pista_allow_ready = coalesce(p_allow_ready, true)
   where organization_id = p_org;
end;
$$;
revoke execute on function public.workshop_set_pista_settings(uuid, boolean, boolean) from public, anon;
grant execute on function public.workshop_set_pista_settings(uuid, boolean, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Leitura (sem preços nem contato do cliente)
-- -----------------------------------------------------------------------------
create or replace function public.pista_list_orders(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_resp boolean;
        v_unassigned boolean;
begin
  perform public.wq_assert(p_org, 'execute_orders');
  v_resp := public.pista_is_responsible(p_org);
  v_unassigned := coalesce((select pista_allow_unassigned from public.workshops where organization_id = p_org), true);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.id, 'number', o.number, 'status', o.status, 'due_date', o.due_date, 'km_in', o.km_in,
             'mine', o.mechanic_user_id = auth.uid(), 'mechanic_user_id', o.mechanic_user_id,
             'mechanic_name', (select p.full_name from public.profiles p where p.id = o.mechanic_user_id),
             'customer_name', split_part(c.full_name, ' ', 1),
             'plate', v.plate, 'brand', v.brand, 'model', v.model, 'year', v.year,
             'notes', o.notes,
             'items_total', (select count(*) from public.workshop_service_order_items i where i.order_id = o.id),
             'items_done', (select count(*) from public.workshop_service_order_items i where i.order_id = o.id and i.status = 'done'),
             'photos', (select count(*) from public.workshop_os_photos p where p.order_id = o.id and p.removed_at is null),
             'updated_at', o.updated_at)
           order by (o.status = 'in_progress' and o.mechanic_user_id = auth.uid()) desc, o.due_date nulls last, o.created_at)
      from public.workshop_service_orders o
      join public.workshop_customers c on c.id = o.customer_id
      left join public.workshop_vehicles v on v.id = o.vehicle_id
     where o.organization_id = p_org
       and o.status not in ('completed', 'awaiting_pickup', 'delivered', 'canceled')
       and (v_resp or o.mechanic_user_id = auth.uid() or (o.mechanic_user_id is null and v_unassigned))), '[]'::jsonb);
end;
$$;
revoke execute on function public.pista_list_orders(uuid) from public, anon;
grant execute on function public.pista_list_orders(uuid) to authenticated;

create or replace function public.pista_get_order(p_org uuid, p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.pista_lock(p_org, p_order);
  return (
    select jsonb_build_object(
      'id', o.id, 'number', o.number, 'status', o.status, 'due_date', o.due_date, 'km_in', o.km_in, 'km_out', o.km_out,
      'notes', o.notes, 'technical_notes', o.technical_notes,
      'mine', o.mechanic_user_id = auth.uid(), 'mechanic_user_id', o.mechanic_user_id,
      'mechanic_name', (select p.full_name from public.profiles p where p.id = o.mechanic_user_id),
      'customer_name', split_part(c.full_name, ' ', 1),
      'vehicle', case when v.id is null then null else jsonb_build_object(
                   'plate', v.plate, 'brand', v.brand, 'model', v.model, 'year', v.year, 'color', v.color) end,
      'items', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', i.id, 'position', i.position, 'kind', i.kind, 'description', i.description, 'quantity', i.quantity,
                 'status', i.status, 'notes', i.notes, 'part_brand', i.part_brand, 'part_code', i.part_code,
                 'executed_at', i.executed_at,
                 'executed_by_name', (select p.full_name from public.profiles p where p.id = i.executed_by))
                 order by i.position) from public.workshop_service_order_items i where i.order_id = o.id), '[]'::jsonb),
      'photos', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', p.id, 'phase', p.phase, 'storage_path', p.storage_path, 'caption', p.caption, 'created_at', p.created_at,
                  'created_by_name', (select pr.full_name from public.profiles pr where pr.id = p.created_by))
                  order by p.created_at) from public.workshop_os_photos p where p.order_id = o.id and p.removed_at is null), '[]'::jsonb),
      'notes_list', public.pista_order_notes(o.id),
      'audios', public.pista_order_audios(o.id),
      'inspections', coalesce((select jsonb_object_agg(x.phase, jsonb_build_object(
                  'items', x.items, 'fuel_level', x.fuel_level, 'keys_count', x.keys_count, 'km', x.km, 'notes', x.notes,
                  'recorded_at', x.recorded_at, 'customer_ack_at', x.customer_ack_at))
                  from public.workshop_inspections x where x.order_id = o.id), '{}'::jsonb))
      from public.workshop_customers c
      left join public.workshop_vehicles v on v.id = o.vehicle_id
     where c.id = o.customer_id);
end;
$$;

create or replace function public.pista_order_notes(p_order uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'body', n.body, 'item_id', n.item_id, 'created_at', n.created_at, 'created_by', n.created_by,
           'created_by_name', (select p.full_name from public.profiles p where p.id = n.created_by),
           'voided', n.voided_at is not null) order by n.created_at), '[]'::jsonb)
    from public.workshop_os_notes n where n.order_id = p_order;
$$;
revoke execute on function public.pista_order_notes(uuid) from public, anon, authenticated;

create or replace function public.pista_order_audios(p_order uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'storage_path', a.storage_path, 'mime_type', a.mime_type, 'duration_seconds', a.duration_seconds,
           'title', a.title, 'item_id', a.item_id, 'created_at', a.created_at,
           'created_by_name', (select p.full_name from public.profiles p where p.id = a.created_by),
           'expired', a.expired_at is not null) order by a.created_at), '[]'::jsonb)
    from public.workshop_os_audios a where a.order_id = p_order;
$$;
revoke execute on function public.pista_order_audios(uuid) from public, anon, authenticated;

revoke execute on function public.pista_get_order(uuid, uuid) from public, anon;
grant execute on function public.pista_get_order(uuid, uuid) to authenticated;

-- Notas e áudios para a OS do painel (qualquer membro da oficina).
create or replace function public.workshop_order_media(p_org uuid, p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'member');
  if not exists (select 1 from public.workshop_service_orders where id = p_order and organization_id = p_org) then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('notes', public.pista_order_notes(p_order), 'audios', public.pista_order_audios(p_order));
end;
$$;
revoke execute on function public.workshop_order_media(uuid, uuid) from public, anon;
grant execute on function public.workshop_order_media(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Ações da pista (todas aceitam repetição: a fila sem internet pode reenviar)
-- -----------------------------------------------------------------------------
create or replace function public.pista_take_order(p_org uuid, p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.pista_lock(p_org, p_order);
  if public.wo_is_closed(o.status) then raise exception 'Ordem de serviço encerrada.' using errcode = 'P0001'; end if;
  if o.mechanic_user_id = auth.uid() then return; end if;
  update public.workshop_service_orders set mechanic_user_id = auth.uid() where id = o.id;
  perform public.wo_event(p_org, o.id, 'taken', null, null, '{}'::jsonb);
end;
$$;

create or replace function public.pista_set_status(p_org uuid, p_order uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.pista_lock(p_org, p_order);
  if p_status not in ('in_progress', 'paused', 'awaiting_parts') then
    raise exception 'Situação inválida na pista.' using errcode = '22023';
  end if;
  if o.mechanic_user_id is null then
    update public.workshop_service_orders set mechanic_user_id = auth.uid() where id = o.id;
    perform public.wo_event(p_org, o.id, 'taken', null, null, '{}'::jsonb);
  end if;
  perform public.workshop_set_order_status(p_org, p_order, p_status, 'App da Pista');
end;
$$;

create or replace function public.pista_mark_ready(p_org uuid, p_order uuid, p_km_out int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.pista_lock(p_org, p_order);
  if not public.pista_is_responsible(p_org)
     and not coalesce((select pista_allow_ready from public.workshops where organization_id = p_org), true) then
    raise exception 'Nesta oficina, quem marca "Pronto" é o responsável.' using errcode = '42501';
  end if;
  if public.wo_is_closed(o.status) then raise exception 'Ordem de serviço encerrada.' using errcode = 'P0001'; end if;
  if p_km_out is not null and (p_km_out < 0 or p_km_out > 9999999 or (o.km_in is not null and p_km_out < o.km_in)) then
    raise exception 'Km de saída inválido (menor que o de entrada?).' using errcode = '22023';
  end if;
  if o.status = 'ready' and o.km_out is not distinct from coalesce(p_km_out, o.km_out) then return; end if;
  update public.workshop_service_orders set status = 'ready', km_out = coalesce(p_km_out, km_out) where id = o.id;
  perform public.wo_event(p_org, o.id, 'mechanic_ready', o.status, 'ready', jsonb_build_object('km_out', p_km_out));
end;
$$;

create or replace function public.pista_set_item(p_org uuid, p_order uuid, p_item uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pista_lock(p_org, p_order);
  if p_status not in ('pending', 'done', 'not_done') then
    raise exception 'Situação do item inválida.' using errcode = '22023';
  end if;
  if exists (select 1 from public.workshop_service_order_items where id = p_item and order_id = p_order and status = p_status) then
    return;
  end if;
  perform public.workshop_update_order_item(p_org, p_order, p_item, jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.pista_add_note(p_org uuid, p_order uuid, p_client_id uuid, p_body text, p_item uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        v_id uuid;
        v_body text := btrim(coalesce(p_body, ''));
begin
  o := public.pista_lock(p_org, p_order);
  if p_client_id is null then raise exception 'Envio inválido.' using errcode = '22023'; end if;
  select id into v_id from public.workshop_os_notes where client_id = p_client_id and order_id = o.id;
  if found then return v_id; end if;
  if o.status in ('delivered', 'canceled') then raise exception 'Ordem de serviço encerrada.' using errcode = 'P0001'; end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'Escreva a nota (até 2.000 caracteres).' using errcode = '22023'; end if;
  if p_item is not null and not exists (select 1 from public.workshop_service_order_items where id = p_item and order_id = o.id) then
    raise exception 'Item não encontrado nesta OS.' using errcode = 'P0002';
  end if;
  if (select count(*) from public.workshop_os_notes where order_id = o.id) >= 200 then
    raise exception 'Limite de 200 notas por OS.' using errcode = 'P0001';
  end if;
  insert into public.workshop_os_notes (organization_id, order_id, item_id, client_id, body, created_by)
  values (p_org, o.id, p_item, p_client_id, v_body, auth.uid()) returning id into v_id;
  perform public.wo_event(p_org, o.id, 'note_added', null, null, '{}'::jsonb);
  return v_id;
end;
$$;

create or replace function public.pista_void_note(p_org uuid, p_order uuid, p_note uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        n public.workshop_os_notes;
begin
  o := public.wo_lock(p_org, p_order, 'execute_orders');
  select * into n from public.workshop_os_notes where id = p_note and order_id = o.id;
  if not found then raise exception 'Nota não encontrada.' using errcode = 'P0002'; end if;
  if n.voided_at is not null then return; end if;
  if n.created_by is distinct from auth.uid() and not public.pista_is_responsible(p_org) then
    raise exception 'Só quem escreveu ou o responsável anula a nota.' using errcode = '42501';
  end if;
  update public.workshop_os_notes set voided_at = now(), voided_by = auth.uid() where id = n.id;
  perform public.wo_event(p_org, o.id, 'note_voided', null, null, '{}'::jsonb);
end;
$$;

create or replace function public.pista_add_photo(p_org uuid, p_order uuid, p_path text, p_phase text, p_caption text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  perform public.pista_lock(p_org, p_order);
  select id into v_id from public.workshop_os_photos where storage_path = p_path and order_id = p_order;
  if found then return v_id; end if;
  return public.workshop_register_os_photo(p_org, p_order, p_path, p_phase, p_caption);
end;
$$;

create or replace function public.pista_add_audio(p_org uuid, p_order uuid, p_path text, p_duration int,
                                                  p_title text default null, p_item uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        v_obj record;
        v_id uuid;
begin
  o := public.pista_lock(p_org, p_order);
  select id into v_id from public.workshop_os_audios where storage_path = p_path and order_id = o.id;
  if found then return v_id; end if;
  if o.status in ('delivered', 'canceled') then raise exception 'Ordem de serviço encerrada.' using errcode = 'P0001'; end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> p_org::text or p_path !~ '\.(m4a|webm|ogg)$' then
    raise exception 'Arquivo de áudio inválido.' using errcode = '42501';
  end if;
  if p_duration is null or p_duration not between 1 and 120 then
    raise exception 'O áudio deve ter de 1 segundo a 2 minutos.' using errcode = '22023';
  end if;
  if p_item is not null and not exists (select 1 from public.workshop_service_order_items where id = p_item and order_id = o.id) then
    raise exception 'Item não encontrado nesta OS.' using errcode = 'P0002';
  end if;
  select o2.metadata ->> 'mimetype' as mime, (o2.metadata ->> 'size')::bigint as size, coalesce(o2.owner_id, o2.owner::text) as owner
    into v_obj from storage.objects o2 where o2.bucket_id = 'workshop-files' and o2.name = p_path;
  if v_obj is null or v_obj.owner is distinct from auth.uid()::text then
    raise exception 'Arquivo não encontrado.' using errcode = 'P0002';
  end if;
  if v_obj.mime not in ('audio/mp4', 'audio/webm', 'audio/ogg') then
    raise exception 'Formato de áudio não aceito.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.attachment_checks c where c.storage_path = p_path and c.ok and c.mime_type = v_obj.mime
                   and c.checked_at > now() - interval '2 hours') then
    raise exception 'O arquivo ainda não foi conferido. Envie de novo.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.workshop_os_audios where order_id = o.id) >= 30 then
    raise exception 'Limite de 30 áudios por ordem de serviço.' using errcode = 'P0001';
  end if;
  insert into public.workshop_os_audios (organization_id, order_id, item_id, storage_path, mime_type, file_size, duration_seconds, title, created_by)
  values (p_org, o.id, p_item, p_path, v_obj.mime, v_obj.size, p_duration, nullif(left(btrim(coalesce(p_title, '')), 120), ''), auth.uid())
  returning id into v_id;
  perform public.wo_event(p_org, o.id, 'audio_added', null, null, jsonb_build_object('seconds', p_duration));
  return v_id;
end;
$$;

create or replace function public.pista_save_inspection(p_org uuid, p_order uuid, p_phase text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pista_lock(p_org, p_order);
  perform public.workshop_save_inspection(p_org, p_order, p_phase, p_data);
end;
$$;

revoke execute on function public.pista_take_order(uuid, uuid) from public, anon;
revoke execute on function public.pista_set_status(uuid, uuid, text) from public, anon;
revoke execute on function public.pista_mark_ready(uuid, uuid, int) from public, anon;
revoke execute on function public.pista_set_item(uuid, uuid, uuid, text) from public, anon;
revoke execute on function public.pista_add_note(uuid, uuid, uuid, text, uuid) from public, anon;
revoke execute on function public.pista_void_note(uuid, uuid, uuid) from public, anon;
revoke execute on function public.pista_add_photo(uuid, uuid, text, text, text) from public, anon;
revoke execute on function public.pista_add_audio(uuid, uuid, text, int, text, uuid) from public, anon;
revoke execute on function public.pista_save_inspection(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.pista_take_order(uuid, uuid) to authenticated;
grant execute on function public.pista_set_status(uuid, uuid, text) to authenticated;
grant execute on function public.pista_mark_ready(uuid, uuid, int) to authenticated;
grant execute on function public.pista_set_item(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.pista_add_note(uuid, uuid, uuid, text, uuid) to authenticated;
grant execute on function public.pista_void_note(uuid, uuid, uuid) to authenticated;
grant execute on function public.pista_add_photo(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.pista_add_audio(uuid, uuid, text, int, text, uuid) to authenticated;
grant execute on function public.pista_save_inspection(uuid, uuid, text, jsonb) to authenticated;
