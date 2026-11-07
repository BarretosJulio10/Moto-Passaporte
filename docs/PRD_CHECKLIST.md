# PRD_CHECKLIST — Moto Passaporte

Conferência item a item do PRD v2.0 (`docs/PRD.md`). **Atualizar a cada entrega.**
Estados (PRD 17.2): `planejado` · `em desenvolvimento` · `implementado` · `testado` · `homologado` · `publicado`.
"(banco)" = só a parte de banco de dados; interface ainda pendente.

**Última conferência:** 06/11/2026 — v0.3.1
**Item atual na ordem:** Fase 1 → interface (site público, autenticação, painéis base, QR Code)

---

## Fase 1 — Fundação SaaS e site (PRD 22)

| # | Item | Seção PRD | Estado | Evidência |
|---|---|---|---|---|
| 1.1 | Estrutura do projeto, Git e ambientes | 16, 18, 20 | `implementado` (só dev) | Repositório; Supabase dev. Homologação/produção: KI-007 |
| 1.2 | Memória técnica e documentação inicial | 17 | `implementado` | `docs/` |
| 1.3 | Banco inicial, RLS e auditoria | 14, 15 | `testado` (Supabase dev) | 6 migrações; 71 testes no Supabase, 73 local |
| 1.4 | Papéis, organizações e controle de acesso | 2.3, 15.2 | `testado` (banco) | `user_roles`, `organizations`, `organization_members` |
| 1.5 | Cadastro de motocicleta, ID permanente | 5.2, 9 | `testado` (banco) | `register_motorcycle` |
| 1.6 | QR Code | 9 | `em desenvolvimento` | `public_id` e `get_public_passport` prontos; geração do QR na interface pendente |
| 1.7 | Cadastro, login e recuperação de senha | 5.1, 15.1 | `em desenvolvimento` | Perfil/papel automáticos no cadastro prontos; telas e configuração do Auth pendentes |
| 1.8 | Identidade visual e site público | 3 | `planejado` | — |
| 1.9 | Painéis base: proprietário, oficina, admin | 5.3, 6.3, 7.1 | `planejado` | — |

## Fase 2 — Histórico e arquivos

| # | Item | Seção PRD | Estado |
|---|---|---|---|
| 2.1 | Linha do tempo | 5.4 | `planejado` |
| 2.2 | Registros de manutenção (`maintenance_records`, `maintenance_items`) | 5.4, 14.3 | `planejado` |
| 2.3 | Quilometragem | 5.6 | `testado` (banco) — antecipado na Fase 1 |
| 2.4 | Anexos e cotas (`attachments`, Storage privado) | 13 | `planejado` |
| 2.5 | Origem dos registros | 5.5 | `planejado` (enum `record_source` já existe) |
| 2.6 | Auditoria e diário básico (`motorcycle_diary`) | 5.7, 15.5 | auditoria `testado`; diário `planejado` |

## Fase 3 — Oficinas e autorizações

| # | Item | Seção PRD | Estado |
|---|---|---|---|
| 3.1 | Cadastro gratuito de oficina | 6.1 | `testado` (banco) — antecipado na Fase 1 |
| 3.2 | Perfil público da oficina | 6.1 | `testado` (banco) |
| 3.3 | Pesquisa protegida por placa | 6.4 | `planejado` |
| 3.4 | Solicitação, aprovação e revogação (`motorcycle_workshop_access`) | 6.4, 6.6 | `planejado` |
| 3.5 | Oficina de Origem | 6.5 | `planejado` |
| 3.6 | Membros da oficina e permissões | 6.2 | `planejado` (tabela existe; gestão pendente) |
| 3.7 | Registro de serviços pela oficina | 6.7 | `planejado` |

## Fase 4 — Transferência e compartilhamento

| # | Item | Seção PRD | Estado |
|---|---|---|---|
| 4.1 | Solicitação e aceite de transferência (`transfer_requests`) | 10 | `planejado` |
| 4.2 | Preservação do histórico | 10 | `testado` (banco) — triggers de imutabilidade |
| 4.3 | Encerramento de acessos anteriores | 10 | `planejado` |
| 4.4 | Página pública controlada (`passport_shares`) | 11 | `planejado` (campos padrão prontos — ADR-008) |
| 4.5 | Link e QR Code compartilhável e revogável | 11 | `planejado` |

## Fase 5 — Monetização e Mercado Pago

| # | Item | Seção PRD | Estado |
|---|---|---|---|
| 5.1 | Planos e preços configuráveis | 4, 7.4 | `planejado` (limite gratuito configurável já existe) |
| 5.2 | Integração Mercado Pago, assinaturas, Webhooks | 8 | `planejado` |
| 5.3 | Histórico de pagamentos e faturas | 8.6 | `planejado` |
| 5.4 | Cotas e benefícios Premium | 4.3, 13 | `planejado` |
| 5.5 | Atraso, cancelamento, reativação | 8.5 | `planejado` |

## Fase 6 — Administração, segurança e lançamento

| # | Item | Seção PRD | Estado |
|---|---|---|---|
| 6.1 | Dashboard e gestão administrativa | 7 | `planejado` |
| 6.2 | Resolução de pedidos de duplicidade | ADR-007 | `planejado` (KI-004) |
| 6.3 | Monitoramento de armazenamento | 7.6 | `planejado` |
| 6.4 | Testes de segurança, integração, regressão, E2E | 19 | segurança do banco Fase 1 `testado`; demais `planejado` |
| 6.5 | Backup, restauração e rollback testados | 18.4, 20 | `planejado` |
| 6.6 | Homologação e publicação | 22 | `planejado` |

## Pendências transversais

| Item | Referência |
|---|---|
| Quem constrói a interface | D-T1 |
| Criptografia do chassi | D-T3 / KI-002 |
| Ambientes de homologação e produção | KI-007 |
| Decisões de produto P-1 a P-11 (restantes) | `DECISIONS.md` |
