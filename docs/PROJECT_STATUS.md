# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.15.0
**Data:** 07/11/2026
**Fase:** Fases 1 a 4 concluídas. Próxima: Fase 5 (planos e Mercado Pago)
**Progresso geral:** 72,5% (29 de 40 itens do PRD — quadro em `PRD_CHECKLIST.md`)

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | https://moto-passaporte.vercel.app (Vercel, deploy automático da `main`) | Supabase `ripgenhykaajcnzdxoid` (MOTO_Passaporte, us-east-1, PG 17) | migrações até `passport_shares` aplicadas |
| Homologação | — | — | não configurado |
| Produção | — | — | não configurado |

## Andamento por fase

| Fase | Situação |
|---|---|
| 1 — Fundação SaaS e site | concluída (base) |
| 2 — Histórico e arquivos | concluída |
| 3 — Oficinas e autorizações | concluída: cadastro, perfil, pesquisa por placa, autorizações, Oficina de Origem, equipe e serviços da oficina |
| 4 — Transferência e compartilhamento | concluída: transferência, motos anteriores, compartilhamento controlado e revogável |
| 5 — Monetização | planejado |
| 6 — Administração e lançamento | planejado |

## Próximos passos (em ordem)

Concluído em 0.15.0: compartilhamento controlado (ADR-017). Fase 4 concluída.

1. Fase 5 — planos e preços configuráveis (5.1); depende das decisões P-1 (valores e benefícios do Premium), P-3, P-4 e P-5.
2. Fase 5 — Mercado Pago, assinaturas, faturas, cotas Premium, atraso e cancelamento.
3. **Responsável pelo produto:** ligar a proteção contra senhas vazadas no Supabase (KI-021); falta o e-mail de atendimento (KI-015).

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.
- Arquivos órfãos de envios que falharam — KI-017 (parcial).
- Pedidos de acesso avisados só no painel; sem CAPTCHA na pesquisa — KI-020.

## Último backup confirmado

Não aplicável — banco sem dados de usuários além da conta do responsável.
