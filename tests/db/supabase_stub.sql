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
