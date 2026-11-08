# Ordens de serviço (PRD 2.1 §8 e §9) — Fase 2, concluída (v0.45.0)

Decisão: ADR-044. Código: `src/modules/workshop/service-orders/`. Migração: `20261108191115_workshop_service_orders.sql`.

## Abertura
- **Do orçamento aprovado** (botão "Abrir ordem de serviço"): entram só as posições aprovadas no aceite, com o desconto distribuído por item. Uma OS por orçamento.
- **Sem orçamento** (`/oficina/:org/os/nova`): cliente, moto, km e serviços + **como e quem autorizou** (pessoalmente, telefone, WhatsApp, outro).
- **Item extra** numa OS: mesma exigência de autorização. Para valores maiores, a tela sugere o orçamento complementar (aprovação pelo link), que entra na OS por "Incluir itens aprovados".

## Situações
Aberta, aguardando diagnóstico, aguardando aprovação, aguardando peças, aguardando execução, em execução, pausada, aguardando serviço complementar (escolhidas pela equipe); concluída, aguardando retirada, entregue, cancelada (por ação própria). Cada mudança fica no histórico com autor e hora.

## Execução
Cada item: executado / não executado / pendente, quem executou e quando, fabricante e código da peça, observação. Observações técnicas da OS só para a equipe. Mecânico designado recebe aviso (sistema e celular).

## Checklists e fotos
- Entrada: carenagem, arranhões, amassados, retrovisores, manetes, pneus, rodas, faróis, lanternas, painel, acessórios (+ itens livres), combustível, chaves, km, observações. Saída: serviços conferidos, peças substituídas, teste de rodagem, freios, iluminação, estado visual, limpeza (+ livres), km, pendências.
- Estados: OK, Atenção, Avaria, Não se aplica (com observação).
- Ciência do cliente na entrada por link (`/os/:token`): nome + confirmação; depois disso a entrada trava.
- Fotos por etapa (entrada, serviço, saída), até 60 por OS, bucket privado.

## Conclusão, comprovante e entrega
- Exige todos os itens resolvidos, ao menos um executado e km final ≥ entrada. Valor final = executados + ajuste com motivo.
- Comprovante (impressão/PDF e link `/os/:token` de 30 dias): serviços executados, autorizados não executados, peças, origem da autorização, estado na entrada e saída, ciência, total, entrega. Não é nota fiscal.
- "Avisar que está pronta" gera o link do comprovante, manda pelo WhatsApp e muda para "aguardando retirada". "Registrar entrega" grava quem retirou.

## Ainda não (próximas fases)
- Registro automático no histórico da moto ao concluir (Fase 3, `WORKSHOP_HISTORY_INTEGRATION.md`).
- Recebimentos/financeiro, agenda, catálogo de peças com estoque (Fase 4).
- Modelos de checklist personalizados por oficina (hoje: itens padrão + itens livres por OS).
