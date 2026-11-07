-- =============================================================================
-- Simulação mínima do ambiente Supabase para testar migrações em PostgreSQL puro.
-- NÃO aplicar no Supabase real (lá estes objetos já existem).
-- Reproduz: papéis anon/authenticated/service_role, auth.users, auth.uid()
-- e os privilégios padrão que o Supabase concede no schema public.
-- =============================================================================

create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;

create schema auth;
create schema extensions;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb,
  aud                text,
  role               text,
  banned_until       timestamptz,
  last_sign_in_at    timestamptz,
  created_at         timestamptz not null default now()
);

create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Claims da sessão, como no Supabase (request.jwt.claims). Simulação: quando o teste só define
-- request.jwt.claim.sub, considera sessão com verificação em duas etapas (aal2), para as suítes
-- antigas de admin; a suíte da MFA define request.jwt.claim.aal = 'aal1' explicitamente.
create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    jsonb_build_object('sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
                       'aal', coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''), 'aal2')));
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- Privilégios padrão do Supabase: tudo concedido a anon/authenticated,
-- cabendo às migrações revogar e à RLS proteger.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Storage (mínimo para testar políticas de anexos)
-- -----------------------------------------------------------------------------
create schema storage;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  owner_id   text,
  metadata   jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);

-- Em produção o serviço de Storage grava o dono; aqui um trigger simula isso.
create function storage.set_owner() returns trigger language plpgsql as $$
begin
  new.owner := auth.uid();
  new.owner_id := auth.uid()::text;
  return new;
end $$;
create trigger objects_owner before insert on storage.objects for each row execute function storage.set_owner();

-- Simulação da Edge Function attachment-check (ADR-033): no banco de teste todo envio é
-- considerado conferido, exceto quando a suíte define tests.skip_file_check = 'on'.
create function storage.simulate_file_check() returns trigger language plpgsql security definer as $$
begin
  if to_regclass('public.attachment_checks') is not null
     and new.metadata ->> 'mimetype' is not null
     and coalesce(current_setting('tests.skip_file_check', true), '') <> 'on' then
    execute 'insert into public.attachment_checks (storage_path, mime_type, ok) values ($1, $2, true)
             on conflict (storage_path) do update set ok = true, mime_type = excluded.mime_type, checked_at = now()'
      using new.name, new.metadata ->> 'mimetype';
  end if;
  return new;
end $$;
create trigger objects_simulated_check after insert on storage.objects for each row execute function storage.simulate_file_check();

create function storage.foldername(name text) returns text[]
language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;

alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

-- Supabase Vault (mínimo para testes): no Supabase real os segredos ficam criptografados.
create schema vault;
create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text,
  secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, created_at, updated_at from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language sql as $$
  insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id
$$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
returns void language sql as $$
  update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name),
         description = coalesce(new_description, description), updated_at = now() where id = secret_id
$$;
revoke all on schema vault from public;
