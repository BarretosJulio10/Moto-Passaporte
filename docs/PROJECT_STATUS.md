# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.9.0
**Data:** 07/11/2026
**Fase:** Fase 2 concluída (exceto selo de oficina, que depende da Fase 3). Próxima: Fase 3
**Progresso geral:** 48,8% (19,5 de 40 itens do PRD — quadro em `PRD_CHECKLIST.md`)

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | https://moto-passaporte.vercel.app (Vercel, deploy automático da `main`) | Supabase `ripgenhykaajcnzdxoid` (MOTO_Passaporte, us-east-1, PG 17) | migrações até `diary` aplicadas |
| Homologação | — | — | não configurado |
| Produção | — | — | não configurado |

## Andamento por fase

| Fase | Situação |
|---|---|
| 1 — Fundação SaaS e site | concluída (base) |
| 2 — Histórico e arquivos | concluída: linha do tempo, manutenção, quilometragem, anexos, diário. Falta só o selo "confirmado por oficina" (Fase 3) |
| 3 — Oficinas e autorizações | cadastro e perfil público de oficina prontos; resto planejado |
| 4 — Transferência e compartilhamento | imutabilidade do histórico pronta no banco; resto planejado |
| 5 — Monetização | planejado |
| 6 — Administração e lançamento | planejado |

## Próximos passos (em ordem)

Concluído em 0.9.0: diário da moto (privado/compartilhável, fotos).

1. Fase 3, item 3.3 — pesquisa protegida por placa (oficina encontra a moto sem ver dados privados).
2. Fase 3, item 3.4 — solicitação, aprovação e revogação de acesso (`motorcycle_workshop_access`).
3. Fase 3, itens 3.5 a 3.7 — Oficina de Origem, membros, registro de serviço pela oficina (selo "confirmado por oficina").
4. **Responsável pelo produto:** falta o e-mail de atendimento (KI-015).

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.
- Arquivos órfãos de envios que falharam — KI-017 (parcial).

## Último backup confirmado

Não aplicável — banco sem dados de usuários além da conta do responsável.
