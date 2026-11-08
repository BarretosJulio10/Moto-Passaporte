# Módulo Oficina (PRD 2.1)

Ferramenta de trabalho diário da oficina, integrada ao passaporte sem se confundir com ele. Decisão de base: ADR-043.

## Situação por fase

| Fase (PRD 2.1 §25) | Situação | Versão |
|---|---|---|
| 1 — Atendimento e orçamento | **concluída e testada**; validada pelo responsável | 0.44.0 |
| 2 — Ordem de serviço (OS, mecânico, checklist, fotos, peças usadas, comprovante) | **concluída e testada** — ver `SERVICE_ORDERS.md` | 0.45.0 |
| 3 — Histórico permanente (registro após conclusão, notificação, correções) | planejada — ver `WORKSHOP_HISTORY_INTEGRATION.md` | — |
| 4 — Gestão (agenda, peças, financeiro, funcionários, relatórios, lembretes) | planejada | — |
| 5 — Crescimento (perfil avançado, avaliações, agendamento público, WhatsApp oficial) | planejada | — |

## O que existe (Fase 1)

| Tela | Endereço | Quem |
|---|---|---|
| Visão geral (indicadores, pesquisa por placa, motos autorizadas) | `/oficina/:org` | membros |
| Orçamentos (lista e filtros) | `/oficina/:org/orcamentos` | membros |
| Novo orçamento (cliente → moto → editor) | `/oficina/:org/orcamentos/novo` | `manage_quotes` |
| Orçamento (editor do rascunho, documento, link, versões, histórico) | `/oficina/:org/orcamentos/:id` | membros (editar: `manage_quotes`) |
| Clientes, novo cliente, ficha do cliente | `/oficina/:org/clientes…` | membros (editar: `manage_quotes`) |
| Motos atendidas | `/oficina/:org/motos` | membros |
| Ordens de serviço, abrir sem orçamento, detalhe da OS | `/oficina/:org/os…` | membros (gestão: `manage_quotes`; execução: `execute_orders`; quem não gerencia vê só as designadas) |
| Ciência da entrada / comprovante da OS | `/os/:token` | qualquer pessoa com o link |
| Serviços e preços | `/oficina/:org/servicos` | membros (editar: `manage_prices`) |
| Página do cliente para aprovar | `/orcamento/:token` | qualquer pessoa com o link |

Código: `src/modules/workshop/` — `customers/`, `service-catalog/`, `quotes/`, `quote-approval/`, `team/`, `shared/` (abas, rpc, formatação).

## Tabelas (todas com `organization_id`, RLS e gravação só por funções)

`workshop_customers`, `workshop_vehicles` (PRD sugeria `workshop_customer_motorcycles`), `workshop_service_catalog`, `workshop_price_tables`, `workshop_service_prices`, `workshop_quotes`, `workshop_quote_versions`, `workshop_quote_items`, `workshop_quote_shares` (PRD: `workshop_document_shares`), `workshop_quote_approvals`, `workshop_quote_events`, `workshop_counters`; Fase 2: `workshop_service_orders`, `workshop_service_order_items`, `workshop_service_order_events`, `workshop_inspections`, `workshop_os_photos`, `workshop_os_shares` e o bucket privado `workshop-files`.

Reaproveitado (não duplicado): organizações, membros e convites, oficinas (perfil), motos e autorizações (`motorcycle_workshop_access`), notificações e push, limite de consultas anônimas, auditoria.

## Regras fixas

- Oficinas gratuitas, sem limite de clientes, orçamentos ou motos (§29).
- Orçamento criado, enviado ou aprovado **não** gera manutenção (§17.4).
- Cliente não precisa de conta para receber nem aprovar orçamento (§4.3, §7).
- Vínculo com passaporte só com autorização do titular; nunca automático por placa/telefone.

## Migração, testes e reversão

- Migração: `supabase/migrations/20261108184011_workshop_quotes.sql`; reversão: `supabase/rollback/20261108184011_workshop_quotes.down.sql` (apaga os dados do módulo: backup antes, só com aprovação).
- Testes: `tests/security/phase7a_workshop_quotes_test.sql` (64), `src/modules/workshop/quotes/quotes.test.tsx` (7).
- Pendências: KI-034 (fotos e logotipo), KI-035 (revisão jurídica do aceite), KI-036 (cliente que cria conta depois).
