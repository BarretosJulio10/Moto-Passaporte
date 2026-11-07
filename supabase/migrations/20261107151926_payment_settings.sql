-- =============================================================================
-- Fase 5.2 (parte 1) — Credenciais do Mercado Pago no painel do administrador (ADR-019)
-- - payment_gateway_settings: ambiente, chave pública, dicas (4 últimos caracteres)
--   e referências aos segredos guardados criptografados no Supabase Vault.
-- - O token de acesso e a assinatura secreta do Webhook NUNCA voltam para o
--   navegador: só são gravados (admin) e lidos por funções do servidor (service_role).
-- - Teste de conexão feito pela Edge Function mercadopago-check.
-- Rollback: drop das funções e da tabela; apagar do vault os segredos
--   mercadopago_access_token e mercadopago_webhook_secret.
-- =============================================================================

create table public.payment_gateway_settings (
  provider                 text primary key default 'mercadopago' check (provider = 'mercadopago'),
  environment              text not null default 'test' check (environment in ('test', 'production')),
  public_key               text check (public_key ~ '^(TEST|APP_USR)-[A-Za-z0-9-]{10,200}$'),
  access_token_secret_id   uuid,
  access_token_hint        text check (char_length(access_token_hint) <= 8),
  webhook_secret_secret_id uuid,
  webhook_secret_hint      text check (char_length(webhook_secret_hint) <= 8),
  account_id               text check (char_length(account_id) <= 40),
  account_nickname         text check (char_length(account_nickname) <= 120),
  last_check_at            timestamptz,
  last_check_ok            boolean,
  last_check_message       text check (char_length(last_check_message) <= 300),
  updated_at               timestamptz not null default now(),
  updated_by               uuid references auth.users (id) on delete set null
);

comment on table public.payment_gateway_settings is
  'Configuração do Mercado Pago (ADR-019). Segredos ficam no Supabase Vault; aqui só referências e os 4 últimos caracteres.';

create index payment_gateway_settings_updated_by on public.payment_gateway_settings (updated_by);

insert into public.payment_gateway_settings (provider) values ('mercadopago');

alter table public.payment_gateway_settings enable row level security;
revoke all on public.payment_gateway_settings from anon, authenticated;

create trigger payment_gateway_settings_audit
  after insert or update or delete on public.payment_gateway_settings
  for each row execute function public.audit_row_change('', '');

-- Grava ou substitui um segredo no Vault com nome fixo; devolve o id.
create or replace function public.upsert_vault_secret(p_name text, p_value text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    v_id := vault.create_secret(p_value, p_name, 'Moto Passaporte — gravado pelo painel do administrador');
  else
    perform vault.update_secret(v_id, p_value);
  end if;
  return v_id;
end;
$$;

revoke execute on function public.upsert_vault_secret(text, text) from public, anon, authenticated;

create or replace function public.admin_get_payment_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.payment_gateway_settings;
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  select * into s from public.payment_gateway_settings where provider = 'mercadopago';
  return jsonb_build_object(
    'environment', s.environment,
    'public_key', s.public_key,
    'access_token_configured', s.access_token_secret_id is not null,
    'access_token_hint', s.access_token_hint,
    'webhook_secret_configured', s.webhook_secret_secret_id is not null,
    'webhook_secret_hint', s.webhook_secret_hint,
    'account_id', s.account_id,
    'account_nickname', s.account_nickname,
    'last_check_at', s.last_check_at,
    'last_check_ok', s.last_check_ok,
    'last_check_message', s.last_check_message,
    'updated_at', s.updated_at,
    'updated_by_name', (select full_name from public.profiles where id = s.updated_by),
    'billing_enabled', coalesce((select (value #>> '{}')::boolean from public.system_settings where key = 'billing_enabled'), false)
  );
end;
$$;

revoke execute on function public.admin_get_payment_settings() from public, anon;
grant execute on function public.admin_get_payment_settings() to authenticated;

-- Token e assinatura: null mantém o atual. Trocar o token zera a verificação da conta.
create or replace function public.admin_save_payment_settings(
  p_environment    text,
  p_public_key     text,
  p_access_token   text default null,
  p_webhook_secret text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token  text := nullif(btrim(p_access_token), '');
  v_secret text := nullif(btrim(p_webhook_secret), '');
  v_pub    text := nullif(btrim(p_public_key), '');
  s public.payment_gateway_settings;
begin
  if not public.is_admin() then
    raise exception 'Operação não permitida.' using errcode = '42501';
  end if;
  if p_environment not in ('test', 'production') then
    raise exception 'Ambiente inválido.' using errcode = '22023';
  end if;
  if v_pub is not null and v_pub !~ '^(TEST|APP_USR)-[A-Za-z0-9-]{10,200}$' then
    raise exception 'Chave pública inválida. Ela começa com TEST- ou APP_USR-.' using errcode = '22023';
  end if;
  if v_token is not null and v_token !~ '^(TEST|APP_USR)-[A-Za-z0-9-]{20,250}$' then
    raise exception 'Token de acesso inválido. Ele começa com TEST- ou APP_USR-.' using errcode = '22023';
  end if;
  if v_secret is not null and v_secret !~ '^[A-Za-z0-9_-]{16,200}$' then
    raise exception 'Assinatura secreta inválida.' using errcode = '22023';
  end if;

  select * into s from public.payment_gateway_settings where provider = 'mercadopago' for update;

  update public.payment_gateway_settings set
    environment = p_environment,
    public_key = v_pub,
    access_token_secret_id = case when v_token is null then s.access_token_secret_id
                                  else public.upsert_vault_secret('mercadopago_access_token', v_token) end,
    access_token_hint = case when v_token is null then s.access_token_hint else right(v_token, 4) end,
    webhook_secret_secret_id = case when v_secret is null then s.webhook_secret_secret_id
                                    else public.upsert_vault_secret('mercadopago_webhook_secret', v_secret) end,
    webhook_secret_hint = case when v_secret is null then s.webhook_secret_hint else right(v_secret, 4) end,
    account_id = case when v_token is null and p_environment = s.environment then s.account_id end,
    account_nickname = case when v_token is null and p_environment = s.environment then s.account_nickname end,
    last_check_at = case when v_token is null and p_environment = s.environment then s.last_check_at end,
    last_check_ok = case when v_token is null and p_environment = s.environment then s.last_check_ok end,
    last_check_message = case when v_token is null and p_environment = s.environment then s.last_check_message end,
    updated_at = now(),
    updated_by = auth.uid()
  where provider = 'mercadopago';

  perform public.write_audit('payment_gateway_settings', 'mercadopago', 'payment_credentials_saved', null, null, null,
    jsonb_build_object('environment', p_environment, 'access_token_changed', v_token is not null,
                       'webhook_secret_changed', v_secret is not null));
end;
$$;

revoke execute on function public.admin_save_payment_settings(text, text, text, text) from public, anon;
grant execute on function public.admin_save_payment_settings(text, text, text, text) to authenticated;

-- Somente servidor (Edge Functions com service_role).
create or replace function public.payment_access_token()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
  from public.payment_gateway_settings s
  join vault.decrypted_secrets d on d.id = s.access_token_secret_id
  where s.provider = 'mercadopago';
$$;

create or replace function public.payment_webhook_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
  from public.payment_gateway_settings s
  join vault.decrypted_secrets d on d.id = s.webhook_secret_secret_id
  where s.provider = 'mercadopago';
$$;

create or replace function public.record_payment_check(p_ok boolean, p_message text, p_account_id text, p_nickname text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_gateway_settings set
    last_check_at = now(),
    last_check_ok = p_ok,
    last_check_message = left(p_message, 300),
    account_id = case when p_ok then left(p_account_id, 40) else account_id end,
    account_nickname = case when p_ok then left(p_nickname, 120) else account_nickname end
  where provider = 'mercadopago';
$$;

revoke execute on function public.payment_access_token() from public, anon, authenticated;
revoke execute on function public.payment_webhook_secret() from public, anon, authenticated;
revoke execute on function public.record_payment_check(boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.payment_access_token() to service_role;
grant execute on function public.payment_webhook_secret() to service_role;
grant execute on function public.record_payment_check(boolean, text, text, text) to service_role;

-- Dados públicos para o checkout (só depois de liberada a contratação).
create or replace function public.get_payment_public_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'billing_enabled', coalesce((select (value #>> '{}')::boolean from public.system_settings where key = 'billing_enabled'), false),
    'environment', s.environment,
    'public_key', case when coalesce((select (value #>> '{}')::boolean from public.system_settings where key = 'billing_enabled'), false)
                       then s.public_key end
  )
  from public.payment_gateway_settings s where s.provider = 'mercadopago';
$$;

revoke execute on function public.get_payment_public_config() from public;
grant execute on function public.get_payment_public_config() to anon, authenticated;
