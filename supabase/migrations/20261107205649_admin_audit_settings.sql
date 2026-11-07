-- =============================================================================
-- Fase 6.1 (parte 2) — Consulta de auditoria e configurações gerais (PRD 7.7, 7.8; ADR-024)
-- - Configurações passam a ser alteradas só por admin_update_setting, com validação por
--   chave e motivo. Fecha a escrita direta do admin em system_settings (que permitia ligar
--   billing_enabled sem as checagens de ADR-020).
-- - Auditoria: busca com filtros mostra só metadados; o conteúdo (antes/depois) exige motivo
--   e a própria consulta fica registrada.
-- Rollback: grant insert, update on public.system_settings to authenticated; remover as funções.
-- =============================================================================

revoke insert, update, delete on public.system_settings from authenticated, anon;

-- Catálogo do que pode ser editado e como validar. Chaves fora daqui não são editáveis por esta tela.
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
  end::jsonb;
$$;

create or replace function public.admin_list_settings()
returns table (key text, value jsonb, description text, is_public boolean, updated_at timestamptz, updated_by_name text, spec jsonb)
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
    select s.key, s.value, s.description, s.is_public, s.updated_at, pr.full_name, public.setting_spec(s.key)
      from public.system_settings s
      left join public.profiles pr on pr.id = s.updated_by
     where public.setting_spec(s.key) is not null
     order by public.setting_spec(s.key) ->> 'group', s.key;
end;
$$;

revoke execute on function public.admin_list_settings() from public, anon;
grant execute on function public.admin_list_settings() to authenticated;

create or replace function public.admin_update_setting(p_key text, p_value jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.require_admin_reason(p_reason);
  v_spec jsonb := public.setting_spec(p_key);
  v_old jsonb;
  v_new jsonb := p_value;
  v_text text;
begin
  if v_spec is null then
    raise exception 'Esta configuração não pode ser alterada por aqui.' using errcode = 'P0001';
  end if;
  select value into v_old from public.system_settings where key = p_key for update;
  if not found then
    raise exception 'Configuração não encontrada.' using errcode = 'P0002';
  end if;

  if v_spec ->> 'kind' = 'int' then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}') !~ '^\d+$'
       or (p_value #>> '{}')::int not between (v_spec ->> 'min')::int and (v_spec ->> 'max')::int then
      raise exception 'Valor inválido: use um número inteiro entre % e %.', v_spec ->> 'min', v_spec ->> 'max' using errcode = '22023';
    end if;
  elsif v_spec ->> 'kind' in ('email', 'phone') then
    if p_value = 'null'::jsonb or (jsonb_typeof(p_value) = 'string' and btrim(p_value #>> '{}') = '') then
      v_new := 'null'::jsonb;
    elsif jsonb_typeof(p_value) <> 'string' then
      raise exception 'Valor inválido.' using errcode = '22023';
    else
      v_text := btrim(p_value #>> '{}');
      if v_spec ->> 'kind' = 'email' then
        v_text := lower(v_text);
        if v_text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_text) > 120 then
          raise exception 'E-mail inválido.' using errcode = '22023';
        end if;
      else
        v_text := regexp_replace(v_text, '\D', '', 'g');
        if v_text !~ '^\d{12,13}$' then
          raise exception 'WhatsApp inválido: use DDI + DDD + número, ex. 5521999998888.' using errcode = '22023';
        end if;
      end if;
      v_new := to_jsonb(v_text);
    end if;
  end if;

  if v_new is not distinct from v_old then
    return;
  end if;
  update public.system_settings set value = v_new, updated_by = auth.uid(), updated_at = now() where key = p_key;
  perform public.write_audit('system_settings', p_key, 'admin_update_setting', null, null,
                             jsonb_build_object('value', v_old), jsonb_build_object('value', v_new, 'reason', v_reason));
end;
$$;

revoke execute on function public.admin_update_setting(text, jsonb, text) from public, anon;
grant execute on function public.admin_update_setting(text, jsonb, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Auditoria (PRD 7.7)
-- -----------------------------------------------------------------------------

create or replace function public.admin_search_audit(
  p_entity_type     text default null,
  p_action          text default null,
  p_actor           uuid default null,
  p_motorcycle_id   uuid default null,
  p_organization_id uuid default null,
  p_from            timestamptz default null,
  p_to              timestamptz default null,
  p_limit           int default 100,
  p_before_id       bigint default null
)
returns table (
  id bigint, created_at timestamptz, entity_type text, entity_id text, action text,
  actor_user_id uuid, actor_name text, motorcycle_id uuid, motorcycle_label text,
  organization_id uuid, organization_name text, reason text, has_data boolean
)
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
    select a.id, a.created_at, a.entity_type, a.entity_id, a.action,
           a.actor_user_id, coalesce(pr.full_name, case when a.actor_user_id is null then 'Sistema' else 'Conta removida' end),
           a.motorcycle_id, case when m.id is not null then m.brand || ' ' || m.model || ' ' || m.manufacturing_year end,
           a.organization_id, og.name,
           a.new_data ->> 'reason',
           (a.previous_data is not null or a.new_data is not null)
      from public.audit_logs a
      left join public.profiles pr on pr.id = a.actor_user_id
      left join public.motorcycles m on m.id = a.motorcycle_id
      left join public.organizations og on og.id = a.organization_id
     where (p_entity_type is null or a.entity_type = p_entity_type)
       and (p_action is null or a.action = p_action)
       and (p_actor is null or a.actor_user_id = p_actor)
       and (p_motorcycle_id is null or a.motorcycle_id = p_motorcycle_id)
       and (p_organization_id is null or a.organization_id = p_organization_id)
       and (p_from is null or a.created_at >= p_from)
       and (p_to is null or a.created_at < p_to)
       and (p_before_id is null or a.id < p_before_id)
     order by a.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke execute on function public.admin_search_audit(text, text, uuid, uuid, uuid, timestamptz, timestamptz, int, bigint) from public, anon;
grant execute on function public.admin_search_audit(text, text, uuid, uuid, uuid, timestamptz, timestamptz, int, bigint) to authenticated;

-- Conteúdo de um evento (pode ter dados privados): exige motivo e registra a consulta.
create or replace function public.admin_get_audit_entry(p_id bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := public.require_admin_reason(p_reason);
  a public.audit_logs;
begin
  select * into a from public.audit_logs where id = p_id;
  if not found then
    raise exception 'Evento não encontrado.' using errcode = 'P0002';
  end if;
  perform public.write_audit('audit_logs', p_id::text, 'admin_viewed_audit', a.motorcycle_id, a.organization_id, null,
                             jsonb_build_object('reason', v_reason));
  return jsonb_build_object('id', a.id, 'previous_data', a.previous_data, 'new_data', a.new_data);
end;
$$;

revoke execute on function public.admin_get_audit_entry(bigint, text) from public, anon;
grant execute on function public.admin_get_audit_entry(bigint, text) to authenticated;

-- Valores distintos para os filtros da tela.
create or replace function public.admin_audit_facets()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'entity_types', (select coalesce(jsonb_agg(t order by t), '[]'::jsonb) from (select distinct entity_type t from public.audit_logs) x),
    'actions', (select coalesce(jsonb_agg(t order by t), '[]'::jsonb) from (select distinct action t from public.audit_logs) x)
  );
end;
$$;

revoke execute on function public.admin_audit_facets() from public, anon;
grant execute on function public.admin_audit_facets() to authenticated;
