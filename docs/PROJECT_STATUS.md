# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.38.0
**Data:** 08/11/2026
**Fase:** Fases 1 a 4 concluídas. Fases 1 a 5 concluídas (Mercado Pago aguardando teste ponta a ponta). Fase 6 em andamento: painel administrativo
**Progresso geral:** 97,5% (39 de 40 itens do PRD — quadro em `PRD_CHECKLIST.md`)

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | https://moto-passaporte.vercel.app (Vercel, deploy automático da `main`) | Supabase `ripgenhykaajcnzdxoid` (MOTO_Passaporte, us-east-1, PG 17) | migrações até `system_health` aplicadas; Edge Functions `mercadopago-check`, `mercadopago-billing`, `mercadopago-webhook`, `storage-cleanup`, `scheduled-jobs`, `attachment-check` e `shared-file` publicadas; rotinas agendadas no pg_cron |
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

1. **Responsável:** percorrer o roteiro do `HOMOLOGATION.md` com contas reais (proprietário, oficina, comprador) e fazer uma assinatura real do plano mais barato (KI-026); o Claude acompanha pelo banco e corrige o que aparecer.
2. **Responsável:** cadastrar os segredos do backup no GitHub (OPERATIONS.md §2), ligar a proteção contra senhas vazadas (KI-021, exige plano Pro) e decidir sobre repositório privado (KI-031).
3. **Decisões antes de vender em escala:** nota fiscal de serviço (KI-027), revisão jurídica de Termos/Privacidade/LGPD, ambiente de produção separado (KI-007).
4. Depois do lançamento: ideias para oficinas (backlog de produto).

Feito em 08/11/2026: MFA do admin, e-mail de atendimento, contratação liberada com conexão testada, direitos do titular (v0.35.0), Premium por cortesia (v0.36.0), alerta ativo (v0.37.0) e homologação técnica.

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.
- Arquivos órfãos de envios que falharam — KI-017 (parcial).
- Pedidos de acesso avisados só no painel; sem CAPTCHA na pesquisa — KI-020.

## Último backup confirmado

Não aplicável — banco sem dados de usuários além da conta do responsável.
