-- =============================================================================
-- ROLLBACK de 20261107212126_storage_monitoring (v0.24.0, ADR-026). Ver docs/OPERATIONS.md §4.
-- Perde: histórico de limpezas (storage_cleanups). A auditoria em audit_logs permanece.
-- Não apaga arquivos. A Edge Function storage-cleanup deve ser removida antes (passa a falhar).
-- =============================================================================
begin;
drop function if exists public.storage_cleanup_finish(uuid, text[], int);
drop function if exists public.admin_plan_storage_cleanup(text, int);
drop function if exists public.admin_list_storage_cleanups(int);
drop function if exists public.admin_list_unlinked_files(int);
drop function if exists public.admin_storage_top_workshops(int);
drop function if exists public.admin_storage_top_motorcycles(int);
drop function if exists public.admin_storage_top_users(int);
drop function if exists public.admin_storage_overview();
drop table if exists public.storage_cleanups;
drop view if exists public.storage_unlinked_objects;
drop function if exists public.user_storage_used_bytes(uuid);
delete from public.system_settings where key in ('storage_orphan_retention_hours', 'storage_alert_percent');
-- setting_spec volta à versão de 20261107205649_admin_audit_settings
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
commit;
