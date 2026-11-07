-- =============================================================================
-- Moto Passaporte — Migração 0500: passaporte público (dados padrão)
-- Objetivo: consulta pública mínima por public_id (QR Code / link), conforme
--           ADR-008. Compartilhamento selecionável e revogável entra na Fase 4.
-- Dependências: 0400_motorcycles.
-- Reversão: drop function public.get_public_passport(text).
-- =============================================================================

-- Retorna apenas campos públicos padrão. Nunca placa, chassi, proprietários
-- ou histórico. Retorna NULL quando não encontrado (sem diferenciar motivos).
create or replace function public.get_public_passport(p_public_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'public_id',           m.public_id,
    'brand',               m.brand,
    'model',               m.model,
    'version',             m.version,
    'manufacturing_year',  m.manufacturing_year,
    'model_year',          m.model_year,
    'displacement_cc',     m.displacement_cc,
    'color',               m.color,
    'passport_created_at', m.created_at
  )
  from public.motorcycles m
  where p_public_id ~ '^[0-9a-f]{32}$'
    and m.public_id = p_public_id
    and m.status = 'active';
$$;

revoke execute on function public.get_public_passport(text) from public;
grant  execute on function public.get_public_passport(text) to anon, authenticated;
