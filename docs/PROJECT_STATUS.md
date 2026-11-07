# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.18.0
**Data:** 07/11/2026
**Fase:** Fases 1 a 4 concluídas. Fase 5 em andamento (80%): planos, conta do Mercado Pago e assinaturas prontos; faltam benefícios Premium extras e faturas
**Progresso geral:** 82,5% (33 de 40 itens do PRD — quadro em `PRD_CHECKLIST.md`)

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | https://moto-passaporte.vercel.app (Vercel, deploy automático da `main`) | Supabase `ripgenhykaajcnzdxoid` (MOTO_Passaporte, us-east-1, PG 17) | migrações até `subscriptions` aplicadas; Edge Functions `mercadopago-check`, `mercadopago-billing` e `mercadopago-webhook` publicadas |
| Homologação | — | — | não configurado |
| Produção | — | — | não configurado |

## Andamento por fase

| Fase | Situação |
|---|---|
| 1 — Fundação SaaS e site | concluída (base) |
| 2 — Histórico e arquivos | concluída |
| 3 — Oficinas e autorizações | concluída: cadastro, perfil, pesquisa por placa, autorizações, Oficina de Origem, equipe e serviços da oficina |
| 4 — Transferência e compartilhamento | concluída: transferência, motos anteriores, compartilhamento controlado e revogável |
| 5 — Monetização | em andamento: planos, conta do Mercado Pago, assinaturas, Webhook, conciliação, atraso e cancelamento prontos; faltam faturas por ciclo e benefícios Premium extras (PDF, lembretes) |
| 6 — Administração e lançamento | planejado |

## Próximos passos (em ordem)

Concluído em 0.18.0: assinaturas Premium pelo Mercado Pago (ADR-020).

1. Fase 5.4/5.3 — benefícios Premium (relatórios em PDF, lembretes) e faturas por ciclo.
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
