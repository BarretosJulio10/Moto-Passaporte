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
| KI-007 | Existe um único projeto Supabase (dev). Homologação e produção ainda não existem | Média | Aberto — criar antes de usuários reais (PRD 20) |
| KI-008 | Ambiente do Claude sem acesso para instalar pacotes npm | Alta | **Resolvido** em 06/11/2026 — rede liberada para gerenciadores de pacotes |
| KI-009 | O ambiente do Claude só acessa gerenciadores de pacotes; não alcança `ripgenhykaajcnzdxoid.supabase.co`. Telas de autenticação foram testadas com Supabase simulado, não ponta a ponta | Média | Aberto — adicionar o domínio do projeto em "Domínios adicionais permitidos" ou testar no deploy da Vercel |
| KI-010 | Pacote JavaScript inicial com ~680 kB (198 kB comprimido) — acima do recomendado | Baixa | Aberto — dividir por rota (carregamento sob demanda) quando os painéis crescerem |
| KI-011 | A página inicial descreve funcionalidades das Fases 2–4 (registro de serviços por oficinas, compartilhamento seletivo, transferência) que ainda não existem. PRD 3.4 proíbe divulgar recursos indisponíveis. As perguntas frequentes e o painel da oficina já indicam "em breve" | Média | Aberto — revisar a página inicial antes de qualquer divulgação pública |
| KI-013 | A página pública `/p/:publicId` usa o `public_id` permanente da moto e não pode ser revogada pelo proprietário. Links e QR Codes revogáveis (`passport_shares`) estão previstos na Fase 4 | Média | Aberto — Fase 4. Enquanto isso, a página mostra apenas os campos padrão do ADR-008 |
| KI-012 | URLs de autenticação no Supabase (Site URL e Redirect URLs) | Alta | **Resolvido** em 06/11/2026 — configurado pelo responsável |
| KI-014 | PRD 15.1 exige MFA para administradores; ainda não exigido. Também não existe tela para conceder o papel admin (só via SQL interno, por design) | Média | Aberto — antes de usar o painel admin com dados reais |
| KI-015 | Canais de contato (`support_email`, `support_whatsapp`) estão vazios; a página de contato mostra "em definição" | Baixa | Aberto — aguardando o responsável definir os canais (P-9) |
