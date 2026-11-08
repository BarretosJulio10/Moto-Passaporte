# Ordens de serviço (PRD 2.1 §8 e §9) — Fase 2, planejada

Ainda não implementado. Aguardando validação da Fase 1 (PRD 2.1 §28.3).

Plano proposto:
- `workshop_service_orders`, `workshop_service_order_items`, `workshop_service_order_events`, `workshop_service_assignments`; numeração já preparada em `workshop_counters` (`service_order`).
- OS gerada a partir do orçamento aprovado só com os **itens aprovados** (posições do aceite); itens recusados não entram nem podem ser marcados como executados. Complementar aprovado acrescenta itens.
- Abertura manual com registro da autorização aplicável.
- Status e responsável por mudança; mecânico designado; checklist de entrada e saída com fotos (bucket privado, URLs curtas); peças usadas; km final; comprovante de conclusão.
- Papel "Mecânico" (vê só as OS atribuídas).
