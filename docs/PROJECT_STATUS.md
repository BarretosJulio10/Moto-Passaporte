# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.10.0
**Data:** 07/11/2026
**Fase:** Fase 3 em andamento — pesquisa por placa e autorizações implementadas
**Progresso geral:** 53,8% (21,5 de 40 itens do PRD — quadro em `PRD_CHECKLIST.md`)

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | https://moto-passaporte.vercel.app (Vercel, deploy automático da `main`) | Supabase `ripgenhykaajcnzdxoid` (MOTO_Passaporte, us-east-1, PG 17) | migrações até `workshop_access_indexes` aplicadas |
| Homologação | — | — | não configurado |
| Produção | — | — | não configurado |

## Andamento por fase

| Fase | Situação |
|---|---|
| 1 — Fundação SaaS e site | concluída (base) |
| 2 — Histórico e arquivos | concluída: linha do tempo, manutenção, quilometragem, anexos, diário. Falta só o selo "confirmado por oficina" (Fase 3) |
| 3 — Oficinas e autorizações | cadastro, perfil público, pesquisa por placa e autorizações prontos; faltam Oficina de Origem, membros e registro de serviço pela oficina |
| 4 — Transferência e compartilhamento | imutabilidade do histórico pronta no banco; resto planejado |
| 5 — Monetização | planejado |
| 6 — Administração e lançamento | planejado |

## Próximos passos (em ordem)

Concluído em 0.10.0: pesquisa protegida por placa e autorizações de oficina.

1. Fase 3, item 3.5 — Oficina de Origem (vínculo com consentimento do dono, revogável).
2. Fase 3, item 3.6 — membros da oficina e permissões.
3. Fase 3, item 3.7 — registro de serviço pela oficina (selo "confirmado por oficina"; leitura do histórico pela oficina autorizada).
4. **Responsável pelo produto:** falta o e-mail de atendimento (KI-015).

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.
- Arquivos órfãos de envios que falharam — KI-017 (parcial).
- Pedidos de acesso avisados só no painel; sem CAPTCHA na pesquisa — KI-020.

## Último backup confirmado

Não aplicável — banco sem dados de usuários além da conta do responsável.
