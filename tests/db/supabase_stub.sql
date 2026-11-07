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
  created_at         timestamptz not null default now()
);

create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

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

create function storage.foldername(name text) returns text[]
language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;

alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
