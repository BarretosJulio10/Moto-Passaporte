-- =============================================================================
-- Moto Passaporte — Migração: canais públicos de contato (PRD 3.3 item 8, P-9)
-- Objetivo: e-mail e WhatsApp de atendimento configuráveis, sem valores no código.
--           Valores começam vazios (null) até o responsável definir os canais.
-- Dependências: identity (system_settings).
-- Reversão: delete from public.system_settings where key in ('support_email','support_whatsapp');
-- =============================================================================

insert into public.system_settings (key, value, description, is_public) values
  ('support_email', 'null'::jsonb, 'E-mail público de atendimento exibido na página de contato.', true),
  ('support_whatsapp', 'null'::jsonb, 'WhatsApp público de atendimento (somente números, com DDI e DDD).', true)
on conflict (key) do nothing;
