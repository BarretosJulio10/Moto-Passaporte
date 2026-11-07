# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.8.0
**Data:** 06/11/2026
**Fase:** Fase 2 em andamento — linha do tempo, manutenção e anexos implementados
**Progresso geral:** 47,5% (19 de 40 itens do PRD — quadro em `PRD_CHECKLIST.md`)

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | https://moto-passaporte.vercel.app (Vercel, deploy automático da `main`) | Supabase `ripgenhykaajcnzdxoid` (MOTO_Passaporte, us-east-1, PG 17) | migrações até `attachments` aplicadas |
| Homologação | — | — | não configurado |
| Produção | — | — | não configurado |

## Andamento por fase

| Fase | Situação |
|---|---|
| 1 — Fundação SaaS e site | concluída (base) |
| 2 — Histórico e arquivos | linha do tempo, manutenção, quilometragem, anexos prontos; falta o diário (2.6) |
| 3 — Oficinas e autorizações | cadastro e perfil público de oficina prontos; resto planejado |
| 4 — Transferência e compartilhamento | imutabilidade do histórico pronta no banco; resto planejado |
| 5 — Monetização | planejado |
| 6 — Administração e lançamento | planejado |

## Próximos passos (em ordem)

Concluído em 0.8.0: anexos e comprovantes (Storage privado, cotas, nível de evidência).

1. Fase 2, item 2.6 — diário da moto (privado/compartilhável).
2. Fechar a Fase 2; depois, Fase 3 (pesquisa por placa, autorizações, Oficina de Origem, membros, registro pela oficina).
3. **Responsável pelo produto:** falta o e-mail de atendimento (KI-015).

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.
- Arquivos enviados sem registro (falha entre envio e registro) ficam no Storage sem uso — KI-017.

## Último backup confirmado

Não aplicável — banco sem dados de usuários além da conta do responsável.
