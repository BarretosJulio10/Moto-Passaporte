# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.31.0
**Data:** 07/11/2026
**Fase:** Fases 1 a 4 concluídas. Fases 1 a 5 concluídas (Mercado Pago aguardando teste ponta a ponta). Fase 6 em andamento: painel administrativo
**Progresso geral:** 87,5% (35 de 40 itens do PRD — quadro em `PRD_CHECKLIST.md`)

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | https://moto-passaporte.vercel.app (Vercel, deploy automático da `main`) | Supabase `ripgenhykaajcnzdxoid` (MOTO_Passaporte, us-east-1, PG 17) | migrações até `chassis_encryption` aplicadas; Edge Functions `mercadopago-check`, `mercadopago-billing`, `mercadopago-webhook`, `storage-cleanup` e `scheduled-jobs` publicadas; rotinas agendadas no pg_cron |
| Homologação | — | — | não configurado |
| Produção | — | — | não configurado |

## Andamento por fase

| Fase | Situação |
|---|---|
| 1 — Fundação SaaS e site | concluída (base) |
| 2 — Histórico e arquivos | concluída |
| 3 — Oficinas e autorizações | concluída: cadastro, perfil, pesquisa por placa, autorizações, Oficina de Origem, equipe e serviços da oficina |
| 4 — Transferência e compartilhamento | concluída: transferência, motos anteriores, compartilhamento controlado e revogável |
| 5 — Monetização | concluída: planos, conta do Mercado Pago, assinaturas, Webhook, conciliação, atraso, cancelamento, benefícios Premium e faturas (falta teste real com o Mercado Pago, KI-026) |
| 6 — Administração e lançamento | em andamento: painel administrativo completo, verificação de placa, armazenamento, testes/regressão e backup/restauração; falta homologação e lançamento |

## Próximos passos (em ordem)

Concluído em 0.26.0: backup, restauração e rollback (ADR-028, `OPERATIONS.md`). Item 6.5 concluído; ativar o backup cadastrando os segredos no GitHub. Antes de publicar: `scripts/validation/run_all.sh`.

1. Fase 6.6 — homologação (`HOMOLOGATION.md`) e publicação.
2. Fase 6 — testes de segurança, backup, homologação e lançamento.
2. Validação ponta a ponta com credenciais de teste (KI-026) assim que o responsável cadastrar a conta de teste.
2. Fase 5.3 a 5.5 — faturas, cotas Premium, atraso, cancelamento e reativação.
3. **Responsável pelo produto:** ligar a proteção contra senhas vazadas no Supabase (KI-021); falta o e-mail de atendimento (KI-015).

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.
- Arquivos órfãos de envios que falharam — KI-017 (parcial).
- Pedidos de acesso avisados só no painel; sem CAPTCHA na pesquisa — KI-020.

## Último backup confirmado

Não aplicável — banco sem dados de usuários além da conta do responsável.
