# Integração com o histórico da moto (PRD 2.1 §17) — Fase 3, concluída (v0.46.0)

Decisão: ADR-045. Código: `src/modules/workshop/service-orders/HistoryCard.tsx`. Migração: `20261108192705_workshop_history_integration.sql`.

## Fluxo (§17.1)
1. Cliente tem passaporte e autoriza a oficina (pesquisa por placa → aprovação do titular).
2. A oficina vincula a moto do cliente ao passaporte (ficha do cliente → "Vincular passaporte"; só com autorização aprovada, nunca por placa igual).
3. Orçamento → aprovação → OS → execução.
4. Ao concluir, "Registrar no histórico" (já marcado): categoria sugerida, título e "mostrar valor" editáveis.
5. O sistema grava pelo fluxo de serviço da oficina e o titular recebe o aviso.
6. Fotos: no cartão "Histórico da moto", escolher as etapas e enviar.

## O que vai (§17.2)
Oficina e funcionário (autoria), data da conclusão, km final (vira leitura de km da oficina), categoria, título, descrição com os serviços executados e o nº da OS, peças executadas com fabricante e código, valor final (se marcado), observações e código do comprovante, fotos escolhidas. Classificação: "confirmado por prestador" (§17.3). A plataforma não certifica a qualidade do serviço.

## Regras (§17.4 e §17.5)
- Orçamento criado/enviado/aprovado e OS aberta não geram manutenção (testado).
- Itens não executados ou recusados nunca entram; executados aparecem item a item na descrição.
- Uma OS gera um registro. Correção: link "Corrigir registro" → registro novo com motivo; original preservado com autoria.
- Sem vínculo ao passaporte, sem autorização vigente ou sem permissão: o atendimento fica só na oficina; a OS mostra o motivo e permite registrar depois, se a situação mudar.

## Pendências
- Comprovante em PDF como anexo do registro (KI-037).
- Tela do proprietário para ver os próprios orçamentos e OS de oficinas (KI-036).
