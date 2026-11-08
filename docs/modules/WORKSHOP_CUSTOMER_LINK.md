# Oficina — Fase 5.1: cliente com conta, avisos e logotipo (PRD 2.1 §4.3 e §23)

Decisão: ADR-048. Migração `20261108203558_workshop_customer_link.sql` (reversão em `supabase/rollback/`). Testes: `tests/security/phase7f_workshop_customer_link_test.sql` (20 verificações) e `src/modules/customer_link/customer_link.test.tsx`.

## Vínculo do cliente com a conta (§4.3)

- O cliente **não precisa de conta** para receber e aprovar orçamento (continua igual).
- A oficina pode **convidar** pela ficha do cliente: gera um link `/painel/vincular/convite/<token>` (256 bits, só o hash no banco, 30 dias, uso único, um ativo por cliente) e envia pelo WhatsApp da própria oficina.
- O cliente também pode guardar pelo **link do orçamento** (`/painel/vincular/orcamento/<token>`) ou da **OS/comprovante** (`/painel/vincular/os/<token>`): caixa "Acompanhe pelo Moto Passaporte" nas páginas públicas.
- O vínculo só acontece com **conta logada + link que a oficina enviou a ele + confirmação "Sou eu"**. Nunca por coincidência de placa, telefone ou e-mail. Cadastro já ligado a outra conta é recusado.
- Prévia mínima antes de confirmar: nome da oficina, primeiro nome do cadastro, motos e quantidade de atendimentos.
- Depois: **Meus atendimentos** (`/painel/atendimentos`) com OS (itens executados/não executados, km, comprovante), orçamentos, agendamentos e próximas manutenções; sem observações internas, custos ou dados de outros clientes. Atalho no painel quando há oficina ligada.
- Desfazer: o cliente, em Meus atendimentos; ou o responsável da oficina, na ficha do cliente.

## Avisos (§23)

| Aviso | Para quem | Quando |
|---|---|---|
| `workshop_update` (opcional) | cliente com conta ligada | orçamento enviado (e complementar), OS aberta, em execução, aguardando peças, concluída, pronta para retirada, entregue, cancelada; agendamento confirmado ou cancelado; lembrete de manutenção vencendo |
| `workshop_reminder_due` (opcional) | equipe de atendimento | lembrete com data em até 3 dias ou moto a 300 km da meta — rotina diária `moto-passaporte-workshop-reminders` (08:17 de Brasília), uma vez por lembrete |
| `appointment_canceled` (opcional) | responsável pelo agendamento | cancelado ou não compareceu, quando outra pessoa mudou |

Já existiam: orçamento visualizado/respondido/vencido, OS designada, pedido de agendamento pelo site, nova avaliação. Todos respeitam as preferências e não se repetem (`dedupe_key`).

## Logotipo nos documentos

O logotipo enviado no perfil passa a aparecer no orçamento e no comprovante (tela, PDF e link do cliente). `workshops.logo_url` guarda `storage:workshop-files/<caminho>` e o site gera um link temporário. Para quem não tem conta, o logo aparece enquanto o perfil da oficina é público.

## Funções (RPC)

| Função | Quem |
|---|---|
| `workshop_create_customer_invite(org, cliente)` | atendente |
| `get_customer_link_preview(tipo, token)` / `claim_workshop_customer(tipo, token)` | usuário logado com o link |
| `get_my_workshop_records()` / `unlink_my_workshop_customer(cliente)` | o próprio cliente |
| `workshop_unlink_customer(org, cliente)` | responsável |
