-- =============================================================================
-- Moto Passaporte — Migração: módulo Oficina, Fase 3 (PRD 2.1 §17 e §25 — histórico permanente)
-- Objetivo: ao concluir a OS de uma moto vinculada a passaporte com autorização vigente, gerar o
--           registro de manutenção pelo fluxo que já existe (create_workshop_service: origem
--           "oficina", autoria, km, peças, aviso ao titular), só com o que foi EXECUTADO.
--           Fotos da OS podem ir para o histórico pelo fluxo de anexos da oficina (conferência,
--           cota). Correções seguem o fluxo de correção existente (registro novo, original preservado).
-- Regras: orçamento/OS aberta não geram manutenção; itens não executados ou recusados nunca entram;
--         sem vínculo ou sem autorização vigente, o atendimento fica só no registro da oficina;
--         uma OS gera no máximo um registro (o que vier depois é correção).
-- Reversão: supabase/rollback/20261108192705_workshop_history_integration.down.sql
-- =============================================================================

alter table public.workshop_service_orders
  add column if not exists maintenance_record_id uuid references public.maintenance_records (id) on delete restrict,
  add column if not exists history_published_at  timestamptz,
  add column if not exists history_published_by  uuid references auth.users (id) on delete set null;
create unique index if not exists workshop_service_orders_record_uq on public.workshop_service_orders (maintenance_record_id)
  where maintenance_record_id is not null;
comment on column public.workshop_service_orders.maintenance_record_id is
  'Registro gerado no histórico da moto a partir desta OS (PRD 2.1 §17). Correções posteriores ficam ligadas ao registro original.';

alter table public.workshop_os_photos
  add column if not exists history_attachment_id uuid references public.attachments (id) on delete restrict;

alter table public.workshop_service_order_events drop constraint if exists workshop_service_order_events_kind_check;
alter table public.workshop_service_order_events add constraint workshop_service_order_events_kind_check check (kind in (
  'created', 'status_changed', 'assigned', 'item_added', 'item_updated', 'complement_added',
  'checklist_saved', 'photo_added', 'photo_removed', 'link_created', 'customer_ack', 'completed',
  'pickup_notified', 'delivered', 'canceled', 'notes_updated', 'history_published', 'history_photo_added'));


-- OS concluída é registro fixo: valores, km, comprovante e vínculo com o histórico não mudam (§17.5).
create or replace function public.wo_protect_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Ordens de serviço não são apagadas; cancele.' using errcode = '42501';
  end if;
  if old.maintenance_record_id is not null and new.maintenance_record_id is distinct from old.maintenance_record_id then
    raise exception 'O vínculo da OS com o histórico não pode ser trocado.' using errcode = '42501';
  end if;
  if old.status in ('completed', 'awaiting_pickup', 'delivered') and (
       new.final_total_cents is distinct from old.final_total_cents or new.km_out is distinct from old.km_out
       or new.receipt_code is distinct from old.receipt_code or new.completed_at is distinct from old.completed_at
       or new.adjustment_cents is distinct from old.adjustment_cents or new.customer_id is distinct from old.customer_id
       or new.vehicle_id is distinct from old.vehicle_id or new.quote_id is distinct from old.quote_id
       or new.status not in ('completed', 'awaiting_pickup', 'delivered')) then
    raise exception 'Ordem de serviço concluída não pode ser alterada.' using errcode = '42501';
  end if;
  if old.status in ('delivered', 'canceled') and new.status is distinct from old.status then
    raise exception 'Ordem de serviço encerrada.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.wo_protect_order() from public, anon, authenticated;
drop trigger if exists workshop_service_orders_protect on public.workshop_service_orders;
create trigger workshop_service_orders_protect before update or delete on public.workshop_service_orders
  for each row execute function public.wo_protect_order();

-- Categoria sugerida: a mais frequente entre os serviços executados vindos do catálogo.
create or replace function public.wo_history_category(p_order uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with cats as (
    select case s.category
             when 'motor' then 'engine' when 'lubrificacao' then 'oil_change' when 'transmissao' then 'transmission'
             when 'freios' then 'brakes' when 'pneus' then 'tires' when 'suspensao' then 'suspension'
             when 'eletrica' then 'electrical' when 'injecao' then 'electrical' when 'arrefecimento' then 'cooling'
             when 'embreagem' then 'transmission' when 'revisoes' then 'revision' when 'acessorios' then 'accessories'
             else 'other' end as cat
      from public.workshop_service_order_items i
      join lateral (select a.version_id from public.workshop_quote_approvals a
                     where a.quote_id = i.quote_id and a.decision in ('approved', 'partial') order by a.created_at desc limit 1) ap on true
      join public.workshop_quote_items qi on qi.version_id = ap.version_id and qi.position = i.quote_position
      join public.workshop_service_catalog s on s.id = qi.service_id
     where i.order_id = p_order and i.status = 'done' and i.quote_id is not null
  )
  select coalesce((select case when count(distinct cat) > 2 then 'revision' else
                     (select cat from cats group by cat order by count(*) desc, cat limit 1) end from cats having count(*) > 0),
                  'repairs');
$$;
revoke execute on function public.wo_history_category(uuid) from public, anon, authenticated;

-- Situação da OS em relação ao histórico do passaporte.
create or replace function public.wo_history_state(p_org uuid, o public.workshop_service_orders)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_moto uuid;
        v_done int;
        v_title text;
        v_first text;
begin
  select motorcycle_id into v_moto from public.workshop_vehicles where id = o.vehicle_id and organization_id = p_org;
  select count(*), min(description) filter (where position = (select min(position) from public.workshop_service_order_items
                                                               where order_id = o.id and status = 'done'))
    into v_done, v_first
    from public.workshop_service_order_items where order_id = o.id and status = 'done';
  v_title := case when v_done <= 1 then coalesce(v_first, 'Serviço da oficina')
                  else left(v_first, 80) || ' e mais ' || (v_done - 1) || ' serviço' || case when v_done > 2 then 's' else '' end end;
  return jsonb_build_object(
    'state', case
               when o.maintenance_record_id is not null then 'published'
               when o.status not in ('completed', 'awaiting_pickup', 'delivered') then 'not_completed'
               when o.vehicle_id is null then 'no_vehicle'
               when v_moto is null then 'not_linked'
               when not public.workshop_has_access(v_moto, p_org) then 'no_access'
               when not (public.has_org_permission(p_org, 'manage_quotes') and public.has_org_permission(p_org, 'register_services')) then 'no_permission'
               else 'ready' end,
    'motorcycle_id', v_moto,
    'record_id', o.maintenance_record_id,
    'published_at', o.history_published_at,
    'suggested_category', public.wo_history_category(o.id),
    'suggested_title', left(v_title, 120),
    'done_items', v_done);
end;
$$;
revoke execute on function public.wo_history_state(uuid, public.workshop_service_orders) from public, anon, authenticated;

-- Gera o registro no histórico pelo fluxo da oficina (create_workshop_service). Só itens executados.
create or replace function public.wo_publish(p_org uuid, o public.workshop_service_orders, p_category text, p_title text, p_include_value boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare st jsonb := public.wo_history_state(p_org, o);
        v_moto uuid := (st ->> 'motorcycle_id')::uuid;
        v_desc text;
        v_parts jsonb;
        v_notes text;
        v_res jsonb;
        v_id uuid;
        v_category public.maintenance_category;
begin
  if st ->> 'state' <> 'ready' then
    raise exception '%', case st ->> 'state'
      when 'published' then 'Esta OS já está no histórico da moto. Para mudar, use a correção do registro.'
      when 'not_completed' then 'Conclua a OS antes de registrar no histórico.'
      when 'no_vehicle' then 'A OS não tem moto.'
      when 'not_linked' then 'A moto desta OS não está vinculada a um passaporte. Vincule na ficha do cliente (com autorização do titular).'
      when 'no_access' then 'A autorização do titular para esta moto não está mais vigente.'
      else 'Você não tem permissão para registrar serviços no histórico.' end using errcode = 'P0001';
  end if;
  begin
    v_category := coalesce(nullif(p_category, ''), st ->> 'suggested_category')::public.maintenance_category;
  exception when invalid_text_representation then
    raise exception 'Categoria inválida.' using errcode = '22023';
  end;
  select 'Serviços executados (OS nº ' || o.number || '): ' ||
         string_agg(i.description || case when i.quantity <> 1 then ' (' || trim(to_char(i.quantity, 'FM999990.###')) || ')' else '' end, '; ' order by i.position) || '.'
    into v_desc
    from public.workshop_service_order_items i where i.order_id = o.id and i.status = 'done';
  select coalesce(jsonb_agg(jsonb_build_object('item_name', left(i.description, 120), 'brand', left(i.part_brand, 80),
                                               'part_number', left(i.part_code, 60), 'quantity', least(i.quantity, 10000),
                                               'notes', left(i.notes, 300)) order by i.position), '[]'::jsonb)
    into v_parts
    from (select * from public.workshop_service_order_items
           where order_id = o.id and status = 'done' and kind in ('part', 'product', 'material') order by position limit 50) i;
  v_notes := concat_ws(' ', nullif(btrim(coalesce(o.completion_notes, '')), ''),
                       'Comprovante da oficina: OS nº ' || o.number || ', código ' || coalesce(o.receipt_code, '—') || '.');
  v_res := public.create_workshop_service(p_org, v_moto, v_category, left(coalesce(nullif(btrim(p_title), ''), st ->> 'suggested_title'), 120),
                                          (o.completed_at at time zone 'America/Sao_Paulo')::date, left(v_desc, 2000), o.km_out,
                                          case when coalesce(p_include_value, true) then o.final_total_cents end, left(v_notes, 2000), v_parts);
  v_id := (v_res ->> 'id')::uuid;
  update public.workshop_service_orders
     set maintenance_record_id = v_id, history_published_at = now(), history_published_by = auth.uid()
   where id = o.id;
  perform public.wo_event(p_org, o.id, 'history_published', null, null,
                          jsonb_build_object('record_id', v_id, 'category', v_category, 'below_previous', v_res -> 'below_previous'));
  return v_id;
end;
$$;
revoke execute on function public.wo_publish(uuid, public.workshop_service_orders, text, text, boolean) from public, anon, authenticated;

create or replace function public.workshop_publish_order_to_history(p_org uuid, p_order uuid, p_category text default null,
                                                                    p_title text default null, p_include_value boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.wo_lock(p_org, p_order, 'manage_quotes');
  return public.wo_publish(p_org, o, p_category, p_title, p_include_value);
end;
$$;

-- Conclusão: mesma regra de antes + registro automático no histórico quando possível (§25 Fase 3).
drop function if exists public.workshop_complete_order(uuid, uuid, integer, text, bigint, text);
create function public.workshop_complete_order(p_org uuid, p_order uuid, p_km_out int, p_notes text,
                                               p_adjustment_cents bigint default 0, p_adjustment_reason text default null,
                                               p_history jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        v_pending int;
        v_done int;
        v_total bigint;
        v_code text := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
        v_state jsonb;
        v_record uuid;
        v_prev text;
begin
  o := public.wo_lock(p_org, p_order, 'manage_quotes');
  v_prev := o.status;
  if public.wo_is_closed(o.status) then raise exception 'Ordem de serviço já encerrada.' using errcode = 'P0001'; end if;
  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'done'),
         coalesce(sum(subtotal_cents - discount_cents) filter (where status = 'done'), 0)
    into v_pending, v_done, v_total
    from public.workshop_service_order_items where order_id = o.id;
  if v_pending > 0 then
    raise exception 'Confira todos os serviços: marque cada item como executado ou não executado (% pendente%).', v_pending,
      case when v_pending = 1 then '' else 's' end using errcode = 'P0001';
  end if;
  if v_done = 0 then raise exception 'Nenhum serviço executado. Se nada foi feito, cancele a OS.' using errcode = 'P0001'; end if;
  if p_km_out is null or p_km_out < 0 then raise exception 'Informe a quilometragem final.' using errcode = '22023'; end if;
  if o.km_in is not null and p_km_out < o.km_in then
    raise exception 'A quilometragem final (%) é menor que a de entrada (%).', p_km_out, o.km_in using errcode = '22023';
  end if;
  if coalesce(p_adjustment_cents, 0) <> 0 and char_length(btrim(coalesce(p_adjustment_reason, ''))) < 3 then
    raise exception 'Explique o ajuste no valor final.' using errcode = '22023';
  end if;
  if v_total + coalesce(p_adjustment_cents, 0) < 0 then raise exception 'Valor final não pode ser negativo.' using errcode = '22023'; end if;
  update public.workshop_service_orders
     set status = 'completed', km_out = p_km_out, completion_notes = nullif(btrim(coalesce(p_notes, '')), ''),
         adjustment_cents = coalesce(p_adjustment_cents, 0),
         adjustment_reason = case when coalesce(p_adjustment_cents, 0) <> 0 then btrim(p_adjustment_reason) end,
         final_total_cents = v_total + coalesce(p_adjustment_cents, 0),
         completed_at = now(), completed_by = auth.uid(), receipt_code = v_code
   where id = o.id
  returning * into o;
  if o.vehicle_id is not null then
    update public.workshop_vehicles set km = greatest(coalesce(km, 0), p_km_out) where id = o.vehicle_id and organization_id = p_org;
  end if;
  perform public.wo_event(p_org, o.id, 'completed', v_prev, 'completed',
                          jsonb_build_object('final_total_cents', o.final_total_cents, 'km_out', p_km_out, 'receipt_code', v_code));
  v_state := public.wo_history_state(p_org, o);
  if v_state ->> 'state' = 'ready' and coalesce((p_history ->> 'publish')::boolean, true) then
    v_record := public.wo_publish(p_org, o, p_history ->> 'category', p_history ->> 'title',
                                  coalesce((p_history ->> 'include_value')::boolean, true));
  end if;
  return jsonb_build_object('final_total_cents', o.final_total_cents, 'receipt_code', v_code,
                            'history_state', case when v_record is not null then 'published' else v_state ->> 'state' end,
                            'record_id', v_record);
end;
$$;

-- Foto da OS anexada ao registro (o site copia o arquivo pelo fluxo de anexos da oficina e informa aqui).
create or replace function public.workshop_link_photo_to_history(p_org uuid, p_order uuid, p_photo uuid, p_attachment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
begin
  o := public.wo_lock(p_org, p_order, 'manage_quotes');
  if o.maintenance_record_id is null then raise exception 'A OS ainda não está no histórico.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.attachments a where a.id = p_attachment and a.organization_id = p_org
                   and a.maintenance_record_id = o.maintenance_record_id) then
    raise exception 'Anexo não pertence ao registro desta OS.' using errcode = '42501';
  end if;
  update public.workshop_os_photos set history_attachment_id = p_attachment
   where id = p_photo and order_id = o.id and removed_at is null and history_attachment_id is null;
  if not found then raise exception 'Foto não encontrada ou já enviada ao histórico.' using errcode = 'P0001'; end if;
  perform public.wo_event(p_org, o.id, 'history_photo_added');
end;
$$;

-- Leitura da OS com a situação do histórico (substitui a da Fase 2, mesmos campos + "history").
create or replace function public.workshop_order_history(p_org uuid, p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare o public.workshop_service_orders;
        st jsonb;
begin
  perform public.wq_assert(p_org, 'member');
  select * into o from public.workshop_service_orders where id = p_order and organization_id = p_org;
  if not found then raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002'; end if;
  st := public.wo_history_state(p_org, o);
  return st || jsonb_build_object(
    'record', (select jsonb_build_object('id', r.id, 'title', r.title, 'category', r.category, 'service_date', r.service_date,
                        'mileage', r.mileage, 'superseded', exists (select 1 from public.maintenance_records c where c.corrects_record_id = r.id))
                 from public.maintenance_records r where r.id = o.maintenance_record_id),
    'photos_in_history', (select count(*) from public.workshop_os_photos where order_id = o.id and history_attachment_id is not null),
    'photo_ids_in_history', coalesce((select jsonb_agg(id) from public.workshop_os_photos where order_id = o.id and history_attachment_id is not null), '[]'::jsonb),
    'vehicle_label', (select concat_ws(' ', v.brand, v.model, v.year) from public.workshop_vehicles v where v.id = o.vehicle_id));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['workshop_publish_order_to_history(uuid, uuid, text, text, boolean)',
                           'workshop_complete_order(uuid, uuid, integer, text, bigint, text, jsonb)',
                           'workshop_link_photo_to_history(uuid, uuid, uuid, uuid)', 'workshop_order_history(uuid, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
