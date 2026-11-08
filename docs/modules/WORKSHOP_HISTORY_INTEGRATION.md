# Integração com o histórico da moto (PRD 2.1 §17) — Fase 3, planejada

Ainda não implementado.

Já valem hoje (Fase 1):
- Orçamento (criado, enviado ou aprovado) não gera manutenção — testado.
- Moto da oficina só se liga ao passaporte com autorização aprovada do titular (`workshop_link_vehicle_passport`).

Plano proposto:
- Ao concluir uma OS de moto vinculada e ainda autorizada, gerar o registro pelo fluxo existente (`create_workshop_service`, classificação "Confirmado por prestador"), só com os itens executados, peças, km, fotos e comprovante, e notificar o titular.
- Sem autorização vigente: o atendimento fica só no registro comercial da oficina.
- Correções por evento adicional, preservando original, autor e justificativa (já é a regra do histórico).
