# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.13.0
**Data:** 07/11/2026
**Fase:** Fases 1, 2 e 3 concluídas. Próxima: Fase 4 (transferência e compartilhamento)
**Progresso geral:** 62,5% (25 de 40 itens do PRD — quadro em `PRD_CHECKLIST.md`)

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | https://moto-passaporte.vercel.app (Vercel, deploy automático da `main`) | Supabase `ripgenhykaajcnzdxoid` (MOTO_Passaporte, us-east-1, PG 17) | migrações até `workshop_services` aplicadas |
| Homologação | — | — | não configurado |
| Produção | — | — | não configurado |

## Andamento por fase

| Fase | Situação |
|---|---|
| 1 — Fundação SaaS e site | concluída (base) |
| 2 — Histórico e arquivos | concluída |
| 3 — Oficinas e autorizações | concluída: cadastro, perfil, pesquisa por placa, autorizações, Oficina de Origem, equipe e serviços da oficina |
| 4 — Transferência e compartilhamento | imutabilidade do histórico pronta no banco; resto planejado |
| 5 — Monetização | planejado |
| 6 — Administração e lançamento | planejado |

## Próximos passos (em ordem)

Concluído em 0.13.0: serviços registrados pela oficina (ADR-015). Fases 2 e 3 concluídas.

1. Fase 4, itens 4.1 a 4.3 — transferência do passaporte (pedido, aceite, encerramento de autorizações, motos anteriores).
2. Fase 4, itens 4.4 e 4.5 — compartilhamento controlado e revogável.
3. **Responsável pelo produto:** falta o e-mail de atendimento (KI-015).

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.
- Arquivos órfãos de envios que falharam — KI-017 (parcial).
- Pedidos de acesso avisados só no painel; sem CAPTCHA na pesquisa — KI-020.

## Último backup confirmado

Não aplicável — banco sem dados de usuários além da conta do responsável.
