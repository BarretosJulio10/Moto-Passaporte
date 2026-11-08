-- =============================================================================
-- Marca as duas configurações antigas que não são mais lidas (KI-023). Só a descrição muda.
-- Rollback: desnecessário (texto informativo).
-- =============================================================================
update public.system_settings
   set description = 'NÃO USADA desde a v0.17.0: o limite vem do plano gratuito em /admin/planos (KI-023). Mantida só por histórico.'
 where key in ('free_plan_max_motorcycles', 'free_plan_storage_quota_mb')
   and description not like 'NÃO USADA%';
