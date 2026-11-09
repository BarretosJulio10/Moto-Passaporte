-- =============================================================================
-- Fluxo da oficina, Fase B (ADR-060): a moto entra ANTES do orçamento.
-- Entrada → Diagnóstico → Orçamento (ligado à OS da entrada) → itens aprovados
-- entram na MESMA OS → pista → caixa → entrega. O fluxo antigo continua:
-- orçamento sem entrada vira OS nova; OS manual exige autorização.
-- =============================================================================

-- 1) OS aberta na entrada, sem itens e sem autorização (a autorização continua por item).
alter table public.workshop_service_orders
  add column if not exists opened_at_entry boolean not null default false,
  add column if not exists diagnosed_at timestamptz,
  add column if not exists diagnosed_by uuid references auth.users (id) on delete set null;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.workshop_service_orders'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%quote_id IS NOT NULL%auth_method IS NOT NULL%' loop
    execute format('alter table public.workshop_service_orders drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.workshop_service_orders add constraint workshop_service_orders_authorized_check
  check (quote_id is not null or opened_at_entry or (auth_method is not null and auth_by_name is not null));

-- Orçamento nascido de uma entrada.
alter table public.workshop_quotes add column if not exists entry_order_id uuid;
alter table public.workshop_quotes add constraint workshop_quotes_entry_order_fk
  foreign key (organization_id, entry_order_id) references public.workshop_service_orders (organization_id, id) on delete restrict;
create index if not exists workshop_quotes_entry_order_idx on public.workshop_quotes (entry_order_id) where entry_order_id is not null;

alter table public.workshop_service_order_events drop constraint if exists workshop_service_order_events_kind_check;
alter table public.workshop_service_order_events add constraint workshop_service_order_events_kind_check check (kind in (
  'created', 'status_changed', 'assigned', 'item_added', 'item_updated', 'complement_added', 'checklist_saved',
  'photo_added', 'photo_removed', 'link_created', 'customer_ack', 'completed', 'pickup_notified', 'delivered',
  'canceled', 'notes_updated', 'history_published', 'history_photo_added',
  'note_added', 'note_voided', 'audio_added', 'mechanic_ready', 'taken',
  'diagnosed', 'quote_created', 'quote_items_added'));

-- Sem item autorizado não há o que executar: OS da entrada não vai para a pista nem fica pronta.
create or replace function public.wo_has_work(p_order uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.workshop_service_order_items where order_id = p_order and status <> 'not_done');
$$;
revoke execute on function public.wo_has_work(uuid) from public, anon, authenticated;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.workshop_set_order_status(uuid, uuid, text, text)'::regprocedure);
  if position('if o.status = p_status then return; end if;' in v_def) = 0 then
    raise exception 'workshop_set_order_status mudou; revisar o patch';
  end if;
  v_def := replace(v_def, 'if o.status = p_status then return; end if;',
    'if o.status = p_status then return; end if;
  if p_status in (''awaiting_execution'', ''in_progress'', ''paused'', ''ready'') and not public.wo_has_work(o.id) then
    raise exception ''Esta OS ainda não tem serviço autorizado: faça o orçamento (ou inclua um item autorizado) antes de executar.'' using errcode = ''P0001'';
  end if;');
  execute v_def;

  v_def := pg_get_functiondef('public.pista_mark_ready(uuid, uuid, integer)'::regprocedure);
  if position('if public.wo_is_closed(o.status) then raise exception ''Ordem de serviço encerrada.'' using errcode = ''P0001''; end if;' in v_def) = 0 then
    raise exception 'pista_mark_ready mudou; revisar o patch';
  end if;
  v_def := replace(v_def, 'if public.wo_is_closed(o.status) then raise exception ''Ordem de serviço encerrada.'' using errcode = ''P0001''; end if;',
    'if public.wo_is_closed(o.status) then raise exception ''Ordem de serviço encerrada.'' using errcode = ''P0001''; end if;
  if not public.wo_has_work(o.id) then
    raise exception ''Esta OS ainda não tem serviço autorizado. Marque "Diagnóstico pronto" para o balcão montar o orçamento.'' using errcode = ''P0001'';
  end if;');
  execute v_def;
end;
$$;

-- 2) Nova entrada
create or replace function public.workshop_create_entry(p_org uuid, p_customer uuid, p_vehicle uuid, p_km int default null,
                                                        p_problem text default null, p_due date default null,
                                                        p_to_diagnosis boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
        v_status text := case when coalesce(p_to_diagnosis, true) then 'awaiting_diagnosis' else 'open' end;
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if not exists (select 1 from public.workshop_customers where id = p_customer and organization_id = p_org and status = 'active') then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if p_vehicle is null or not exists (select 1 from public.workshop_vehicles where id = p_vehicle and organization_id = p_org and customer_id = p_customer) then
    raise exception 'Escolha a moto do cliente.' using errcode = '22023';
  end if;
  if p_km is not null and (p_km < 0 or p_km > 9999999) then
    raise exception 'Quilometragem inválida.' using errcode = '22023';
  end if;
  if exists (select 1 from public.workshop_service_orders where organization_id = p_org and vehicle_id = p_vehicle
              and status not in ('completed', 'awaiting_pickup', 'delivered', 'canceled')) then
    raise exception 'Esta moto já está na oficina (há uma OS em aberto). Abra a OS existente.' using errcode = 'P0001';
  end if;
  insert into public.workshop_service_orders (organization_id, number, customer_id, vehicle_id, status, km_in, notes, due_date,
                                              opened_at_entry, created_by)
  values (p_org, public.wq_next_number(p_org, 'service_order'), p_customer, p_vehicle, v_status, p_km,
          nullif(left(btrim(coalesce(p_problem, '')), 2000), ''), p_due, true, auth.uid())
  returning id into v_id;
  if p_km is not null then
    update public.workshop_vehicles set km = greatest(coalesce(km, 0), p_km) where id = p_vehicle;
  end if;
  perform public.wo_event(p_org, v_id, 'created', null, v_status, jsonb_build_object('entry', true));
  return v_id;
end;
$$;
revoke execute on function public.workshop_create_entry(uuid, uuid, uuid, int, text, date, boolean) from public, anon;
grant execute on function public.workshop_create_entry(uuid, uuid, uuid, int, text, date, boolean) to authenticated;

-- 3) Diagnóstico pronto (painel e pista)
create or replace function public.wo_mark_diagnosed(p_org uuid, o public.workshop_service_orders, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_text text := nullif(left(btrim(coalesce(p_text, '')), 4000), '');
begin
  if public.wo_is_closed(o.status) then raise exception 'Ordem de serviço encerrada.' using errcode = 'P0001'; end if;
  if o.diagnosed_at is not null and v_text is null then return; end if;
  update public.workshop_service_orders
     set diagnosed_at = now(), diagnosed_by = auth.uid(),
         technical_notes = case when v_text is null then technical_notes
                                when technical_notes is null then v_text
                                else left(technical_notes || E'\n' || v_text, 4000) end,
         status = case when status = 'open' then 'awaiting_diagnosis' else status end
   where id = o.id;
  perform public.wo_event(p_org, o.id, 'diagnosed', o.status, null, jsonb_build_object('text', v_text));
end;
$$;
revoke execute on function public.wo_mark_diagnosed(uuid, public.workshop_service_orders, text) from public, anon, authenticated;

create or replace function public.workshop_mark_diagnosed(p_org uuid, p_order uuid, p_text text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wo_mark_diagnosed(p_org, public.wo_lock(p_org, p_order, 'execute_orders'), p_text);
end;
$$;
revoke execute on function public.workshop_mark_diagnosed(uuid, uuid, text) from public, anon;
grant execute on function public.workshop_mark_diagnosed(uuid, uuid, text) to authenticated;

create or replace function public.pista_mark_diagnosed(p_org uuid, p_order uuid, p_text text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.pista_lock(p_org, p_order);
  if o.mechanic_user_id is null then
    update public.workshop_service_orders set mechanic_user_id = auth.uid() where id = o.id;
    perform public.wo_event(p_org, o.id, 'taken', null, null, '{}'::jsonb);
  end if;
  perform public.wo_mark_diagnosed(p_org, o, p_text);
end;
$$;
revoke execute on function public.pista_mark_diagnosed(uuid, uuid, text) from public, anon;
grant execute on function public.pista_mark_diagnosed(uuid, uuid, text) to authenticated;

-- 4) Orçamento a partir da entrada (já com cliente, moto, km, problema e diagnóstico)
create or replace function public.workshop_quote_from_order(p_org uuid, p_order uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        v_id uuid;
begin
  o := public.wo_lock(p_org, p_order, 'manage_quotes');
  if public.wo_is_closed(o.status) then raise exception 'Ordem de serviço encerrada.' using errcode = 'P0001'; end if;
  if not o.opened_at_entry then
    raise exception 'Esta OS não nasceu de uma entrada. Para serviço a mais, use o orçamento complementar.' using errcode = 'P0001';
  end if;
  if o.quote_id is not null then
    raise exception 'O orçamento desta entrada já foi aprovado. Para serviço a mais, use o orçamento complementar.' using errcode = 'P0001';
  end if;
  select id into v_id from public.workshop_quotes
   where entry_order_id = o.id and status not in ('canceled', 'rejected', 'expired')
   order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;
  v_id := public.workshop_create_quote(p_org, o.customer_id, o.vehicle_id, null, null);
  update public.workshop_quotes set entry_order_id = o.id where id = v_id;
  update public.workshop_quote_versions
     set km = coalesce(o.km_in, km), problem = o.notes, diagnosis = left(o.technical_notes, 2000)
   where quote_id = v_id and version_no = 1;
  update public.workshop_service_orders set status = 'awaiting_approval' where id = o.id and status in ('open', 'awaiting_diagnosis');
  perform public.wo_event(p_org, o.id, 'quote_created', o.status, 'awaiting_approval',
                          jsonb_build_object('quote_number', (select number from public.workshop_quotes where id = v_id)));
  return v_id;
end;
$$;
revoke execute on function public.workshop_quote_from_order(uuid, uuid) from public, anon;
grant execute on function public.workshop_quote_from_order(uuid, uuid) to authenticated;

-- 5) Orçamento aprovado de uma entrada: itens entram na MESMA OS (mesmo botão "Abrir ordem de serviço").
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.workshop_create_order_from_quote(uuid, uuid)'::regprocedure);
  if position('if v_id is not null then return v_id; end if;' in v_def) = 0 then
    raise exception 'workshop_create_order_from_quote mudou; revisar o patch';
  end if;
  v_def := replace(v_def, 'if v_id is not null then return v_id; end if;',
    'if v_id is not null then return v_id; end if;
  if q.entry_order_id is not null then
    select id into v_id from public.workshop_service_orders
     where id = q.entry_order_id and organization_id = p_org and status not in (''delivered'', ''canceled'') for update;
    if v_id is not null then
      perform public.wo_copy_quote_items(p_org, v_id, q.id, ''quote'');
      update public.workshop_service_orders
         set quote_id = q.id,
             status = case when status in (''open'', ''awaiting_diagnosis'', ''awaiting_approval'') then ''awaiting_execution'' else status end,
             due_date = coalesce(due_date, current_date + coalesce((select estimated_days from public.workshop_quote_versions
                                                                     where quote_id = q.id and version_no = q.current_version), 0))
       where id = v_id;
      perform public.wo_event(p_org, v_id, ''quote_items_added'', null, ''awaiting_execution'', jsonb_build_object(''quote_number'', q.number));
      return v_id;
    end if;
  end if;');
  execute v_def;
end;
$$;

-- 6) Lista de OS com o que a esteira precisa (entrada, diagnóstico e orçamento da entrada).
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.workshop_list_orders(uuid, text, text, boolean)'::regprocedure);
  if position('o.mechanic_user_id, (select full_name from public.profiles where id = o.mechanic_user_id) as mechanic_name,' in v_def) = 0 then
    raise exception 'workshop_list_orders mudou; revisar o patch';
  end if;
  v_def := replace(v_def, 'o.mechanic_user_id, (select full_name from public.profiles where id = o.mechanic_user_id) as mechanic_name,',
    'o.mechanic_user_id, (select full_name from public.profiles where id = o.mechanic_user_id) as mechanic_name,
               o.opened_at_entry, o.diagnosed_at,
               (select jsonb_build_object(''id'', eq.id, ''number'', eq.number, ''status'', eq.status)
                  from public.workshop_quotes eq where eq.entry_order_id = o.id
                 order by eq.created_at desc limit 1) as entry_quote,');
  execute v_def;
end;
$$;

-- Detalhe da entrada para a tela da OS.
create or replace function public.workshop_order_entry_info(p_org uuid, p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  perform public.wq_assert(p_org, 'member');
  select * into o from public.workshop_service_orders where id = p_order and organization_id = p_org;
  if not found then raise exception 'OS não encontrada.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'opened_at_entry', o.opened_at_entry,
    'diagnosed_at', o.diagnosed_at,
    'diagnosed_by_name', (select full_name from public.profiles where id = o.diagnosed_by),
    'has_work', public.wo_has_work(o.id),
    'quote', (select jsonb_build_object('id', q.id, 'number', q.number, 'status', q.status)
                from public.workshop_quotes q where q.entry_order_id = o.id order by q.created_at desc limit 1));
end;
$$;
revoke execute on function public.workshop_order_entry_info(uuid, uuid) from public, anon;
grant execute on function public.workshop_order_entry_info(uuid, uuid) to authenticated;
