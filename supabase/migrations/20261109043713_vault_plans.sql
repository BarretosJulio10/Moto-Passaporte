-- =============================================================================
-- PRD 2.4 — Planos: modelo cofre (ADR-056)
-- Plano gratuito: a lista da linha do tempo continua completa, mas só os N registros mais recentes
-- de cada moto (free_open_records, padrão 2) mostram detalhes (km, valor, peças, observações) e
-- comprovantes. Os demais ficam "no cofre": guardados, nunca apagados, sempre exportáveis.
-- Premium (qualquer plano pago, período pago ou bônus ativo) vê tudo.
-- Interruptor: vault_enabled (0 = desligado, padrão; 1 = ligado). Com 0 nada muda.
-- O bloqueio é feito no banco: RLS de maintenance_records/attachments, Storage, RPC da linha do
-- tempo, lançamentos de gastos e passaporte compartilhado.
-- "Exportar meus dados" (export_my_data) e a nova exportação de comprovantes nunca consultam o plano
-- (LGPD art. 18 §5 e art. 19).
-- Rollback: supabase/rollback/20261109043713_vault_plans.down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configurações
-- -----------------------------------------------------------------------------
insert into public.system_settings (key, value, description, is_public)
values ('vault_enabled', '0'::jsonb, 'Cofre do plano gratuito: 1 = ligado (detalhes só dos registros mais recentes), 0 = desligado.', true),
       ('free_open_records', '2'::jsonb, 'Registros mais recentes de cada moto com detalhes e comprovantes no plano gratuito (cofre).', true)
on conflict (key) do nothing;

do $do$
declare d text;
begin
  d := pg_get_functiondef('public.setting_spec(text)'::regprocedure);
  if position('when ''storage_alert_percent''' in d) = 0 then
    raise exception 'setting_spec: trecho esperado não encontrado';
  end if;
  d := replace(d, 'when ''storage_alert_percent''',
    'when ''vault_enabled''                    then ''{"kind":"int","min":0,"max":1,"group":"Cobrança","label":"Cofre do plano gratuito (1 = ligado, 0 = desligado)"}''
    when ''free_open_records''                then ''{"kind":"int","min":1,"max":20,"group":"Cobrança","label":"Registros com detalhes por moto no plano gratuito"}''
    when ''storage_alert_percent''');
  execute d;
end
$do$;

-- -----------------------------------------------------------------------------
-- Regras do cofre
-- -----------------------------------------------------------------------------
create or replace function public.user_has_full_history(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and coalesce((public.user_plan(p_user)).kind = 'premium', false);
$$;
revoke execute on function public.user_has_full_history(uuid) from public, anon, authenticated;

create or replace function public.vault_applies_to(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.setting_int('vault_enabled', 0) <> 0 and p_user is not null
         and not public.user_has_full_history(p_user);
$$;
revoke execute on function public.vault_applies_to(uuid) from public, anon, authenticated;

-- Registros abertos de uma moto: os N vigentes mais recentes (não anulados, não substituídos) e,
-- para cada um, os registros que ele corrigiu (a cadeia de correções aparece junto).
create or replace function public.vault_open_records(p_motorcycle uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive top as (
    select r.id
      from public.maintenance_records r
     where r.motorcycle_id = p_motorcycle and not r.is_void
       and not exists (select 1 from public.maintenance_records c where c.corrects_record_id = r.id)
     order by r.service_date desc, r.created_at desc
     limit greatest(1, least(20, public.setting_int('free_open_records', 2)))
  ), chain(id) as (
    select id from top
    union
    select r.corrects_record_id
      from public.maintenance_records r
      join chain on r.id = chain.id
     where r.corrects_record_id is not null
  )
  select id from chain;
$$;
revoke execute on function public.vault_open_records(uuid) from public, anon, authenticated;

-- Usada nas políticas (RLS): true = o registro está no cofre para quem consulta.
create or replace function public.maintenance_record_locked(p_record uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.vault_applies_to(auth.uid()) then false
    else not exists (
      select 1 from public.maintenance_records r
       where r.id = p_record and r.id in (select public.vault_open_records(r.motorcycle_id)))
  end;
$$;
revoke execute on function public.maintenance_record_locked(uuid) from public, anon;
grant execute on function public.maintenance_record_locked(uuid) to authenticated;

-- Estado do cofre para a tela.
create or replace function public.get_my_vault()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', public.setting_int('vault_enabled', 0) <> 0,
    'applies', public.vault_applies_to(auth.uid()),
    'open_records', greatest(1, least(20, public.setting_int('free_open_records', 2))));
$$;
revoke execute on function public.get_my_vault() from public, anon;
grant execute on function public.get_my_vault() to authenticated;

-- Texto usado nos avisos.
create or replace function public.vault_notice_text()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.setting_int('vault_enabled', 0) <> 0
    then ' No plano gratuito, só os ' || greatest(1, least(20, public.setting_int('free_open_records', 2)))
         || ' registros mais recentes de cada moto ficam com detalhes e comprovantes; os demais ficam guardados no cofre e podem ser exportados a qualquer momento.'
    else '' end;
$$;
revoke execute on function public.vault_notice_text() from public, anon, authenticated;

create or replace function public.vault_service_suffix(p_motorcycle uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.vault_applies_to(public.moto_owner(p_motorcycle))
     and (select count(*) from public.maintenance_records r
           where r.motorcycle_id = p_motorcycle and not r.is_void
             and not exists (select 1 from public.maintenance_records c where c.corrects_record_id = r.id))
         > greatest(1, least(20, public.setting_int('free_open_records', 2)))
    then ' Um registro mais antigo foi para o cofre: assine o Premium para ver todos os detalhes.'
    else '' end;
$$;
revoke execute on function public.vault_service_suffix(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS: registros do cofre não saem pela leitura direta das tabelas
-- -----------------------------------------------------------------------------
drop policy if exists maintenance_records_select on public.maintenance_records;
create policy maintenance_records_select on public.maintenance_records
  for select to authenticated
  using (public.is_current_owner(motorcycle_id) and not public.maintenance_record_locked(id));
-- maintenance_items: a política consulta maintenance_records (com RLS), então itens do cofre somem junto.

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using ((public.can_view_attachment(motorcycle_id, diary_entry_id)
          and (maintenance_record_id is null or not public.maintenance_record_locked(maintenance_record_id)))
         or (organization_id is not null and public.workshop_has_access(motorcycle_id, organization_id)));

create or replace function public.can_access_attachment_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a record;
begin
  if auth.uid() is null then
    return false;
  end if;
  select motorcycle_id, diary_entry_id, organization_id, maintenance_record_id into a
    from public.attachments where storage_path = p_name;
  if found then
    return (public.can_view_attachment(a.motorcycle_id, a.diary_entry_id)
            and (a.maintenance_record_id is null or not public.maintenance_record_locked(a.maintenance_record_id)))
        or (a.organization_id is not null and public.workshop_has_access(a.motorcycle_id, a.organization_id));
  end if;
  return exists (
    select 1 from storage.objects o
    where o.bucket_id = 'attachments' and o.name = p_name
      and coalesce(o.owner_id, o.owner::text) = auth.uid()::text);
end;
$$;

-- -----------------------------------------------------------------------------
-- Linha do tempo do dono (substitui a leitura direta da view pelo app)
-- -----------------------------------------------------------------------------
create or replace function public.get_maintenance_timeline(p_motorcycle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_lock boolean;
  v_open uuid[];
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_motorcycle_id is null or not public.is_current_owner(p_motorcycle_id) then
    raise exception 'Moto não encontrada na sua conta.' using errcode = '42501';
  end if;
  v_lock := public.vault_applies_to(v_uid);
  if v_lock then
    v_open := array(select public.vault_open_records(p_motorcycle_id));
  end if;
  return coalesce((
    select jsonb_agg(
             case when v_lock and not (t.id = any (v_open))
               then to_jsonb(t) || jsonb_build_object(
                      'description', null, 'mileage', null, 'service_value_cents', null, 'notes', null,
                      'correction_reason', null, 'items', '[]'::jsonb, 'attachments', '[]'::jsonb, 'locked', true)
               else to_jsonb(t) || jsonb_build_object('locked', false) end
             order by t.service_date desc, t.created_at desc)
      from public.maintenance_timeline t
     where t.motorcycle_id = p_motorcycle_id), '[]'::jsonb);
end;
$$;
revoke execute on function public.get_maintenance_timeline(uuid) from public, anon;
grant execute on function public.get_maintenance_timeline(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Gastos: lançamentos de serviço no cofre saem sem valor e sem km
-- -----------------------------------------------------------------------------
create or replace function public.get_spending_entries(
  p_motorcycle uuid, p_from date default null, p_to date default null, p_scope text default 'ownership',
  p_category text default null, p_workshop text default null, p_source text default null,
  p_kind text default null, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
        v_top date := greatest((now() at time zone 'America/Sao_Paulo')::date, current_date);
        v_lock boolean;
begin
  if v_uid is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_scope not in ('ownership', 'all') then raise exception 'Escopo inválido.' using errcode = '22023'; end if;
  if p_motorcycle is not null and not public.is_current_owner(p_motorcycle) then
    raise exception 'Moto não encontrada na sua conta.' using errcode = '42501';
  end if;
  v_lock := public.vault_applies_to(v_uid);
  return (select coalesce(jsonb_agg(jsonb_build_object(
             'kind', e.kind, 'id', e.id, 'motorcycle_id', e.motorcycle_id, 'category', e.category, 'title', e.title,
             'date', e.entry_date, 'workshop_name', e.workshop_name,
             'mileage', case when e.locked then null else e.mileage end,
             'value_cents', case when e.locked then null else e.value_cents end,
             'has_receipt', case when e.locked then false else e.has_receipt end,
             'locked', e.locked,
             'receipt_path', case when e.kind = 'expense' then (select x.receipt_path from public.owner_expenses x where x.id = e.id) end,
             'receipt_name', case when e.kind = 'expense' then (select x.receipt_name from public.owner_expenses x where x.id = e.id) end)
           order by e.entry_date desc, e.kind, e.id), '[]'::jsonb)
    from (select e.*,
                 (v_lock and e.kind = 'service'
                  and e.id not in (select public.vault_open_records(e.motorcycle_id))) as locked
            from public.sp_entries(v_uid, p_motorcycle, p_scope) e
           where (p_kind is null or e.kind = p_kind)
             and (p_category is null or e.category = p_category)
             and (p_workshop is null or (e.kind = 'service' and ((p_workshop = '' and e.workshop_name is null) or e.workshop_name = p_workshop)))
             and (p_source is null or (e.kind = 'service' and e.source_type = p_source))
             and (p_from is null or e.entry_date >= p_from)
             and e.entry_date <= least(coalesce(p_to, v_top), v_top)
           order by e.entry_date desc
           limit greatest(1, least(coalesce(p_limit, 200), 5000))) e);
end;
$$;

-- -----------------------------------------------------------------------------
-- Passaporte compartilhado: dono sem Premium → só resumo (links antigos seguem completos)
-- -----------------------------------------------------------------------------
alter table public.passport_shares add column if not exists full_history boolean not null default true;
alter table public.passport_shares alter column full_history set default false;
comment on column public.passport_shares.full_history is
  'true = link criado antes do cofre (PRD 2.4): mostra o histórico completo até vencer, mesmo com o dono no gratuito.';

create or replace function public.share_in_vault_mode(s public.passport_shares)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.setting_int('vault_enabled', 0) <> 0 and not s.full_history
         and not public.user_has_full_history(s.created_by);
$$;
revoke execute on function public.share_in_vault_mode(public.passport_shares) from public, anon, authenticated;

create or replace function public.get_shared_passport(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.passport_shares;
  m public.motorcycles;
  v_result jsonb;
  v_vault boolean;
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
  v_vault := public.share_in_vault_mode(s);

  v_result := jsonb_build_object(
    'brand', m.brand, 'model', m.model, 'version', m.version,
    'manufacturing_year', m.manufacturing_year, 'model_year', m.model_year,
    'displacement_cc', m.displacement_cc, 'color', m.color,
    'passport_created_at', m.created_at,
    'shared_at', s.created_at, 'expires_at', s.expires_at,
    'vault', v_vault and s.show_history,
    'options', jsonb_build_object(
      'plate', s.show_plate, 'mileage', s.show_mileage, 'history', s.show_history,
      'values', s.show_values and not v_vault, 'attachments', s.show_attachments and not v_vault, 'diary', s.show_diary),
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

  if s.show_history and v_vault then
    v_result := v_result || jsonb_build_object('history_summary', (
      select jsonb_build_object(
               'services', count(*),
               'workshops', count(distinct coalesce(t.organization_id::text, lower(t.workshop_name))) filter (where t.source_type = 'workshop' or t.workshop_name is not null),
               'workshop_records', count(*) filter (where t.source_type = 'workshop'),
               'first_service_date', min(t.service_date),
               'last_service_date', max(t.service_date),
               'last_mileage', (select t2.mileage from public.maintenance_records t2
                                 where t2.motorcycle_id = m.id and not t2.is_void and t2.mileage is not null
                                   and not exists (select 1 from public.maintenance_records c where c.corrects_record_id = t2.id)
                                 order by t2.service_date desc, t2.created_at desc limit 1))
        from public.maintenance_records t
       where t.motorcycle_id = m.id and not t.is_void
         and not exists (select 1 from public.maintenance_records c where c.corrects_record_id = t.id)));
  elsif s.show_history then
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
$$;

-- Comprovante pelo link: bloqueado quando o link está em modo resumo.
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.shared_attachment_for_download(text, uuid)'::regprocedure);
  if position('  select * into a from public.attachments where id = p_attachment_id' in d) = 0 then
    raise exception 'shared_attachment_for_download: trecho esperado não encontrado';
  end if;
  d := replace(d, '  select * into a from public.attachments where id = p_attachment_id',
    '  if public.share_in_vault_mode(s) then
    return null;
  end if;
  select * into a from public.attachments where id = p_attachment_id');
  execute d;
end
$do$;

-- -----------------------------------------------------------------------------
-- Exportação dos comprovantes (sempre grátis; o envio dos links é feito pela função export-files)
-- -----------------------------------------------------------------------------
create table if not exists public.attachment_exports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  file_count int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists attachment_exports_user_idx on public.attachment_exports (user_id, created_at desc);
alter table public.attachment_exports enable row level security;
revoke all on public.attachment_exports from anon, authenticated;

create or replace function public.export_my_attachments()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_files jsonb;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if (select count(*) from public.attachment_exports
       where user_id = v_uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Você já gerou 5 pacotes de comprovantes nas últimas 24 horas. Tente de novo amanhã.' using errcode = 'P0001';
  end if;
  v_files := coalesce((
    select jsonb_agg(f order by f ->> 'date' desc nulls last, f ->> 'file_name')
      from (
        select jsonb_build_object(
                 'bucket', 'attachments', 'path', a.storage_path, 'file_name', a.file_name,
                 'motorcycle', m.brand || ' ' || m.model,
                 'date', coalesce(r.service_date, d.entry_date, a.created_at::date),
                 'title', coalesce(r.title, d.title, 'Arquivo')) f
          from public.attachments a
          join public.motorcycle_ownerships o on o.motorcycle_id = a.motorcycle_id
                                             and o.owner_user_id = v_uid and o.ended_at is null
          join public.motorcycles m on m.id = a.motorcycle_id
          left join public.maintenance_records r on r.id = a.maintenance_record_id
          left join public.motorcycle_diary d on d.id = a.diary_entry_id
         where a.diary_entry_id is null or d.author_id = v_uid
        union all
        select jsonb_build_object(
                 'bucket', 'expense-receipts', 'path', e.receipt_path,
                 'file_name', coalesce(e.receipt_name, 'comprovante'),
                 'motorcycle', m.brand || ' ' || m.model, 'date', e.expense_date,
                 'title', coalesce(e.description, 'Despesa'))
          from public.owner_expenses e
          join public.motorcycles m on m.id = e.motorcycle_id
         where e.user_id = v_uid and e.deleted_at is null and e.receipt_path is not null
      ) x), '[]'::jsonb);
  insert into public.attachment_exports (user_id, file_count) values (v_uid, jsonb_array_length(v_files));
  return v_files;
end;
$$;
revoke execute on function public.export_my_attachments() from public, anon;
grant execute on function public.export_my_attachments() to authenticated;

-- -----------------------------------------------------------------------------
-- Termos: novo aceite pelo usuário já cadastrado
-- -----------------------------------------------------------------------------
create or replace function public.accept_current_terms(p_terms_version text, p_privacy_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if coalesce(p_terms_version, '') !~ '^[0-9A-Za-z.\-]{1,20}$' or coalesce(p_privacy_version, '') !~ '^[0-9A-Za-z.\-]{1,20}$' then
    raise exception 'Versão inválida.' using errcode = '22023';
  end if;
  update public.profiles
     set terms_accepted_at = now(), terms_version = p_terms_version,
         privacy_accepted_at = now(), privacy_version = p_privacy_version
   where id = auth.uid();
end;
$$;
revoke execute on function public.accept_current_terms(text, text) from public, anon;
grant execute on function public.accept_current_terms(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Avisos: fim do bônus e serviço registrado por oficina mencionam o cofre
-- -----------------------------------------------------------------------------
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.system_generate_notifications()'::regprocedure);
  if position('''Sua conta voltou ao plano gratuito. Motos e histórico continuam com você. Assine para voltar ao Premium.''' in d) = 0
     or position('''. Assine agora para continuar: a primeira cobrança só acontece quando o bônus acabar.''' in d) = 0 then
    raise exception 'system_generate_notifications: trecho esperado não encontrado';
  end if;
  d := replace(d, '''Sua conta voltou ao plano gratuito. Motos e histórico continuam com você. Assine para voltar ao Premium.''',
                  '''Sua conta voltou ao plano gratuito. Nada foi apagado.'' || public.vault_notice_text() || '' Assine para voltar ao Premium.''');
  d := replace(d, '''. Assine agora para continuar: a primeira cobrança só acontece quando o bônus acabar.''',
                  '''.'' || public.vault_notice_text() || '' Assine agora para continuar: a primeira cobrança só acontece quando o bônus acabar.''');
  execute d;

  d := pg_get_functiondef('public.trg_notify_workshop_service()'::regprocedure);
  if position('public.moto_label(new.motorcycle_id) || ''.'',' in d) = 0 then
    raise exception 'trg_notify_workshop_service: trecho esperado não encontrado';
  end if;
  d := replace(d, 'public.moto_label(new.motorcycle_id) || ''.'',',
                  'public.moto_label(new.motorcycle_id) || ''.'' || public.vault_service_suffix(new.motorcycle_id),');
  execute d;
end
$do$;

-- -----------------------------------------------------------------------------
-- Textos dos planos (card de preços)
-- -----------------------------------------------------------------------------
update public.subscription_plans
   set description = 'Para guardar o histórico da sua moto.',
       features = array['Histórico completo guardado, sem limite de registros',
                        'Detalhes e comprovantes dos 2 registros mais recentes de cada moto',
                        'Registros de oficinas autorizadas',
                        'Exportar todos os seus dados quando quiser']
 where kind = 'free';

update public.subscription_plans
   set description = 'Seu histórico completo aberto, para cuidar e para vender.',
       features = array['Histórico completo aberto, com todos os comprovantes',
                        'Link completo para o comprador e PDF para vender',
                        'Lembretes de manutenção',
                        'Análise de gastos e custo por km',
                        'Mais motos e mais espaço para anexos']
 where kind = 'premium';
