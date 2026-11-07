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
| KI-009 | O ambiente do Claude não alcança o Supabase pela rede. Cadastro real confirmado em produção em 06/11/2026 (conta do responsável: e-mail confirmado, perfil, aceite dos termos e papel criados pelo trigger). Demais fluxos ainda sem teste ponta a ponta automatizado | Baixa | Parcial — testes E2E automatizados pendentes |
| KI-010 | Pacote JavaScript inicial com ~680 kB (198 kB comprimido) — acima do recomendado | Baixa | Aberto — dividir por rota (carregamento sob demanda) quando os painéis crescerem |
| KI-011 | A página inicial descreve o compartilhamento seletivo com compradores (Fase 4), que ainda não existe (registro de serviços por oficinas desde 0.13.0 e transferência desde 0.14.0 já existem). PRD 3.4 proíbe divulgar recursos indisponíveis. As perguntas frequentes e o painel da oficina já indicam "em breve" | Média | **Resolvido** em 07/11/2026 — compartilhamento seletivo existe desde 0.15.0; revisar textos de planos (Premium) na Fase 5 |
| KI-013 | A página pública `/p/:publicId` usa o `public_id` permanente da moto e não pode ser revogada pelo proprietário. Links e QR Codes revogáveis (`passport_shares`) estão previstos na Fase 4 | Média | **Resolvido** em 07/11/2026 — página básica desativável e links revogáveis (v0.15.0) |
| KI-012 | URLs de autenticação no Supabase (Site URL e Redirect URLs) | Alta | **Resolvido** em 06/11/2026 — configurado pelo responsável |
| KI-014 | PRD 15.1 exige MFA para administradores; ainda não exigido. Também não existe tela para conceder o papel admin (só via SQL interno, por design) | Média | Aberto — antes de usar o painel admin com dados reais |
| KI-015 | Canais de contato: WhatsApp de atendimento configurado em 06/11/2026; e-mail de atendimento (`support_email`) ainda vazio | Baixa | Parcial — falta definir o e-mail (P-9) |
| KI-016 | Anular um registro de manutenção não anula a leitura de km criada junto com ele; a leitura continua no histórico de quilometragem (pode ser corrigida lá) | Baixa | Aberto — avaliar ao implementar anexos/Fase 2 |
| KI-017 | Se o envio ao Storage der certo e o registro (`register_attachment`) falhar, o arquivo fica sem uso no Storage. Não aparece para ninguém e não conta na cota, mas ocupa espaço | Baixa | Parcial — desde 0.9.0 quem enviou pode apagar arquivo próprio sem registro (o app já faz isso ao remover fotos do diário); falta limpeza automática de órfãos de envios que falharam (Fase 6) |
| KI-018 | O servidor confia no tipo informado no envio (o bucket restringe a lista de tipos); a conferência dos primeiros bytes é feita só na interface | Baixa | Aberto — avaliar verificação no servidor (Edge Function) antes do lançamento |
| KI-019 | Depois de vender a moto, o antigo dono continua com acesso às próprias entradas do diário no banco (pode ler e excluir), mas a interface ainda não mostra motos anteriores | Baixa | **Resolvido** em 07/11/2026 — "Motos anteriores" no painel (v0.14.0) |
| KI-020 | Pedidos de acesso de oficina e transferências avisam só dentro do painel (o comprador precisa entrar com o e-mail informado). Falta a central de notificações e o aviso por e-mail (PRD 6.4 passo 5, PRD 12). A pesquisa por placa tem limite de tentativas e auditoria, mas ainda não tem CAPTCHA nem detecção de automação | Média | Aberto — central de notificações (Fase 5/6) e proteção extra antes do lançamento |
| KI-021 | Supabase Auth: proteção contra senhas vazadas (HaveIBeenPwned) desligada (aviso do Supabase) | Média | Aberto — ligar em Authentication → configurações de senha (ação do responsável) |
| KI-022 | Pelo link de compartilhamento, o comprador vê o tipo e a quantidade de comprovantes, mas não abre os arquivos: visitantes sem login não conseguem gerar o link temporário do Storage | Baixa | Aberto — Edge Function que assina URLs para links válidos (antes do lançamento) |
