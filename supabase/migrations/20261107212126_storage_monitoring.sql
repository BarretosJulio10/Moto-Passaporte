-- =============================================================================
-- Fase 6.3 — Monitoramento de armazenamento (PRD 7.6, ADR-026)
-- Consumo total, por categoria, por usuário, por moto e por oficina; arquivos
-- temporários (envio em andamento) e sem vínculo; alertas de limite; limpeza só
-- de arquivos sem vínculo mais antigos que a retenção, com motivo e auditoria.
-- O Supabase não permite apagar objetos pelo SQL: o banco planeja e registra,
-- a Edge Function "storage-cleanup" apaga pela API de Storage.
-- Reversão: drop das funções admin_storage_*, storage_cleanup_*, user_storage_used_bytes,
--           da tabela storage_cleanups e das duas configurações novas.
-- =============================================================================

insert into public.system_settings (key, value, description, is_public) values
  ('storage_orphan_retention_hours', '24', 'Horas até um arquivo enviado sem registro ser considerado sem vínculo e poder ser limpo', false),
  ('storage_alert_percent', '80', 'Percentual de uso do espaço a partir do qual a conta aparece em alerta', false)
on conflict (key) do nothing;

create or replace function public.setting_spec(p_key text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_key
    when 'support_email'                    then '{"kind":"email","group":"Contato","label":"E-mail de suporte"}'
    when 'support_whatsapp'                 then '{"kind":"phone","group":"Contato","label":"WhatsApp de suporte (com DDI e DDD)"}'
    when 'registration_rate_limit_per_hour' then '{"kind":"int","min":1,"max":100,"group":"Limites","label":"Cadastros de moto por usuário, por hora"}'
    when 'attachment_max_file_mb'           then '{"kind":"int","min":1,"max":50,"group":"Limites","label":"Tamanho máximo de cada arquivo (MB)"}'
    when 'workshop_storage_quota_mb'        then '{"kind":"int","min":10,"max":100000,"group":"Limites","label":"Espaço de cada oficina (MB)"}'
    when 'workshop_plate_search_per_hour'   then '{"kind":"int","min":1,"max":500,"group":"Limites","label":"Pesquisas de placa por usuário de oficina, por hora"}'
    when 'workshop_org_search_per_hour'     then '{"kind":"int","min":1,"max":500,"group":"Limites","label":"Pesquisas por oficina, por hora"}'
    when 'workshop_access_requests_per_day' then '{"kind":"int","min":1,"max":500,"group":"Limites","label":"Pedidos de acesso por oficina, por dia"}'
    when 'workshop_access_retry_days'       then '{"kind":"int","min":0,"max":90,"group":"Regras","label":"Dias para a oficina pedir acesso de novo após recusa"}'
    when 'origin_workshop_window_days'      then '{"kind":"int","min":1,"max":365,"group":"Regras","label":"Dias para reconhecer a Oficina de Origem"}'
    when 'transfer_request_days'            then '{"kind":"int","min":1,"max":60,"group":"Regras","label":"Dias para o comprador aceitar a transferência"}'
    when 'transfer_requests_per_day'        then '{"kind":"int","min":1,"max":50,"group":"Limites","label":"Pedidos de transferência por usuário, por dia"}'
    when 'billing_grace_days'               then '{"kind":"int","min":0,"max":30,"group":"Cobrança","label":"Tolerância após falha de cobrança (dias)"}'
    when 'storage_orphan_retention_hours'   then '{"kind":"int","min":1,"max":720,"group":"Armazenamento","label":"Horas até um envio sem registro poder ser limpo"}'
    when 'storage_alert_percent'            then '{"kind":"int","min":50,"max":100,"group":"Armazenamento","label":"Alerta de espaço a partir de (% usado)"}'
  end::jsonb;
$$;

-- Uso de um titular, mesma regra de get_storage_usage (uso interno; sem grant).
create or replace function public.user_storage_used_bytes(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(a.file_size), 0)::bigint
    from public.attachments a
    join public.motorcycle_ownerships o
      on o.motorcycle_id = a.motorcycle_id and o.ended_at is null and o.owner_user_id = p_user
   where a.organization_id is null
     and (a.diary_entry_id is null
          or exists (select 1 from public.motorcycle_diary d where d.id = a.diary_entry_id and d.author_id = p_user));
$$;
revoke execute on function public.user_storage_used_bytes(uuid) from public, anon, authenticated;

-- Objetos do bucket sem registro em attachments (uso interno).
create or replace view public.storage_unlinked_objects
with (security_invoker = true) as
  select o.name, coalesce((o.metadata ->> 'size')::bigint, 0) as size_bytes, o.created_at,
         o.created_at < now() - make_interval(hours => public.setting_int('storage_orphan_retention_hours', 24)) as is_orphan
    from storage.objects o
   where o.bucket_id = 'attachments'
     and not exists (select 1 from public.attachments a where a.storage_path = o.name);
revoke all on public.storage_unlinked_objects from public, anon, authenticated;

create or replace function public.admin_storage_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_alert int := public.setting_int('storage_alert_percent', 80);
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'bucket_files', (select count(*) from storage.objects where bucket_id = 'attachments'),
    'bucket_bytes', (select coalesce(sum((metadata ->> 'size')::bigint), 0) from storage.objects where bucket_id = 'attachments'),
    'linked_files', (select count(*) from public.attachments),
    'linked_bytes', (select coalesce(sum(file_size), 0) from public.attachments),
    'by_kind', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'files', n, 'bytes', b) order by b desc)
                           from (select kind::text, count(*) n, sum(file_size) b from public.attachments group by kind) k), '[]'::jsonb),
    'by_context', coalesce((select jsonb_agg(jsonb_build_object('context', ctx, 'files', n, 'bytes', b) order by b desc)
                              from (select case when organization_id is not null then 'workshop'
                                                when diary_entry_id is not null then 'diary'
                                                when maintenance_record_id is not null then 'maintenance'
                                                else 'motorcycle' end ctx,
                                           count(*) n, sum(file_size) b
                                      from public.attachments group by 1) c), '[]'::jsonb),
    'temporary_files', (select count(*) from public.storage_unlinked_objects where not is_orphan),
    'temporary_bytes', (select coalesce(sum(size_bytes), 0) from public.storage_unlinked_objects where not is_orphan),
    'orphan_files', (select count(*) from public.storage_unlinked_objects where is_orphan),
    'orphan_bytes', (select coalesce(sum(size_bytes), 0) from public.storage_unlinked_objects where is_orphan),
    'retention_hours', public.setting_int('storage_orphan_retention_hours', 24),
    'alert_percent', v_alert,
    'workshop_quota_bytes', public.setting_int('workshop_storage_quota_mb', 500)::bigint * 1048576,
    'max_file_bytes', public.setting_int('attachment_max_file_mb', 10)::bigint * 1048576,
    'users_in_alert', (select count(*) from (
        select u.id from auth.users u
         where public.user_storage_used_bytes(u.id) * 100 >= v_alert::bigint * public.user_storage_quota_mb(u.id)::bigint * 1048576
           and public.user_storage_used_bytes(u.id) > 0) x),
    'workshops_in_alert', (select count(*) from (
        select a.organization_id from public.attachments a where a.organization_id is not null group by 1
        having sum(a.file_size) * 100 >= v_alert::bigint * public.setting_int('workshop_storage_quota_mb', 500)::bigint * 1048576) y),
    'last_cleanup', (select jsonb_build_object('finished_at', finished_at, 'deleted_files', deleted_files, 'deleted_bytes', deleted_bytes, 'status', status)
                       from public.storage_cleanups order by created_at desc limit 1)
  );
end;
$$;

create or replace function public.admin_storage_top_users(p_limit int default 20)
returns table (user_id uuid, full_name text, email_masked text, motorcycles int, used_bytes bigint, quota_bytes bigint, used_percent numeric, in_alert boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_alert int := public.setting_int('storage_alert_percent', 80);
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select x.id, x.full_name, x.email_masked, x.motos, x.used, x.quota,
           round(x.used * 100.0 / nullif(x.quota, 0), 1), x.used * 100 >= v_alert::bigint * x.quota
      from (select u.id, p.full_name, public.mask_email(u.email::text) email_masked,
                   (select count(*)::int from public.motorcycle_ownerships o where o.owner_user_id = u.id and o.ended_at is null) motos,
                   public.user_storage_used_bytes(u.id) used,
                   public.user_storage_quota_mb(u.id)::bigint * 1048576 quota
              from auth.users u
              left join public.profiles p on p.id = u.id) x
     where x.used > 0
     order by x.used * 1.0 / nullif(x.quota, 0) desc nulls last, x.used desc
     limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

create or replace function public.admin_storage_top_motorcycles(p_limit int default 20)
returns table (motorcycle_id uuid, motorcycle_name text, owner_name text, files int, bytes bigint, workshop_bytes bigint, diary_bytes bigint)
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
    select m.id, m.brand || ' ' || m.model || ' ' || m.manufacturing_year, p.full_name,
           count(a.id)::int, sum(a.file_size)::bigint,
           coalesce(sum(a.file_size) filter (where a.organization_id is not null), 0)::bigint,
           coalesce(sum(a.file_size) filter (where a.diary_entry_id is not null), 0)::bigint
      from public.attachments a
      join public.motorcycles m on m.id = a.motorcycle_id
      left join public.motorcycle_ownerships o on o.motorcycle_id = m.id and o.ended_at is null
      left join public.profiles p on p.id = o.owner_user_id
     group by m.id, m.brand, m.model, m.manufacturing_year, p.full_name
     order by sum(a.file_size) desc
     limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

create or replace function public.admin_storage_top_workshops(p_limit int default 20)
returns table (organization_id uuid, organization_name text, files int, used_bytes bigint, quota_bytes bigint, used_percent numeric, in_alert boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_alert int := public.setting_int('storage_alert_percent', 80);
  v_quota bigint := public.setting_int('workshop_storage_quota_mb', 500)::bigint * 1048576;
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return query
    select g.id, g.name, count(a.id)::int, sum(a.file_size)::bigint, v_quota,
           round(sum(a.file_size) * 100.0 / v_quota, 1), sum(a.file_size) * 100 >= v_alert::bigint * v_quota
      from public.attachments a
      join public.organizations g on g.id = a.organization_id
     group by g.id, g.name
     order by sum(a.file_size) desc
     limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

-- Arquivos sem registro: temporários (dentro da retenção) e sem vínculo (fora).
create or replace function public.admin_list_unlinked_files(p_limit int default 100)
returns table (storage_path text, size_bytes bigint, created_at timestamptz, is_orphan boolean)
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
    select s.name, s.size_bytes, s.created_at, s.is_orphan
      from public.storage_unlinked_objects s
     order by s.created_at
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- Limpeza ------------------------------------------------------------------------

create table if not exists public.storage_cleanups (
  id             uuid primary key default gen_random_uuid(),
  requested_by   uuid references auth.users (id) on delete set null,
  reason         text not null,
  planned        jsonb not null,
  planned_files  int not null,
  planned_bytes  bigint not null,
  status         text not null default 'planned' check (status in ('planned', 'done', 'failed')),
  deleted_files  int,
  deleted_bytes  bigint,
  failed_files   int,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);
alter table public.storage_cleanups enable row level security;
revoke all on public.storage_cleanups from public, anon, authenticated;
comment on table public.storage_cleanups is
  'Execuções da limpeza de arquivos sem vínculo (ADR-026). Planejada pelo admin no banco, executada pela Edge Function storage-cleanup.';

-- Chamada pelo admin (pela Edge Function, com o token dele): valida, planeja e audita.
create or replace function public.admin_plan_storage_cleanup(p_reason text, p_limit int default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.require_admin_reason(p_reason);
  v_files jsonb;
  v_n int;
  v_bytes bigint;
  v_id uuid;
begin
  if exists (select 1 from public.storage_cleanups where status = 'planned' and created_at > now() - interval '10 minutes') then
    raise exception 'Já existe uma limpeza em andamento. Aguarde alguns minutos.' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('path', name, 'size', size_bytes)), '[]'::jsonb), count(*), coalesce(sum(size_bytes), 0)
    into v_files, v_n, v_bytes
    from (select name, size_bytes from public.storage_unlinked_objects where is_orphan
           order by created_at limit least(greatest(coalesce(p_limit, 200), 1), 1000)) s;
  insert into public.storage_cleanups (requested_by, reason, planned, planned_files, planned_bytes, status, finished_at,
                                       deleted_files, deleted_bytes, failed_files)
  values (auth.uid(), v_reason, v_files, v_n, v_bytes,
          case when v_n = 0 then 'done' else 'planned' end, case when v_n = 0 then now() end,
          case when v_n = 0 then 0 end, case when v_n = 0 then 0 end, case when v_n = 0 then 0 end)
  returning id into v_id;
  perform public.write_audit('storage_cleanup', v_id::text, 'admin_storage_cleanup_planned', null, null, null,
    jsonb_build_object('reason', v_reason, 'files', v_n, 'bytes', v_bytes));
  return jsonb_build_object('cleanup_id', v_id, 'paths',
    coalesce((select jsonb_agg(f ->> 'path') from jsonb_array_elements(v_files) f), '[]'::jsonb), 'bytes', v_bytes);
end;
$$;

-- Chamada pela Edge Function com service_role, depois de apagar pela API de Storage.
create or replace function public.storage_cleanup_finish(p_cleanup_id uuid, p_deleted text[], p_failed int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.storage_cleanups;
  v_files int;
  v_bytes bigint;
begin
  select * into c from public.storage_cleanups where id = p_cleanup_id for update;
  if not found or c.status <> 'planned' then
    raise exception 'Limpeza não encontrada ou já encerrada.' using errcode = 'P0002';
  end if;
  -- Só conta o que estava no plano.
  select count(*), coalesce(sum((f ->> 'size')::bigint), 0) into v_files, v_bytes
    from jsonb_array_elements(c.planned) f
   where f ->> 'path' = any (coalesce(p_deleted, '{}'));
  update public.storage_cleanups
     set status = case when v_files = 0 and c.planned_files > 0 then 'failed' else 'done' end,
         deleted_files = v_files, deleted_bytes = v_bytes, failed_files = greatest(coalesce(p_failed, 0), 0), finished_at = now()
   where id = p_cleanup_id;
  insert into public.audit_logs (actor_user_id, entity_type, entity_id, action, new_data)
  values (c.requested_by, 'storage_cleanup', p_cleanup_id::text, 'admin_storage_cleanup_done',
          jsonb_build_object('reason', c.reason, 'deleted_files', v_files, 'deleted_bytes', v_bytes, 'failed_files', greatest(coalesce(p_failed, 0), 0)));
  return jsonb_build_object('deleted_files', v_files, 'deleted_bytes', v_bytes);
end;
$$;

create or replace function public.admin_list_storage_cleanups(p_limit int default 20)
returns table (id uuid, requested_by_name text, reason text, status text, planned_files int, planned_bytes bigint,
               deleted_files int, deleted_bytes bigint, failed_files int, created_at timestamptz, finished_at timestamptz)
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
    select c.id, p.full_name, c.reason, c.status, c.planned_files, c.planned_bytes,
           c.deleted_files, c.deleted_bytes, c.failed_files, c.created_at, c.finished_at
      from public.storage_cleanups c
      left join public.profiles p on p.id = c.requested_by
     order by c.created_at desc
     limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

revoke execute on function public.admin_storage_overview() from public, anon;
revoke execute on function public.admin_storage_top_users(int) from public, anon;
revoke execute on function public.admin_storage_top_motorcycles(int) from public, anon;
revoke execute on function public.admin_storage_top_workshops(int) from public, anon;
revoke execute on function public.admin_list_unlinked_files(int) from public, anon;
revoke execute on function public.admin_plan_storage_cleanup(text, int) from public, anon;
revoke execute on function public.admin_list_storage_cleanups(int) from public, anon;
revoke execute on function public.storage_cleanup_finish(uuid, text[], int) from public, anon, authenticated;
grant execute on function public.admin_storage_overview() to authenticated;
grant execute on function public.admin_storage_top_users(int) to authenticated;
grant execute on function public.admin_storage_top_motorcycles(int) to authenticated;
grant execute on function public.admin_storage_top_workshops(int) to authenticated;
grant execute on function public.admin_list_unlinked_files(int) to authenticated;
grant execute on function public.admin_plan_storage_cleanup(text, int) to authenticated;
grant execute on function public.admin_list_storage_cleanups(int) to authenticated;
grant execute on function public.storage_cleanup_finish(uuid, text[], int) to service_role;
