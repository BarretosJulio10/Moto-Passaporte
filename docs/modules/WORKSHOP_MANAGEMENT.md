# Oficina — Fase 4: gestão (PRD 2.1 §11–§17)

Decisão: ADR-046. Migração `20261108194522_workshop_management.sql` (reversão em `supabase/rollback/`). Testes: `tests/security/phase7d_workshop_management_test.sql` (28 verificações) e `src/modules/workshop/management/management.test.tsx`.

## Telas

| Tela | Endereço | Quem |
|---|---|---|
| Agenda (dia, semana, mês; confirmar, chegou, abrir orçamento/OS, não veio, WhatsApp) | `/oficina/:org/agenda` | membros veem; "Clientes, agenda, orçamentos e OS" edita |
| Relacionamento (lembretes vencendo, orçamentos sem resposta, perdidos, clientes sumidos) | `/oficina/:org/relacionamento` | membros veem; atendente registra contato |
| Peças e produtos (catálogo, custo, venda, margem, compatibilidade) | `/oficina/:org/pecas` | membros veem (sem custo); "Serviços, peças e preços" edita |
| Financeiro (recebido por forma e por dia, a receber, recebimentos, CSV) | `/oficina/:org/financeiro` | só "Financeiro" (e responsável) |
| Relatórios (comercial, operacional, serviços, mecânicos, financeiro; imprimir/PDF e CSV) | `/oficina/:org/relatorios` | atendente ou financeiro; parte financeira só com "Financeiro" |
| Na OS: **Recebimentos** (registrar, estornar com motivo) e **Próxima manutenção** (lembrete) | `/oficina/:org/os/:id` | financeiro / atendente |
| Na ficha do cliente: lembretes, últimos contatos e pagamentos | `/oficina/:org/clientes/:id` | membros (pagamentos só com financeiro) |
| No orçamento: "Adicionar peça" do catálogo com preço de venda | editor do orçamento | atendente |
| Visão geral: agenda de hoje e quadro Financeiro | `/oficina/:org` | membros / financeiro |

## Regras

- **Recebimento**: por OS, valor > 0, data até hoje, forma (dinheiro, Pix, débito, crédito, transferência, outro). Soma não passa do total da OS (final, ou dos itens autorizados enquanto aberta). OS cancelada não recebe. Nunca é apagado nem editado: **estorno com motivo**. Não emite nota nem movimenta dinheiro.
- **A receber** = OS concluídas com valor final maior que o recebido.
- **Peça**: código interno único por oficina; custo só aparece para quem mexe em preços; `stock_qty` reservado (estoque fica para depois).
- **Agenda**: cliente cadastrado ou só nome + WhatsApp; status solicitado → confirmado → aguardando chegada → em atendimento → concluído / cancelado / não compareceu. Encerrado não é editado. `source = 'publico'` reservado para a Fase 5.
- **Lembrete**: por data e/ou km, aparece em Relacionamento 7 dias antes ou 300 km antes. Nada é enviado sozinho.
- **Contato**: o botão abre o WhatsApp com a mensagem pronta e grava em `workshop_contact_log` que a mensagem foi preparada (não prova envio). Registro imutável.
- **Permissão nova** `can_manage_finance` (padrão desligado). O responsável tem todas.
- Apagar conta de funcionário só zera o autor nos registros imutáveis (`wq_only_user_nulled`).

## Funções (RPC, `authenticated`)

| Função | Permissão |
|---|---|
| `workshop_save_part(org, id, dados)` / `workshop_list_parts(org, busca, inativas)` | preços / membro |
| `workshop_record_payment(org, os, centavos, forma, data?, obs?)` / `workshop_void_payment(org, pagamento, motivo)` | financeiro |
| `workshop_order_payments(org, os)` / `workshop_finance(org, de, até)` | financeiro |
| `workshop_save_appointment` / `workshop_set_appointment_status` / `workshop_list_appointments(org, de, até)` | atendente / atendente / membro |
| `workshop_save_reminder` / `workshop_set_reminder_status` / `workshop_log_contact` | atendente |
| `workshop_relationship(org, dias_inativo, dias_orçamento)` / `workshop_customer_contacts(org, cliente)` | membro |
| `workshop_reports(org, de, até)` | atendente ou financeiro |
| `set_org_member_extra_permissions(membro, orçamentos, preços, executar?, financeiro?)` | responsável |
