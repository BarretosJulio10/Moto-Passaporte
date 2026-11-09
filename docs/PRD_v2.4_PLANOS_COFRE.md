# PRD 2.4 — Planos: modelo cofre

**Status: rascunho de 09/11/2026 — aguardando validação do responsável e revisão jurídica. Não implementar sem pedido.**

Documento completo (fonte oficial): https://claude.ai/artifact/Y92XDzi8QNn62XbsNon1RU
Estudo que originou: https://claude.ai/artifact/CGRPGhxxsVo4V5thCHCPSN

## Regra central
- Gratuito: lista completa da linha do tempo; só os 3 registros mais recentes de cada moto com detalhes e comprovantes (`free_open_records`, padrão 3). O resto fica "no cofre": guardado, nunca apagado.
- Premium: benefício novo `full_history` abre tudo, além de PDF, lembretes e análise de gastos.
- "Exportar meus dados" sempre grátis, com todos os registros e comprovantes por pedido (LGPD art. 18 §5 e art. 19).
- Link do comprador no gratuito: só resumo (total de serviços, nº de oficinas, data e km do último). Links antigos (`legacy_full`) seguem completos até vencer.
- Teste de boas-vindas 90 → 30 dias (só contas novas). Passe de venda: 30 dias, Pix, sem renovação (R$ 19,90 sugerido).
- Bloqueio no banco (view `maintenance_timeline`, política `attachments_objects_select`, `get_shared_passport`), nunca só na tela. Interruptor `vault_enabled`.
- Contas existentes: aviso de 30 dias e aceite obrigatório dos novos Termos.

## Fases
- A: base (benefício, configurações, interruptor, exportação completa) — sem efeito visível.
- B: cofre no banco e nas telas, avisos e convites.
- C: Termos revisados por advogado, aviso às contas, passe de venda, teste de 30 dias, ligar em produção.
