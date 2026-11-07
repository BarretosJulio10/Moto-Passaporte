# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.16.0
**Data:** 07/11/2026
**Fase:** Fases 1 a 4 concluídas. Fase 5 em andamento: planos prontos; próximo, Mercado Pago
**Progresso geral:** 75% (30 de 40 itens do PRD — quadro em `PRD_CHECKLIST.md`)

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | https://moto-passaporte.vercel.app (Vercel, deploy automático da `main`) | Supabase `ripgenhykaajcnzdxoid` (MOTO_Passaporte, us-east-1, PG 17) | migrações até `subscription_plans` aplicadas |
| Homologação | — | — | não configurado |
| Produção | — | — | não configurado |

## Andamento por fase

| Fase | Situação |
|---|---|
| 1 — Fundação SaaS e site | concluída (base) |
| 2 — Histórico e arquivos | concluída |
| 3 — Oficinas e autorizações | concluída: cadastro, perfil, pesquisa por placa, autorizações, Oficina de Origem, equipe e serviços da oficina |
| 4 — Transferência e compartilhamento | concluída: transferência, motos anteriores, compartilhamento controlado e revogável |
| 5 — Monetização | em andamento: planos e preços configuráveis prontos; falta Mercado Pago, faturas, cotas Premium, atraso e cancelamento |
| 6 — Administração e lançamento | planejado |

## Próximos passos (em ordem)

Concluído em 0.16.0: planos e preços configuráveis (ADR-018).

1. Fase 5.2 — Mercado Pago: assinaturas, Webhooks e conciliação (precisa das credenciais de teste do Mercado Pago e das decisões P-3, P-4, P-5).
2. Fase 5.3 a 5.5 — faturas, cotas Premium, atraso, cancelamento e reativação.
3. **Responsável pelo produto:** ligar a proteção contra senhas vazadas no Supabase (KI-021); falta o e-mail de atendimento (KI-015).

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.
- Arquivos órfãos de envios que falharam — KI-017 (parcial).
- Pedidos de acesso avisados só no painel; sem CAPTCHA na pesquisa — KI-020.

## Último backup confirmado

Não aplicável — banco sem dados de usuários além da conta do responsável.
