# PRD 2.4 — Planos: modelo cofre

**Decisões de 09/11/2026: 2 registros abertos, passe R$ 19,90, teste 3 meses, cofre por moto.**

**Status: implementado e ligado em produção em 09/11/2026 (v0.56.0, ADR-056). Pendente: revisão jurídica dos Termos 0.2 (KI-044). Passe de venda não criado (Premium mensal já é pago uma vez no Pix por R$ 9,90).**

Documento completo (fonte oficial): https://claude.ai/artifact/Y92XDzi8QNn62XbsNon1RU
Estudo que originou: https://claude.ai/artifact/CGRPGhxxsVo4V5thCHCPSN

## Regra central
- Gratuito: lista completa da linha do tempo; só os 2 registros mais recentes de cada moto com detalhes e comprovantes (`free_open_records`, padrão 2). O resto fica "no cofre": guardado, nunca apagado.
- Premium: benefício novo `full_history` abre tudo, além de PDF, lembretes e análise de gastos.
- "Exportar meus dados" sempre grátis, com todos os registros e comprovantes por pedido (LGPD art. 18 §5 e art. 19).
- Link do comprador no gratuito: só resumo (total de serviços, nº de oficinas, data e km do último). Links antigos (`legacy_full`) seguem completos até vencer.
- Teste de boas-vindas mantido em 3 meses (90 dias). Passe de venda: 30 dias, Pix, sem renovação, R$ 19,90.
- Cofre por moto.
- Bloqueio no banco (view `maintenance_timeline`, política `attachments_objects_select`, `get_shared_passport`), nunca só na tela. Interruptor `vault_enabled`.
- Contas existentes: aviso de 30 dias e aceite obrigatório dos novos Termos.

## Fases
- A: base (benefício, configurações, interruptor, exportação completa) — sem efeito visível.
- B: cofre no banco e nas telas, avisos e convites.
- C: Termos revisados por advogado, aviso às contas, passe de venda, ligar em produção.
