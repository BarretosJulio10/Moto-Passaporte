# KNOWN_ISSUES — Moto Passaporte

Problemas conhecidos e sua situação.

| ID | Descrição | Severidade | Situação |
|---|---|---|---|
| KI-001 | Migrações testadas só em PostgreSQL local com simulação do Supabase | Média | **Resolvido** em 06/11/2026 — aplicadas e testadas no Supabase dev (71 verificações) |
| KI-002 | Chassi armazenado em tabela isolada com RLS, mas sem criptografia em coluna (D-T3). O Supabase Vault já está disponível no projeto | Média | Aberto — decidir antes de produção |
| KI-003 | `get_public_passport` não tem rate limiting para anônimos (o `public_id` de 128 bits torna a enumeração inviável, mas não impede abuso de volume) | Baixa | Aberto — aplicar limite na borda (Edge Function/CDN) na Fase 4 |
| KI-004 | Pedidos de verificação de duplicidade (`motorcycle_claim_requests`) ainda não têm tela/função administrativa de resolução | Baixa | Planejado — Fase 6 |
| KI-005 | O cadastro com placa já ativa informa "verificação necessária", o que permite a um usuário autenticado inferir que a placa existe. Mitigado por rate limit (10/hora) e auditoria | Baixa | Aceito — inerente à regra de duplicidade por placa (ADR-007) |
| KI-006 | Supabase em us-east-1: latência maior para usuários no Brasil do que sa-east-1 | Baixa | Aceito (ADR-009) — reavaliar antes do lançamento |
| KI-008 | O ambiente de desenvolvimento da IA (Claude) não tem acesso de rede para instalar pacotes npm (React, Vite, supabase-js); interface escrita lá não pode ser executada nem testada | **Alta** (bloqueia a interface) | Aberto — aguardando liberação de rede e nova conversa (ADR-011) |
| KI-007 | Existe um único projeto Supabase (dev). Homologação e produção ainda não existem | Média | Aberto — criar antes de usuários reais (PRD 20) |
