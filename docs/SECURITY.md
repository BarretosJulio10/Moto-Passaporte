# SECURITY — Moto Passaporte

## Princípios aplicados

- **Defesa no banco:** RLS ativa em todas as tabelas; privilégios padrão do Supabase revogados e concedidos tabela a tabela, inclusive por coluna.
- **Escritas estruturais só por funções controladas** (`security definer`, `search_path` vazio): cadastro de moto, troca de placa, km, criação de oficina. O frontend não insere titularidade, placa ou papel diretamente.
- **Imutabilidade por trigger:** auditoria, histórico de placas, titularidade, km e identidade da moto são protegidos por triggers que valem até para o dono do banco.
- **Mínimo privilégio do administrador:** admin lê auditoria, configurações, perfis básicos e dados básicos das motos; **não** lê chassi nem placas por padrão (PRD 2.2.5).
- **IDs públicos não previsíveis:** `public_id` com 128 bits aleatórios; o id interno não funciona como link público.

## Papéis

| Papel | Como é obtido |
|---|---|
| `owner` | Automático no cadastro |
| `workshop` | Ao criar uma oficina (`create_workshop`) |
| `admin` | Somente inserção interna em `user_roles` via SQL/service role. Nunca pelo app |

## Matriz de acesso — Fase 1

| Recurso | Anônimo | Titular atual | Outro usuário | Membro da oficina | Admin |
|---|---|---|---|---|---|
| Passaporte público (`get_public_passport`) | campos padrão | campos padrão | campos padrão | campos padrão | campos padrão |
| `motorcycles` | — | lê / edita dados básicos | — | — (Fase 3) | lê |
| `motorcycle_plates` | — | lê | — | — | — |
| `motorcycle_private` (chassi) | — | lê / edita | — | — | — |
| `mileage_records` | — | lê / insere via função | — | — | — |
| `profiles` | — | próprio | próprio | próprio | lê |
| `workshops` (perfil público) | lê | lê | lê | lê / responsável edita | lê |
| `organizations`, `organization_members` | — | — | — | lê a própria | lê |
| `audit_logs` | — | — | — | — | lê |

## Testes de segurança

| Ambiente | Script | Resultado (06/11/2026) |
|---|---|---|
| PostgreSQL 16 local + simulação | `tests/security/phase1_rls_test.sql` | 73 aprovadas |
| Supabase real (dev, PG 17), em transação desfeita | `tests/security/supabase/phase1_rls_test_rollback.sql` | 71 aprovadas, antes e depois do reforço |
| PostgreSQL 16 local — Fase 2 (manutenção) | `tests/security/phase2a_maintenance_test.sql` | 29 aprovadas |
| Supabase real — Fase 2, em transação desfeita | `tests/security/supabase/phase2a_maintenance_rollback.sql` | 26 aprovadas |
| PostgreSQL 16 local — Fase 2 (anexos e Storage simulado) | `tests/security/phase2b_attachments_test.sql` | 22 aprovadas |
| Supabase real — anexos, em transação desfeita | `tests/security/supabase/phase2b_attachments_rollback.sql` | 21 aprovadas |
| PostgreSQL 16 local — diário, com venda simulada | `tests/security/phase2c_diary_test.sql` | 44 aprovadas |
| Supabase real — diário, em transação desfeita | `tests/security/supabase/phase2c_diary_rollback.sql` | 27 aprovadas |
| PostgreSQL 16 local — pesquisa por placa e autorizações | `tests/security/phase3a_workshop_access_test.sql` | 46 aprovadas |
| Supabase real — pesquisa por placa e autorizações, em transação desfeita | `tests/security/supabase/phase3a_workshop_access_rollback.sql` | 22 aprovadas |
| PostgreSQL 16 local — Oficina de Origem | `tests/security/phase3b_origin_test.sql` | 20 aprovadas |
| Supabase real — Oficina de Origem, em transação desfeita | `tests/security/supabase/phase3b_origin_rollback.sql` | 13 aprovadas |
| PostgreSQL 16 local — equipe da oficina | `tests/security/phase3c_team_test.sql` | 44 aprovadas |
| Supabase real — equipe da oficina, em transação desfeita | `tests/security/supabase/phase3c_team_rollback.sql` | 19 aprovadas |
| PostgreSQL 16 local — serviços da oficina | `tests/security/phase3d_workshop_services_test.sql` | 32 aprovadas |
| Supabase real — serviços da oficina, em transação desfeita | `tests/security/supabase/phase3d_workshop_services_rollback.sql` | 15 aprovadas |
| PostgreSQL 16 local — transferência | `tests/security/phase4a_transfer_test.sql` | 42 aprovadas |
| Supabase real — transferência, em transação desfeita | `tests/security/supabase/phase4a_transfer_rollback.sql` | 19 aprovadas |
| PostgreSQL 16 local — compartilhamento | `tests/security/phase4b_shares_test.sql` | 36 aprovadas |
| Supabase real — compartilhamento, em transação desfeita | `tests/security/supabase/phase4b_shares_rollback.sql` | 17 aprovadas |
| PostgreSQL 16 local — planos | `tests/security/phase5a_plans_test.sql` | 35 aprovadas |
| Supabase real — planos, em transação desfeita | `tests/security/supabase/phase5a_plans_rollback.sql` | 19 aprovadas |
| PostgreSQL 16 local — credenciais do Mercado Pago | `tests/security/phase5b_payment_settings_test.sql` | 29 aprovadas |
| Supabase real — credenciais do Mercado Pago, em transação desfeita | `tests/security/supabase/phase5b_payment_settings_rollback.sql` | 18 aprovadas |
| PostgreSQL 16 local — assinaturas e pagamentos | `tests/security/phase5c_subscriptions_test.sql` | 52 aprovadas |
| Supabase real — assinaturas e pagamentos, em transação desfeita | `tests/security/supabase/phase5c_subscriptions_rollback.sql` | 17 aprovadas |
| PostgreSQL 16 local — benefícios Premium | `tests/security/phase5d_premium_test.sql` | 48 aprovadas |
| Supabase real — benefícios Premium, em transação desfeita | `tests/security/supabase/phase5d_premium_rollback.sql` | 13 aprovadas |
| PostgreSQL 16 local — faturas | `tests/security/phase5e_invoices_test.sql` | 20 aprovadas |
| Supabase real — faturas, em transação desfeita | `tests/security/supabase/phase5e_invoices_rollback.sql` | 11 aprovadas |
| PostgreSQL 16 local — administração | `tests/security/phase6a_admin_test.sql` | 27 aprovadas |
| Supabase real — administração, em transação desfeita | `tests/security/supabase/phase6a_admin_rollback.sql` | 11 aprovadas |
| PostgreSQL 16 local — auditoria e configurações | `tests/security/phase6b_audit_settings_test.sql` | 26 aprovadas |
| Supabase real — auditoria e configurações, em transação desfeita | `tests/security/supabase/phase6b_audit_settings_rollback.sql` | 9 aprovadas |
| PostgreSQL 16 local — verificação de placa | `tests/security/phase6c_claims_test.sql` | 23 aprovadas |
| Supabase real — verificação de placa, em transação desfeita | `tests/security/supabase/phase6c_claims_rollback.sql` | 10 aprovadas |
| PostgreSQL 16 local — armazenamento | `tests/security/phase6d_storage_test.sql` | 22 aprovadas |
| Supabase real — armazenamento, em transação desfeita | `tests/security/supabase/phase6d_storage_rollback.sql` | 10 aprovadas |
| Tipos das Edge Functions | `scripts/validation/check_edge_functions.sh` | OK |
| PostgreSQL 16 local — varredura de segurança por catálogo (e detecção de 10 brechas plantadas) | `tests/security/phase6e_security_sweep_test.sql` | 12 aprovadas |
| Supabase real — varredura de segurança | `tests/security/supabase/phase6e_security_sweep.sql` | 0 violações |
| Ponta a ponta no navegador (Supabase simulado) | `scripts/validation/run_e2e.sh` | 9 cenários, 41 verificações |
| Backup criptografado, restauração e rollback (banco de teste) | `scripts/ops/restore_check.sh` | 13 aprovadas |
| PostgreSQL 16 local — rotinas automáticas | `tests/security/phase6f_jobs_test.sql` | 17 aprovadas |
| PostgreSQL 16 local — MFA de administradores | `tests/security/phase6g_admin_mfa_test.sql` | 15 aprovadas |
| PostgreSQL 16 local — central de notificações | `tests/security/phase6h_notifications_test.sql` | 36 aprovadas |
| Supabase real — central de notificações (transferência real), em transação desfeita | `tests/security/supabase/phase6h_notifications_rollback.sql` | 9 aprovadas |
| Supabase real — chassi cifrado, em transação desfeita | `tests/security/supabase/phase6i_chassis_rollback.sql` | 9 aprovadas |
| PostgreSQL 16 local — conferência de conteúdo dos arquivos | `tests/security/phase6j_attachment_checks_test.sql` | 9 aprovadas |
| Supabase real — conferência de conteúdo, em transação desfeita | `tests/security/supabase/phase6j_attachment_checks_rollback.sql` | 8 aprovadas |
| PostgreSQL 16 local — comprovantes pelo link | `tests/security/phase6k_shared_files_test.sql` | 14 aprovadas |
| Supabase real — comprovantes pelo link, em transação desfeita | `tests/security/supabase/phase6k_shared_files_rollback.sql` | 7 aprovadas |
| PostgreSQL 16 local — limite de consultas anônimas | `tests/security/phase6l_rate_limit_test.sql` | 12 aprovadas |
| Supabase real — limite de consultas anônimas, em transação desfeita | `tests/security/supabase/phase6l_rate_limit_rollback.sql` | 6 aprovadas |
| Supabase real — MFA de administradores, em transação desfeita | `tests/security/supabase/phase6g_admin_mfa_rollback.sql` | 8 aprovadas |

Cobertura: isolamento entre proprietários, anônimos, oficinas e admin; escalada para admin; imutabilidade; não revelação em duplicidade de placa; preservação da história na exclusão de conta.

## Anexos (Fase 2)

- Bucket privado; nenhum arquivo é público. Visualização só por link assinado de 10 minutos, gerado para o titular atual.
- Envio limitado à pasta da moto do titular; nome do arquivo aleatório (UUID), sem dados pessoais no caminho.
- Tipo e tamanho registrados a partir dos metadados do Storage; o bucket restringe tipos e tamanho. A interface confere o tipo real pelos primeiros bytes antes de enviar; o servidor ainda não faz essa conferência (KI-018).
- Arquivos não podem ser trocados nem apagados pela API (prova documental). Exclusão por LGPD será tratada na Fase 6.
- Após transferência, o novo titular passa a ver os anexos; o anterior perde o acesso (regra `is_current_owner`).

## Diário (Fase 2, ADR-013)

- Entrada privada: só o autor, para sempre. Novo dono não vê entradas nem fotos privadas do anterior (testado com venda simulada).
- Entrada compartilhável: titular atual vê, sem receber o identificador do autor.
- Fotos herdam a visibilidade da entrada, inclusive no Storage.
- Auditoria registra só categoria, data e visibilidade.
- No Supabase real, arquivos só são apagados pela API do Storage; a política de exclusão (arquivo próprio e sem registro) foi testada no banco local.

## Pesquisa por placa e autorizações (Fase 3)

- Só membro ativo de oficina ativa pesquisa. Antes da autorização a resposta traz apenas marca, modelo e ano; nunca dono, placas antigas, chassi, quilometragem, `public_id` ou id interno.
- O pedido é feito pela placa, sem expor o id da moto.
- Limites (configuráveis em `system_settings`): 30 pesquisas/hora por usuário, 100 por oficina, 20 pedidos/dia por oficina, 7 dias de espera após recusa. Pesquisas registradas com hash sha256, sem a placa em texto.
- Revogação e suspensão da oficina cortam o acesso na hora (todas as funções conferem a situação atual).
- Autorizações não podem ser apagadas nem ter dados alterados; mudanças de situação seguem transições fixas e são auditadas.
- Ainda sem CAPTCHA ou detecção de automação além do limite (KI-020).
- Oficina de Origem: só o titular concede ou tira o título; a oficina não se autodeclara; uma por moto (índice único); fora do prazo é recusado no banco.

## Equipe da oficina (Fase 3, PRD 6.2)

- Convite: token aleatório de 192 bits, devolvido uma única vez; o banco guarda só o sha256. Vale 7 dias, uma vez, e só para a conta com o e-mail convidado. A prévia mostra o e-mail mascarado.
- Só o responsável convida, altera e remove; ninguém altera o próprio papel ou permissões; a oficina sempre mantém pelo menos um responsável (trigger).
- Funcionário sem a permissão `can_request_access` não pesquisa placas nem pede acesso (verificado no banco).
- E-mails da equipe visíveis só ao responsável. Convites e mudanças na equipe são auditados.

## Serviços da oficina (Fase 3, ADR-015)

- Só membro com permissão de oficina com autorização ativa registra; verificado a cada chamada.
- A oficina não lê as tabelas de histórico diretamente; vê pela função `get_workshop_timeline`, que oculta valor, observações, comprovantes e funcionário dos registros de terceiros.
- Arquivos: a oficina envia para a pasta da moto autorizada e lê só os próprios comprovantes; comprovantes do titular continuam invisíveis para ela.
- Revogação corta o acesso ao histórico e aos arquivos imediatamente; registros da oficina permanecem (imutáveis).

## Transferência (Fase 4, ADR-016)

- Só o titular atual pede; só a conta com o e-mail informado vê, aceita ou recusa. O aceite confere de novo que quem pediu continua titular.
- Antes do aceite, o comprador vê apenas identificação, placa atual, última km e a quantidade de registros; o histórico só depois.
- O aceite é atômico: troca a titularidade e encerra todas as autorizações de oficina na mesma transação; o antigo titular perde acesso imediato ao histórico e aos arquivos (regras de titular atual).
- Pedidos não são apagados nem reabertos; auditados.

## Compartilhamento (Fase 4, ADR-017)

- Código de 192 bits; a função pública devolve NULL para qualquer falha (inválido, revogado, vencido, antigo dono), sem diferenciar o motivo.
- Lista branca de campos: nunca dados pessoais, contatos, chassi, observações, nomes de funcionários, ids internos ou diário privado; valores e comprovantes só se o titular escolher.
- Arquivos não são expostos a visitantes (KI-022). Sem limite de requisições na borda ainda (KI-003).
- Página fora dos buscadores (`noindex`). Criação e revogação auditadas.

## Planos (Fase 5.1, ADR-018)

- Tabelas sem acesso direto; leitura pública só pela lista de planos ativos e visíveis, sem campos internos.
- Gestão só para administradores (`is_admin`), com histórico imutável e auditoria de cada mudança.
- Funções internas de limite (`user_plan`, `user_max_motorcycles`, `user_storage_quota_mb`) não são chamáveis por usuários.

## Credenciais de pagamento (ADR-019)

- Token de acesso e assinatura do Webhook ficam criptografados no Supabase Vault (teste confirma que o valor gravado não é o texto puro).
- Nenhuma função devolve os segredos ao navegador, nem ao administrador; só os 4 últimos caracteres.
- Leitura dos segredos apenas por `service_role` (Edge Functions). A Edge Function `mercadopago-check` exige login de administrador e não registra o token em logs.
- Limpeza de armazenamento (ADR-026): a Edge Function `storage-cleanup` só apaga caminhos que o banco planejou com o token do admin (sem registro e fora da retenção). Arquivos ligados a registros nunca entram no plano; `storage_cleanups` e `storage_cleanup_finish` são fechados para o navegador.
- Gravações auditadas sem os valores.

## Assinaturas e Webhook (ADR-020)

- Premium só com cobrança aprovada consultada na API do Mercado Pago; navegador e conteúdo do aviso nunca ativam nada.
- Webhook público valida a assinatura HMAC-SHA256 (`x-signature`, `x-request-id`) com a assinatura secreta do Vault, em comparação de tempo constante; aviso sem assinatura válida é registrado e recusado (401).
- Idempotência: cada cobrança concede período uma vez; aviso repetido já processado é ignorado; aviso que falhou é reprocessado.
- Funções `billing_*` só para `service_role`; tabelas de cobrança sem acesso direto e sem exclusão; nenhum dado de cartão é armazenado.
- `back_url` do checkout só aceita a origem HTTPS do próprio site (ou localhost) e a interface só redireciona para domínios do Mercado Pago.

## Administração (ADR-023)

- Ações e consultas a dados privados exigem motivo e ficam na auditoria com autor.
- Usuário comum não altera a própria situação (sem permissão de coluna) nem chama funções de admin.
- Suspensão bloqueia o login no Supabase Auth; sessão aberta expira com o token (até 1 hora).
- `system_settings` sem escrita direta para ninguém além do servidor; alterações por catálogo validado (ADR-024).
- Conteúdo de eventos de auditoria só com motivo, e a consulta também é auditada.

## Advisors do Supabase (06/11/2026, após o reforço)

**Performance:** sem alertas WARN. Restam apenas avisos INFO de "índice não utilizado" (normal num banco sem uso).

**Segurança:** restam apenas alertas WARN de "função SECURITY DEFINER executável", todos **intencionais**:
- Operações do app chamadas via RPC: `register_motorcycle`, `change_motorcycle_plate`, `record_mileage`, `create_workshop`, `get_public_passport` (anônimo, por design). Cada uma valida `auth.uid()` e titularidade internamente.
- Verificações usadas nas políticas RLS: `has_role`, `is_admin`, `is_current_owner`, `is_org_member`, `is_org_responsible`, `is_org_active`. Só revelam informação sobre o próprio usuário ou o status de uma organização.
- `rls_auto_enable`: função do próprio Supabase (event trigger `ensure_rls`), não chamável via API. Não alterar.

As funções de trigger internas tiveram o EXECUTE revogado (migração `phase1_hardening`).

## Pendências de segurança

Ver `KNOWN_ISSUES.md`.

## Segredos

- `.env` real nunca é versionado (`.gitignore`); modelo em `.env.example`.
- Service role key e Access Token do Mercado Pago apenas como secrets das Edge Functions.
- `system_settings` não armazena segredos.

## Backup (Fase 6.5, ADR-028)

- Backups criptografados com chave pública (age); a chave privada fica só com o responsável. O GitHub Actions guarda só a chave pública e os segredos de leitura (`SUPABASE_DB_URL`, service role), nunca registrados em log.
- Segredos do Vault (Mercado Pago) não entram no backup.
- Restauração com gatilhos desligados apenas durante a carga; depois, varredura de segurança obrigatória.
- Rollback de migração nunca reabre falha corrigida (testado: escrita direta em `system_settings` continua fechada).
- Repositório público: ver KI-031.

## Verificação em duas etapas dos administradores (ADR-030)

- `is_admin()` = papel admin **e** sessão `aal2`. Testado: sem a segunda etapa, indicadores, usuários, configurações, limpeza e auditoria ficam bloqueados (local 15, Supabase real 8).
- Celular perdido: remover o fator em Supabase → Authentication → Users. Nunca desligar a regra para contornar.

## Chassi cifrado (ADR-032)

- `motorcycle_private.chassis_enc` (pgp_sym_encrypt, AES-256); chave `chassis_key` no Vault, lida só por funções internas. `chassis` sempre vazio (regra no banco).
- Só o titular atual lê/altera (`get_my_chassis`/`set_my_chassis`); admin não lê. Testado local e no Supabase real (inclusive após transferência).

## Notificações (ADR-031)

- Geradas só no banco (gatilhos e rotina diária); `notify()` fechada para o navegador. Cada pessoa lê só os próprios avisos; a tabela não tem acesso direto. Links só internos (começam com `/`). Testado local (36) e no Supabase real (9).
- Aviso de possível venda ao titular não traz nome nem contato do solicitante.

## Rotinas automáticas (ADR-029)

- `scheduled-jobs` não usa login: aceita só chamadas com o segredo de 64 caracteres gerado no banco (Vault), conferido no banco (`scheduled_job_secret_ok`, service_role). Testado no Supabase real: segredo errado → 401.
- `job_runs` fechada para o navegador; o admin vê só o resumo (`admin_job_status`). Detalhes não contêm dados pessoais nem segredos.
- A varredura de segurança trata `job_run_*`, `scheduled_job_secret_ok` e `system_plan_storage_cleanup` como funções de servidor.

## Módulo Oficina — orçamentos (PRD 2.1 §20, ADR-043)

- **Isolamento entre oficinas**: 12 tabelas `workshop_*` com RLS; leitura só para membros ativos da própria oficina (`has_org_permission(org, 'member')`), nenhuma gravação direta (todas as escritas por funções `SECURITY DEFINER` com `search_path` vazio, que conferem a oficina pela sessão). Chaves compostas `(organization_id, id)` impedem cliente, moto, serviço, tabela ou versão de outra oficina num registro; gatilho bloqueia troca de `organization_id`.
- **Permissões**: `manage_quotes` (clientes, motos, orçamentos) e `manage_prices` (catálogo e preços); ninguém altera as próprias permissões.
- **Link de aprovação**: token de 256 bits, só o hash SHA-256 guardado, validade até o fim do dia da validade, revogação manual, um link ativo por orçamento, decisão única, versões antigas invalidadas. Funções anônimas: só `get_quote_by_token` e `decide_quote_by_token`, com limite por conexão (ADR-035). A página não mostra CPF, observações internas nem ids.
- **Imutabilidade**: versões enviadas, itens enviados, aceites e eventos não podem ser alterados nem apagados (gatilhos).
- **Proprietário** não acessa dados comerciais da oficina; o registro no histórico continua sendo só o fluxo existente de serviço autorizado.
- **Dados pessoais** (LGPD): CPF opcional, visível só para a equipe da oficina (mascarado na tela); IP e navegador do aceite guardados como evidência e não exibidos na tela da oficina.
- Testes: `tests/security/phase7a_workshop_quotes_test.sql` (duas oficinas, funcionário, titular, anônimo, link vencido/revogado/substituído).

### Ordens de serviço (ADR-044)
- 6 tabelas com a mesma regra (leitura por membro, gravação só por funções). Item da OS só existe com autorização (aceite do orçamento ou forma + autor registrados) — restrição no banco; origem e valor imutáveis; itens não são apagados; tudo trava na conclusão.
- Fotos: bucket privado `workshop-files`; envio só na pasta da própria oficina e por quem executa serviços; leitura por membros com link de 10 min; tipo e conteúdo conferidos (ADR-033) antes do registro.
- Links do cliente (ciência e comprovante): token de 256 bits com hash, 30 dias, revogação, limite por conexão; não expõem ids, IP, valores (no link de ciência) nem observações técnicas.
- Teste: `tests/security/phase7b_workshop_orders_test.sql`.

### Histórico a partir da OS (ADR-045)
- O registro no passaporte usa só `create_workshop_service` (exige autorização vigente do titular e a permissão "Registrar serviços"); não há escrita paralela no histórico.
- Uma OS gera um registro; OS concluída travada por gatilho; revogação bloqueia novos registros sem apagar os anteriores.
- Fotos copiadas pelo fluxo de anexos da oficina (conferência de conteúdo e cota). Teste: `tests/security/phase7c_workshop_history_test.sql`.

### Cliente com conta (ADR-048)
- Vínculo só com conta logada + token de link que a oficina enviou (convite: 256 bits, hash, 30 dias, uso único; ou link do orçamento/OS) + confirmação. Sem ligação por placa, telefone ou e-mail. Cadastro já ligado é recusado para outra conta.
- `get_my_workshop_records` filtra por `user_id = auth.uid()` e não devolve observações internas, custos nem dados de outros clientes. Teste: `tests/security/phase7f_workshop_customer_link_test.sql`.

### Crescimento comercial (ADR-047)
- Funções públicas novas (`get_public_workshop`, `get_public_booking_slots`, `request_public_appointment`, `submit_workshop_review`) com limite por conexão (`public_workshop_views_per_hour` = 300, `public_booking_requests_per_hour` = 10) e devolvendo só campos comerciais.
- Leitura sem conta no Storage só para arquivos de `workshop_public_photos` de oficina pública e ativa (`is_public_workshop_file`); fotos de OS seguem privadas.
- Avaliação exige o token do comprovante de OS concluída; imutável; ocultar só por admin com motivo (`write_audit`). Campanhas respeitam o pedido de não receber no banco. Teste: `tests/security/phase7e_workshop_growth_test.sql`.

### Gestão da oficina (ADR-046)
- 5 tabelas novas (`workshop_parts_catalog`, `workshop_payments`, `workshop_appointments`, `workshop_reminders`, `workshop_contact_log`) com RLS; gravação só por funções. `workshop_payments` só é lida com a permissão `manage_finance`; custo de peça só sai para `manage_prices`.
- Recebimentos e contatos não são apagados (gatilho); recebimento só muda para estorno com motivo. Excluir conta só zera o autor (`wq_only_user_nulled`).
- Nenhuma função nova executável por `anon` (conferido em produção). Teste: `tests/security/phase7d_workshop_management_test.sql`.

## Controle de Gastos (ADR-050)
- RPCs `get_spending_summary`/`get_spending_snapshot` executáveis só por `authenticated`; leem apenas posses ativas do próprio usuário (`auth.uid()`). `sp_records` e `sp_ownership_start` sem acesso externo (lista `service_only` da varredura).
- O corte "desde a compra" impede ver valores de serviços de dono anterior por padrão; o histórico visível segue as mesmas regras da linha do tempo.
- O benefício Premium é verificado no banco: o gratuito não recebe os dados da análise, não só deixa de vê-los.
- Fase B (ADR-051): `owner_expenses` com RLS só de leitura do próprio usuário e sem escrita direta (só pelas funções). Bucket `expense-receipts` privado; políticas de envio, leitura e exclusão limitadas à pasta `auth.uid()`. Comprovante conferido no banco (dono do arquivo, pasta, tipo, tamanho, cota). Auditoria sem descrição. Despesas não aparecem para oficina, comprador nem links públicos.
