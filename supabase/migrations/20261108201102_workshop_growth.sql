-- =============================================================================
-- PRD 2.1 — Fase 5 do módulo Oficina: crescimento comercial (ADR-047)
-- Perfil público avançado (logo, fotos, marcas, serviços, horário estruturado), avaliações de clientes com
-- OS concluída (resposta da oficina e moderação), agendamento público, campanhas de relacionamento com
-- opção de não receber e preparação para o WhatsApp oficial (sem envio automático).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Perfil público avançado (PRD 2.1 §18)
-- -----------------------------------------------------------------------------
create or replace function public.wp_valid_hours(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_object_keys(p) k where k !~ '^[0-6]$')
    and not exists (
      select 1 from jsonb_each(p) e
       where e.value <> 'null'::jsonb
         and not (jsonb_typeof(e.value) = 'array' and jsonb_array_length(e.value) = 2
                  and (e.value ->> 0) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                  and (e.value ->> 1) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                  and (e.value ->> 0) < (e.value ->> 1))));
$$;

alter table public.workshops
  add column if not exists brands_served text[] not null default '{}'
    check (cardinality(brands_served) <= 30),
  add column if not exists weekly_hours jsonb check (public.wp_valid_hours(weekly_hours)),
  add column if not exists website_url text check (website_url is null or (website_url ~ '^https://[^\s<>"]+$' and char_length(website_url) <= 200)),
  add column if not exists show_services boolean not null default true,
  add column if not exists show_prices boolean not null default false,
  add column if not exists booking_enabled boolean not null default false,
  add column if not exists booking_slot_minutes integer not null default 60 check (booking_slot_minutes in (30, 60, 90, 120)),
  add column if not exists booking_capacity integer not null default 1 check (booking_capacity between 1 and 10),
  add column if not exists booking_days_ahead integer not null default 30 check (booking_days_ahead between 1 and 90),
  add column if not exists booking_min_hours integer not null default 2 check (booking_min_hours between 0 and 72),
  add column if not exists logo_path text;
alter table public.workshops add constraint workshops_booking_needs_hours check (not booking_enabled or weekly_hours is not null);
comment on column public.workshops.weekly_hours is
  'Horário estruturado {"0".."6": ["HH:MM","HH:MM"] | null}, 0 = domingo. Usado no perfil e nos horários do agendamento público.';
comment on column public.workshops.logo_path is 'Logotipo no bucket workshop-files (registrado em workshop_public_photos).';

create table public.workshop_public_photos (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  kind            text not null check (kind in ('logo', 'photo')),
  storage_path    text not null unique,
  mime_type       text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size       bigint not null check (file_size between 1 and 10485760),
  caption         text check (caption is null or char_length(caption) <= 140),
  position        integer not null default 0,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  removed_at      timestamptz
);
comment on table public.workshop_public_photos is 'Logotipo e fotos do perfil público da oficina (PRD 2.1 §18). Visíveis a qualquer pessoa enquanto o perfil é público.';
create index workshop_public_photos_org_idx on public.workshop_public_photos (organization_id, kind) where removed_at is null;

-- O arquivo conferido não pode ser registrado duas vezes (fotos de OS ou do perfil).
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
                                          or exists (select 1 from public.workshop_public_photos p where p.storage_path = o.name))
    from storage.objects o where o.bucket_id = 'workshop-files' and o.name = p_path;
$$;
revoke execute on function public.workshop_file_object_info(text) from public, anon, authenticated;
grant execute on function public.workshop_file_object_info(text) to service_role;

-- Leitura pública só dos arquivos do perfil público (nunca as fotos das OS).
create or replace function public.is_public_workshop_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workshop_public_photos p
      join public.workshops w on w.organization_id = p.organization_id and w.is_public
      join public.organizations o on o.id = p.organization_id and o.status = 'active'
     where p.storage_path = p_name and p.removed_at is null);
$$;
revoke execute on function public.is_public_workshop_file(text) from public;
grant execute on function public.is_public_workshop_file(text) to anon, authenticated;

create policy workshop_files_select_public on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'workshop-files' and public.is_public_workshop_file(name));

create or replace function public.workshop_register_public_photo(p_org uuid, p_path text, p_kind text, p_caption text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_obj record;
        v_id uuid;
begin
  if not public.is_org_responsible(p_org) then raise exception 'Só o responsável muda o perfil da oficina.' using errcode = '42501'; end if;
  if p_kind not in ('logo', 'photo') then raise exception 'Tipo inválido.' using errcode = '22023'; end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> p_org::text then raise exception 'Arquivo de outra oficina.' using errcode = '42501'; end if;
  select o2.metadata ->> 'mimetype' as mime, (o2.metadata ->> 'size')::bigint as size, coalesce(o2.owner_id, o2.owner::text) as owner
    into v_obj from storage.objects o2 where o2.bucket_id = 'workshop-files' and o2.name = p_path;
  if v_obj is null or v_obj.owner is distinct from auth.uid()::text then raise exception 'Arquivo não encontrado.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.attachment_checks c where c.storage_path = p_path and c.ok and c.mime_type = v_obj.mime
                   and c.checked_at > now() - interval '2 hours') then
    raise exception 'O arquivo ainda não foi conferido. Envie de novo.' using errcode = 'P0001';
  end if;
  if p_kind = 'photo' and (select count(*) from public.workshop_public_photos where organization_id = p_org and kind = 'photo' and removed_at is null) >= 12 then
    raise exception 'Limite de 12 fotos no perfil. Remova uma para enviar outra.' using errcode = 'P0001';
  end if;
  if p_kind = 'logo' then
    update public.workshop_public_photos set removed_at = now() where organization_id = p_org and kind = 'logo' and removed_at is null;
  end if;
  insert into public.workshop_public_photos (organization_id, kind, storage_path, mime_type, file_size, caption, position, created_by)
  values (p_org, p_kind, p_path, v_obj.mime, v_obj.size, nullif(btrim(coalesce(p_caption, '')), ''),
          coalesce((select max(position) + 1 from public.workshop_public_photos where organization_id = p_org and removed_at is null), 0), auth.uid())
  returning id into v_id;
  if p_kind = 'logo' then update public.workshops set logo_path = p_path where organization_id = p_org; end if;
  return v_id;
end;
$$;

create or replace function public.workshop_remove_public_photo(p_org uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_kind text;
begin
  if not public.is_org_responsible(p_org) then raise exception 'Só o responsável muda o perfil da oficina.' using errcode = '42501'; end if;
  update public.workshop_public_photos set removed_at = now() where id = p_id and organization_id = p_org and removed_at is null
  returning kind into v_kind;
  if v_kind is null then raise exception 'Foto não encontrada.' using errcode = 'P0002'; end if;
  if v_kind = 'logo' then update public.workshops set logo_path = null where organization_id = p_org; end if;
end;
$$;

create or replace function public.workshop_list_public_photos(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'member');
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'path', p.storage_path, 'caption', p.caption)
                                    order by p.kind, p.position)
                     from public.workshop_public_photos p where p.organization_id = p_org and p.removed_at is null), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Avaliações (PRD 2.1 §18: autenticidade e moderação)
-- -----------------------------------------------------------------------------
create table public.workshop_reviews (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_id        uuid not null unique,
  rating          smallint not null check (rating between 1 and 5),
  comment         text check (comment is null or char_length(comment) between 3 and 1000),
  display_name    text not null check (char_length(display_name) between 2 and 40),
  status          text not null default 'published' check (status in ('published', 'hidden')),
  reply           text check (reply is null or char_length(reply) between 2 and 1000),
  replied_at      timestamptz,
  replied_by      uuid references auth.users (id) on delete set null,
  reported_at     timestamptz,
  report_reason   text check (report_reason is null or char_length(report_reason) between 10 and 500),
  moderated_at    timestamptz,
  moderated_by    uuid references auth.users (id) on delete set null,
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 500),
  created_at      timestamptz not null default now(),
  foreign key (organization_id, order_id) references public.workshop_service_orders (organization_id, id) on delete restrict
);
comment on table public.workshop_reviews is
  'Avaliações de clientes (PRD 2.1 §18). Só pelo link do comprovante de OS concluída: uma por OS. A oficina responde e pode denunciar; '
  'só a moderação da plataforma oculta. Nota e comentário nunca mudam.';
create index workshop_reviews_org_idx on public.workshop_reviews (organization_id, status, created_at desc);
create index workshop_reviews_reported_idx on public.workshop_reviews (reported_at) where reported_at is not null and moderated_at is null;

create or replace function public.wr_protect_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'Avaliações não são apagadas; a moderação pode ocultar.' using errcode = '42501'; end if;
  if new.rating <> old.rating or new.comment is distinct from old.comment or new.display_name <> old.display_name
     or new.order_id <> old.order_id or new.created_at <> old.created_at then
    raise exception 'Nota e comentário da avaliação não mudam.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.wr_protect_review() from public, anon, authenticated;
create trigger workshop_reviews_protect before update or delete on public.workshop_reviews
  for each row execute function public.wr_protect_review();

-- Nome público: primeiro nome + inicial do último ("João S."). Nunca o nome completo do cliente.
create or replace function public.wr_display_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  with w as (select regexp_split_to_array(btrim(regexp_replace(coalesce(p_name, ''), '[^[:alpha:][:space:]''-]', '', 'g')), '\s+') as a)
  select case when coalesce(a[1], '') = '' then 'Cliente'
              when cardinality(a) > 1 then left(initcap(a[1]), 30) || ' ' || upper(left(a[cardinality(a)], 1)) || '.'
              else left(initcap(a[1]), 30) end
    from w;
$$;

create or replace function public.submit_workshop_review(p_token text, p_rating integer, p_comment text, p_name text, p_consent boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare s public.workshop_os_shares;
        o public.workshop_service_orders;
        v_name text;
        v_shop text;
begin
  s := public.wo_share_by_token(p_token);
  if s.id is null or s.purpose <> 'receipt' or s.revoked_at is not null or s.expires_at <= now() then
    raise exception 'Link inválido ou vencido. Peça um novo comprovante à oficina.' using errcode = 'P0002';
  end if;
  select * into o from public.workshop_service_orders where id = s.order_id for update;
  if o.status not in ('completed', 'awaiting_pickup', 'delivered') then
    raise exception 'A avaliação fica disponível depois da conclusão do serviço.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.workshop_reviews where order_id = o.id) then
    raise exception 'Este serviço já foi avaliado.' using errcode = 'P0001';
  end if;
  if coalesce(p_rating, 0) not between 1 and 5 then raise exception 'Escolha de 1 a 5 estrelas.' using errcode = '22023'; end if;
  if not coalesce(p_consent, false) then raise exception 'Confirme que a avaliação pode ser publicada no perfil da oficina.' using errcode = '22023'; end if;
  v_name := public.wr_display_name(coalesce(nullif(btrim(p_name), ''), (select full_name from public.workshop_customers where id = o.customer_id)));
  insert into public.workshop_reviews (organization_id, order_id, rating, comment, display_name)
  values (o.organization_id, o.id, p_rating, nullif(btrim(coalesce(p_comment, '')), ''), v_name);
  select business_name into v_shop from public.workshops where organization_id = o.organization_id;
  perform public.wq_notify_team(o.organization_id, 'workshop_review', 'Nova avaliação: ' || p_rating || ' de 5',
    'OS nº ' || o.number || coalesce(': "' || left(nullif(btrim(coalesce(p_comment, '')), ''), 120) || '"', ''),
    '/oficina/' || o.organization_id || '/avaliacoes', 'review:' || o.id);
  return jsonb_build_object('ok', true, 'display_name', v_name, 'workshop', v_shop);
end;
$$;

create or replace function public.workshop_list_reviews(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'member');
  return jsonb_build_object(
    'summary', (select jsonb_build_object('count', count(*), 'average', round(avg(rating), 1),
                         'by_star', jsonb_build_object('5', count(*) filter (where rating = 5), '4', count(*) filter (where rating = 4),
                                     '3', count(*) filter (where rating = 3), '2', count(*) filter (where rating = 2), '1', count(*) filter (where rating = 1)))
                  from public.workshop_reviews where organization_id = p_org and status = 'published'),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'order_id', r.order_id, 'order_number', o.number, 'rating', r.rating,
                           'comment', r.comment, 'display_name', r.display_name, 'customer_name', c.full_name, 'status', r.status,
                           'reply', r.reply, 'replied_at', r.replied_at, 'reported_at', r.reported_at, 'report_reason', r.report_reason,
                           'moderated_at', r.moderated_at, 'moderation_note', r.moderation_note, 'created_at', r.created_at) order by r.created_at desc)
                          from public.workshop_reviews r
                          join public.workshop_service_orders o on o.id = r.order_id
                          join public.workshop_customers c on c.id = o.customer_id
                         where r.organization_id = p_org), '[]'::jsonb));
end;
$$;

create or replace function public.workshop_reply_review(p_org uuid, p_id uuid, p_reply text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if char_length(btrim(coalesce(p_reply, ''))) < 2 then raise exception 'Escreva a resposta.' using errcode = '22023'; end if;
  update public.workshop_reviews set reply = btrim(p_reply), replied_at = now(), replied_by = auth.uid()
   where id = p_id and organization_id = p_org;
  if not found then raise exception 'Avaliação não encontrada.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.workshop_report_review(p_org uuid, p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_responsible(p_org) then raise exception 'Só o responsável denuncia avaliações.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Explique o motivo (pelo menos 10 caracteres).' using errcode = '22023'; end if;
  update public.workshop_reviews set reported_at = now(), report_reason = btrim(p_reason), moderated_at = null, moderation_note = null
   where id = p_id and organization_id = p_org and status = 'published';
  if not found then raise exception 'Avaliação não encontrada.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.admin_list_reviews(p_only_reported boolean default true)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Operação não permitida.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'workshop', w.business_name, 'workshop_slug', w.public_slug,
                     'rating', r.rating, 'comment', r.comment, 'display_name', r.display_name, 'status', r.status, 'reply', r.reply,
                     'reported_at', r.reported_at, 'report_reason', r.report_reason, 'moderated_at', r.moderated_at,
                     'moderation_note', r.moderation_note, 'created_at', r.created_at) order by r.reported_at desc nulls last, r.created_at desc)
                     from (select * from public.workshop_reviews x
                            where not p_only_reported or (x.reported_at is not null and x.moderated_at is null)
                            order by x.reported_at desc nulls last, x.created_at desc limit 200) r
                     join public.workshops w on w.organization_id = r.organization_id), '[]'::jsonb);
end;
$$;

create or replace function public.admin_moderate_review(p_id uuid, p_action text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_reason text := public.require_admin_reason(p_reason);
        r public.workshop_reviews;
begin
  if p_action not in ('hide', 'keep', 'restore') then raise exception 'Ação inválida.' using errcode = '22023'; end if;
  select * into r from public.workshop_reviews where id = p_id for update;
  if not found then raise exception 'Avaliação não encontrada.' using errcode = 'P0002'; end if;
  update public.workshop_reviews
     set status = case p_action when 'hide' then 'hidden' when 'restore' then 'published' else status end,
         moderated_at = now(), moderated_by = auth.uid(), moderation_note = v_reason
   where id = p_id;
  perform public.write_audit('workshop_reviews', p_id::text, 'admin_moderate_review', null, r.organization_id,
                             jsonb_build_object('status', r.status), jsonb_build_object('action', p_action, 'reason', v_reason));
end;
$$;

-- O comprovante pelo link passa a mostrar se o serviço pode ser avaliado (ou a avaliação feita).
create or replace function public.get_service_order_by_token(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare s public.workshop_os_shares;
        o public.workshop_service_orders;
begin
  s := public.wo_share_by_token(p_token);
  if s.id is null then return jsonb_build_object('state', 'not_found'); end if;
  if s.revoked_at is not null or s.expires_at <= now() then
    return jsonb_build_object('state', 'inactive', 'workshop', (select business_name from public.workshops where organization_id = s.organization_id));
  end if;
  select * into o from public.workshop_service_orders where id = s.order_id;
  update public.workshop_os_shares set first_viewed_at = coalesce(first_viewed_at, now()), view_count = view_count + 1 where id = s.id;
  return jsonb_build_object(
    'state', 'open', 'purpose', s.purpose, 'number', o.number, 'status', o.status, 'opened_at', o.created_at,
    'km_in', o.km_in, 'km_out', o.km_out, 'completed_at', o.completed_at, 'delivered_at', o.delivered_at,
    'delivered_to_name', o.delivered_to_name, 'receipt_code', case when s.purpose = 'receipt' then o.receipt_code end,
    'completion_notes', case when s.purpose = 'receipt' then o.completion_notes end,
    'final_total_cents', case when s.purpose = 'receipt' then o.final_total_cents end,
    'adjustment_cents', case when s.purpose = 'receipt' then o.adjustment_cents end,
    'adjustment_reason', case when s.purpose = 'receipt' then o.adjustment_reason end,
    'customer_name', (select full_name from public.workshop_customers where id = o.customer_id),
    'vehicle', (select jsonb_build_object('brand', v.brand, 'model', v.model, 'version', v.version, 'year', v.year, 'plate', v.plate, 'color', v.color)
                  from public.workshop_vehicles v where v.id = o.vehicle_id),
    'workshop', (select jsonb_build_object('business_name', w.business_name, 'cnpj', w.cnpj, 'phone', w.phone, 'whatsapp', w.whatsapp,
                          'email', w.email, 'address', w.address, 'city', w.city, 'state', w.state, 'logo_url', w.logo_url,
                          'public_slug', case when w.is_public then w.public_slug end)
                   from public.workshops w where w.organization_id = o.organization_id),
    'entry', (select jsonb_build_object('items', x.items, 'fuel_level', x.fuel_level, 'keys_count', x.keys_count, 'km', x.km, 'notes', x.notes,
                       'recorded_at', x.recorded_at, 'customer_ack_at', x.customer_ack_at, 'customer_ack_name', x.customer_ack_name)
                from public.workshop_inspections x where x.order_id = o.id and x.phase = 'entry'),
    'exit', case when s.purpose = 'receipt' then (select jsonb_build_object('items', x.items, 'km', x.km, 'notes', x.notes, 'recorded_at', x.recorded_at)
                from public.workshop_inspections x where x.order_id = o.id and x.phase = 'exit') end,
    'photos_count', (select count(*) from public.workshop_os_photos p where p.order_id = o.id and p.removed_at is null),
    'items', case when s.purpose = 'receipt' then coalesce((select jsonb_agg(jsonb_build_object('position', i.position, 'kind', i.kind,
                       'description', i.description, 'quantity', i.quantity, 'subtotal_cents', i.subtotal_cents - i.discount_cents,
                       'status', i.status, 'part_brand', i.part_brand, 'part_code', i.part_code, 'notes', i.notes,
                       'origin', case i.source when 'manual' then 'Autorizado ' || coalesce(i.auth_method, '') ||
                                  ' por ' || coalesce(i.auth_by_name, '') else 'Orçamento nº ' ||
                                  (select q.number from public.workshop_quotes q where q.id = i.quote_id) end) order by i.position)
                       from public.workshop_service_order_items i where i.order_id = o.id), '[]'::jsonb) end,
    'review', case when s.purpose = 'receipt' and o.status in ('completed', 'awaiting_pickup', 'delivered') then
                coalesce((select jsonb_build_object('done', true, 'rating', r.rating, 'comment', r.comment,
                                   'reply', case when r.status = 'published' then r.reply end)
                            from public.workshop_reviews r where r.order_id = o.id), jsonb_build_object('done', false)) end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Agendamento público (PRD 2.1 §12 e §18)
-- -----------------------------------------------------------------------------
alter table public.workshop_appointments
  add column if not exists vehicle_text text check (vehicle_text is null or char_length(vehicle_text) <= 80),
  add column if not exists consent_at timestamptz;

-- Horários livres de um dia (sem limite de consulta; uso interno).
create or replace function public.wp_free_slots(p_org uuid, p_date date)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare w public.workshops;
        v_day jsonb;
        v_today date := (now() at time zone 'America/Sao_Paulo')::date;
        v_m int;
        v_end int;
        v_start timestamptz;
        out text[] := '{}';
begin
  select * into w from public.workshops where organization_id = p_org;
  if not found or not w.booking_enabled or not w.is_public or w.weekly_hours is null then return out; end if;
  if p_date is null or p_date < v_today or p_date > v_today + w.booking_days_ahead then return out; end if;
  v_day := w.weekly_hours -> extract(dow from p_date)::int::text;
  if v_day is null or v_day = 'null'::jsonb then return out; end if;
  -- Minutos desde a meia-noite: o laço nunca passa do fechamento nem dá a volta no relógio.
  v_m := split_part(v_day ->> 0, ':', 1)::int * 60 + split_part(v_day ->> 0, ':', 2)::int;
  v_end := split_part(v_day ->> 1, ':', 1)::int * 60 + split_part(v_day ->> 1, ':', 2)::int;
  while v_m + w.booking_slot_minutes <= v_end loop
    v_start := (p_date::timestamp + make_interval(mins => v_m)) at time zone 'America/Sao_Paulo';
    if v_start >= now() + make_interval(hours => w.booking_min_hours)
       and (select count(*) from public.workshop_appointments a
             where a.organization_id = p_org and a.status not in ('canceled', 'no_show')
               and a.starts_at < v_start + make_interval(mins => w.booking_slot_minutes)
               and a.starts_at + make_interval(mins => a.duration_minutes) > v_start) < w.booking_capacity then
      out := out || (lpad((v_m / 60)::text, 2, '0') || ':' || lpad((v_m % 60)::text, 2, '0'));
    end if;
    v_m := v_m + w.booking_slot_minutes;
  end loop;
  return out;
end;
$$;

create or replace function public.wp_public_org(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.organization_id from public.workshops w join public.organizations o on o.id = w.organization_id and o.status = 'active'
   where w.public_slug = p_slug and w.is_public;
$$;

create or replace function public.get_public_booking_slots(p_slug text, p_date date)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_org uuid := public.wp_public_org(p_slug);
begin
  if not public.anon_rate_limit_ok('public_workshop', 'public_workshop_views_per_hour') then
    raise exception 'Muitas consultas a partir desta conexão. Tente de novo em alguns minutos.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if v_org is null then return '{}'; end if;
  return public.wp_free_slots(v_org, p_date);
end;
$$;

create or replace function public.request_public_appointment(p_slug text, p_date date, p_time text, p_name text, p_whatsapp text,
                                                             p_vehicle text, p_service text, p_consent boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_org uuid := public.wp_public_org(p_slug);
        w public.workshops;
        v_phone text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
        v_start timestamptz;
        v_id uuid;
begin
  if not public.anon_rate_limit_ok('public_booking', 'public_booking_requests_per_hour') then
    raise exception 'Muitos pedidos a partir desta conexão. Tente de novo mais tarde.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if v_org is null then raise exception 'Oficina não encontrada.' using errcode = 'P0002'; end if;
  select * into w from public.workshops where organization_id = v_org;
  if not w.booking_enabled then raise exception 'Esta oficina não recebe agendamentos pelo site.' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Informe seu nome.' using errcode = '22023'; end if;
  if v_phone !~ '^[0-9]{10,13}$' then raise exception 'Informe um WhatsApp com DDD.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_service, ''))) < 3 then raise exception 'Conte o que a moto precisa.' using errcode = '22023'; end if;
  if not coalesce(p_consent, false) then
    raise exception 'Autorize a oficina a usar seu nome e WhatsApp para confirmar o horário.' using errcode = '22023';
  end if;
  if p_time is null or not (p_time = any (public.wp_free_slots(v_org, p_date))) then
    raise exception 'Este horário não está mais disponível. Escolha outro.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.workshop_appointments where organization_id = v_org and source = 'publico' and contact_phone = v_phone
        and status = 'requested') >= 3 then
    raise exception 'Você já tem pedidos aguardando confirmação nesta oficina. Aguarde o contato.' using errcode = 'P0001';
  end if;
  v_start := (p_date::timestamp + p_time::time) at time zone 'America/Sao_Paulo';
  insert into public.workshop_appointments (organization_id, contact_name, contact_phone, starts_at, duration_minutes, service_description,
                                            status, source, vehicle_text, consent_at)
  values (v_org, left(btrim(p_name), 120), v_phone, v_start, w.booking_slot_minutes, left(btrim(p_service), 300), 'requested', 'publico',
          nullif(left(btrim(coalesce(p_vehicle, '')), 80), ''), now())
  returning id into v_id;
  perform public.wq_notify_team(v_org, 'appointment_requested', 'Pedido de agendamento pelo site',
    left(btrim(p_name), 60) || ' · ' || to_char(v_start at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || ' · ' || left(btrim(p_service), 80),
    '/oficina/' || v_org || '/agenda', 'appt:' || v_id);
  return jsonb_build_object('ok', true, 'starts_at', v_start, 'workshop', w.business_name, 'whatsapp', w.whatsapp);
end;
$$;

insert into public.system_settings (key, value, description)
values ('public_booking_requests_per_hour', '10'::jsonb, 'Pedidos de agendamento público por conexão por hora (PRD 2.1 §18)'),
       ('public_workshop_views_per_hour', '300'::jsonb, 'Consultas ao perfil público e horários de oficinas por conexão por hora')
on conflict (key) do nothing;

-- Perfil público completo (sem CNPJ, razão social, responsável nem dados de funcionários e clientes).
create or replace function public.get_public_workshop(p_slug text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_org uuid := public.wp_public_org(p_slug);
        w public.workshops;
begin
  if not public.anon_rate_limit_ok('public_workshop', 'public_workshop_views_per_hour') then
    raise exception 'Muitas consultas a partir desta conexão. Tente de novo em alguns minutos.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if v_org is null then return null; end if;
  select * into w from public.workshops where organization_id = v_org;
  return jsonb_build_object(
    'business_name', w.business_name, 'public_slug', w.public_slug, 'city', w.city, 'state', w.state, 'address', w.address,
    'phone', w.phone, 'whatsapp', w.whatsapp, 'email', w.email, 'website_url', w.website_url, 'description', w.description,
    'specialties', w.specialties, 'brands_served', w.brands_served, 'opening_hours', w.opening_hours, 'weekly_hours', w.weekly_hours,
    'verification_status', w.verification_status, 'logo_path', w.logo_path,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('path', p.storage_path, 'caption', p.caption) order by p.position)
                          from public.workshop_public_photos p where p.organization_id = v_org and p.kind = 'photo' and p.removed_at is null), '[]'::jsonb),
    'services', case when w.show_services then coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'category', s.category,
                       'estimated_minutes', s.estimated_minutes, 'price_cents', case when w.show_prices and s.charge_type = 'fixed' then s.default_price_cents end)
                       order by s.category, lower(s.name))
                       from public.workshop_service_catalog s where s.organization_id = v_org and s.active), '[]'::jsonb) else '[]'::jsonb end,
    'rating', (select jsonb_build_object('count', count(*), 'average', round(avg(rating), 1)) from public.workshop_reviews
                where organization_id = v_org and status = 'published'),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('rating', r.rating, 'comment', r.comment, 'display_name', r.display_name,
                           'reply', r.reply, 'created_at', r.created_at) order by r.created_at desc)
                          from (select * from public.workshop_reviews where organization_id = v_org and status = 'published'
                                 order by created_at desc limit 20) r), '[]'::jsonb),
    'booking', case when w.booking_enabled then jsonb_build_object('slot_minutes', w.booking_slot_minutes, 'days_ahead', w.booking_days_ahead,
                       'min_hours', w.booking_min_hours) end);
end;
$$;

-- -----------------------------------------------------------------------------
-- Campanhas de relacionamento (PRD 2.1 §25 Fase 5) e opção de não receber
-- -----------------------------------------------------------------------------
alter table public.workshop_customers add column if not exists marketing_opt_out_at timestamptz;
comment on column public.workshop_customers.marketing_opt_out_at is 'Cliente pediu para não receber campanhas. Avisos do próprio serviço continuam.';

alter table public.workshop_contact_log drop constraint if exists workshop_contact_log_reason_check;
alter table public.workshop_contact_log add constraint workshop_contact_log_reason_check
  check (reason in ('quote_followup', 'reminder', 'return', 'pickup', 'campaign', 'other'));

-- Preparação para o WhatsApp oficial (PRD 2.1 §13.2 B): situação da mensagem e id no provedor.
-- Hoje toda mensagem é só "preparada" (abertura do WhatsApp); o envio automático não existe.
alter table public.workshop_contact_log drop constraint if exists workshop_contact_log_channel_check;
alter table public.workshop_contact_log add constraint workshop_contact_log_channel_check
  check (channel in ('whatsapp', 'telefone', 'outro', 'whatsapp_api'));
alter table public.workshop_contact_log
  add column if not exists delivery_status text not null default 'prepared'
    check (delivery_status in ('prepared', 'queued', 'sent', 'delivered', 'read', 'failed')),
  add column if not exists provider text check (provider is null or char_length(provider) <= 40),
  add column if not exists provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200);
comment on column public.workshop_contact_log.delivery_status is
  'prepared = a equipe abriu o WhatsApp com o texto (não prova envio). queued/sent/delivered/read/failed ficam para a integração oficial.';

create table public.workshop_campaigns (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name            text not null check (char_length(name) between 2 and 80),
  audience        text not null check (audience in ('inactive', 'reminders', 'brand', 'all')),
  audience_days   integer check (audience_days is null or audience_days between 30 and 1095),
  audience_brand  text check (audience_brand is null or char_length(audience_brand) between 2 and 40),
  message         text not null check (char_length(message) between 10 and 1000),
  status          text not null default 'active' check (status in ('active', 'closed')),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz,
  unique (organization_id, id)
);
comment on table public.workshop_campaigns is
  'Campanhas de relacionamento (PRD 2.1 Fase 5): público calculado na hora, sem quem pediu para não receber; '
  'a equipe abre o WhatsApp de cada pessoa. Não há envio em massa.';

do $$
declare t text;
begin
  foreach t in array array['workshop_public_photos', 'workshop_reviews', 'workshop_campaigns'] loop
    execute format('create trigger %1$s_protect_org before update on public.%1$s for each row execute function public.wq_protect_org()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.audit_row_change(%2$L, %3$L)',
                   t, '', 'organization_id');
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %1$s_select_member on public.%1$s for select to authenticated using (public.has_org_permission(organization_id, %2$L))', t, 'member');
  end loop;
end $$;
create trigger workshop_campaigns_updated_at before update on public.workshop_campaigns for each row execute function public.set_updated_at();

create or replace function public.workshop_save_campaign(p_org uuid, p_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
        v_aud text := coalesce(public.wq_txt(p_data, 'audience'), 'inactive');
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if v_aud = 'brand' and public.wq_txt(p_data, 'audience_brand') is null then raise exception 'Informe a marca.' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.workshop_campaigns (organization_id, name, audience, audience_days, audience_brand, message, created_by)
    values (p_org, public.wq_txt(p_data, 'name'), v_aud,
            case when v_aud = 'inactive' then coalesce(nullif(p_data ->> 'audience_days', '')::int, 180) end,
            case when v_aud = 'brand' then public.wq_txt(p_data, 'audience_brand') end, public.wq_txt(p_data, 'message'), auth.uid())
    returning id into v_id;
  else
    update public.workshop_campaigns
       set name = public.wq_txt(p_data, 'name'), audience = v_aud,
           audience_days = case when v_aud = 'inactive' then coalesce(nullif(p_data ->> 'audience_days', '')::int, 180) end,
           audience_brand = case when v_aud = 'brand' then public.wq_txt(p_data, 'audience_brand') end,
           message = public.wq_txt(p_data, 'message')
     where id = p_id and organization_id = p_org and status = 'active'
    returning id into v_id;
    if v_id is null then raise exception 'Campanha não encontrada ou encerrada.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.workshop_close_campaign(p_org uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  update public.workshop_campaigns set status = 'closed', closed_at = now() where id = p_id and organization_id = p_org and status = 'active';
  if not found then raise exception 'Campanha não encontrada ou já encerrada.' using errcode = 'P0002'; end if;
end;
$$;

-- Público da campanha: clientes ativos, com WhatsApp e sem pedido de não receber.
create or replace function public.wp_campaign_audience(p_org uuid, c public.workshop_campaigns)
returns table (customer_id uuid, customer_name text, whatsapp text, vehicle_label text, last_visit timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select cu.id, cu.full_name, coalesce(cu.whatsapp, cu.phone),
         (select string_agg(concat_ws(' ', v.brand, v.model), ', ') from public.workshop_vehicles v where v.customer_id = cu.id and v.status = 'active'),
         greatest(cu.first_visit_at::timestamptz,
                  (select max(created_at) from public.workshop_quotes q where q.customer_id = cu.id),
                  (select max(created_at) from public.workshop_service_orders o where o.customer_id = cu.id))
    from public.workshop_customers cu
   where cu.organization_id = p_org and cu.status = 'active' and cu.marketing_opt_out_at is null
     and coalesce(cu.whatsapp, cu.phone) is not null
     and case c.audience
           when 'all' then true
           when 'brand' then exists (select 1 from public.workshop_vehicles v where v.customer_id = cu.id and v.status = 'active'
                                       and lower(v.brand) = lower(c.audience_brand))
           when 'reminders' then exists (select 1 from public.workshop_reminders r where r.customer_id = cu.id and r.status = 'open')
           else greatest(cu.first_visit_at::timestamptz,
                         (select max(created_at) from public.workshop_quotes q where q.customer_id = cu.id),
                         (select max(created_at) from public.workshop_service_orders o where o.customer_id = cu.id))
                < now() - make_interval(days => coalesce(c.audience_days, 180))
         end
   limit 500;
$$;

create or replace function public.workshop_list_campaigns(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'member');
  return coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
                     'audience_count', (select count(*) from public.wp_campaign_audience(p_org, c)),
                     'contacted_count', (select count(distinct l.customer_id) from public.workshop_contact_log l
                                          where l.organization_id = p_org and l.reason = 'campaign' and l.reference_id = c.id))
                     order by c.status, c.created_at desc)
                     from public.workshop_campaigns c where c.organization_id = p_org), '[]'::jsonb);
end;
$$;

create or replace function public.workshop_campaign_recipients(p_org uuid, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare c public.workshop_campaigns;
begin
  perform public.wq_assert(p_org, 'member');
  select * into c from public.workshop_campaigns where id = p_id and organization_id = p_org;
  if not found then raise exception 'Campanha não encontrada.' using errcode = 'P0002'; end if;
  return jsonb_build_object('campaign', to_jsonb(c),
    'opted_out', (select count(*) from public.workshop_customers where organization_id = p_org and status = 'active' and marketing_opt_out_at is not null),
    'recipients', coalesce((select jsonb_agg(jsonb_build_object('customer_id', a.customer_id, 'customer_name', a.customer_name, 'whatsapp', a.whatsapp,
                      'vehicle_label', a.vehicle_label, 'last_visit', a.last_visit,
                      'contacted_at', (select max(l.created_at) from public.workshop_contact_log l where l.organization_id = p_org
                                         and l.reason = 'campaign' and l.reference_id = c.id and l.customer_id = a.customer_id))
                      order by a.customer_name)
                      from public.wp_campaign_audience(p_org, c) a), '[]'::jsonb));
end;
$$;

create or replace function public.workshop_set_marketing_opt_out(p_org uuid, p_customer uuid, p_opt_out boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  update public.workshop_customers
     set marketing_opt_out_at = case when p_opt_out then coalesce(marketing_opt_out_at, now()) end
   where id = p_customer and organization_id = p_org;
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
end;
$$;

-- Contato de campanha só para quem não pediu para sair, e só em campanha ativa.
create or replace function public.workshop_log_contact(p_org uuid, p_customer uuid, p_reason text, p_reference uuid default null,
                                                       p_channel text default 'whatsapp', p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wq_assert(p_org, 'manage_quotes');
  if not exists (select 1 from public.workshop_customers where id = p_customer and organization_id = p_org) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if p_reason = 'campaign' then
    if not exists (select 1 from public.workshop_campaigns where id = p_reference and organization_id = p_org and status = 'active') then
      raise exception 'Campanha não encontrada ou encerrada.' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.workshop_customers where id = p_customer and marketing_opt_out_at is not null) then
      raise exception 'Este cliente pediu para não receber campanhas.' using errcode = 'P0001';
    end if;
  end if;
  insert into public.workshop_contact_log (organization_id, customer_id, reason, reference_id, channel, note, created_by)
  values (p_org, p_customer, p_reason, p_reference, coalesce(p_channel, 'whatsapp'), nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  if p_reason = 'reminder' and p_reference is not null then
    update public.workshop_reminders set last_contact_at = now() where id = p_reference and organization_id = p_org;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Avisos novos
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'workshop_access_request', 'workshop_access_decided', 'workshop_access_revoked', 'workshop_service',
  'transfer_received', 'transfer_decided', 'reminder_due', 'subscription_ending', 'payment_approved',
  'payment_failed', 'storage_limit', 'claim_decided', 'ownership_notice', 'admin_notice',
  'care_checkup', 'oil_change', 'quote_viewed', 'quote_decided', 'quote_expired', 'service_order_assigned',
  'appointment_requested', 'workshop_review'));

create or replace function public.notification_kind_optional(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_kind in ('reminder_due', 'storage_limit', 'subscription_ending', 'workshop_service', 'care_checkup', 'oil_change',
                        'quote_viewed', 'quote_expired', 'workshop_review') $$;

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
                      'appointment_requested', 'workshop_review']) k(kind)
    left join public.notification_preferences p on p.user_id = auth.uid() and p.kind = k.kind;
$$;

-- -----------------------------------------------------------------------------
-- Permissões de execução
-- -----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'workshop_register_public_photo(uuid, text, text, text)', 'workshop_remove_public_photo(uuid, uuid)', 'workshop_list_public_photos(uuid)',
    'workshop_list_reviews(uuid)', 'workshop_reply_review(uuid, uuid, text)', 'workshop_report_review(uuid, uuid, text)',
    'admin_list_reviews(boolean)', 'admin_moderate_review(uuid, text, text)',
    'workshop_save_campaign(uuid, uuid, jsonb)', 'workshop_close_campaign(uuid, uuid)', 'workshop_list_campaigns(uuid)',
    'workshop_campaign_recipients(uuid, uuid)', 'workshop_set_marketing_opt_out(uuid, uuid, boolean)',
    'workshop_log_contact(uuid, uuid, text, uuid, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['get_public_workshop(text)', 'get_public_booking_slots(text, date)',
                           'request_public_appointment(text, date, text, text, text, text, text, boolean)',
                           'submit_workshop_review(text, integer, text, text, boolean)', 'get_service_order_by_token(text)'] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  foreach f in array array['wr_display_name(text)', 'wp_free_slots(uuid, date)', 'wp_public_org(text)',
                           'wp_campaign_audience(uuid, public.workshop_campaigns)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
