# KNOWN_ISSUES — Moto Passaporte

Problemas conhecidos e sua situação.

| ID | Descrição | Severidade | Situação |
|---|---|---|---|
| KI-001 | Migrações testadas em PostgreSQL 16 com simulação do Supabase, **não** em um projeto Supabase real. Diferenças possíveis em papéis, extensões e privilégios padrão | Média | Aberto — rodar os testes após aplicar no Supabase |
| KI-002 | Chassi armazenado em tabela isolada com RLS, mas sem criptografia em coluna (D-T3) | Média | Aberto — decidir antes de produção |
| KI-003 | `get_public_passport` não tem rate limiting para anônimos (o `public_id` de 128 bits torna a enumeração inviável, mas não impede abuso de volume) | Baixa | Aberto — aplicar limite na borda (Edge Function/CDN) na Fase 4 |
| KI-004 | Pedidos de verificação de duplicidade (`motorcycle_claim_requests`) ainda não têm tela/função administrativa de resolução | Baixa | Planejado — Fase 6 |
| KI-005 | O cadastro com placa já ativa informa "verificação necessária", o que permite a um usuário autenticado inferir que a placa existe. Mitigado por rate limit (10/hora) e auditoria | Baixa | Aceito — inerente à regra de duplicidade por placa (ADR-007) |
