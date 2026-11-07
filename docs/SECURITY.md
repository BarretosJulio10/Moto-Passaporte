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
| Tipos das Edge Functions | `scripts/validation/check_edge_functions.sh` | OK |

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
- Gravações auditadas sem os valores.

## Assinaturas e Webhook (ADR-020)

- Premium só com cobrança aprovada consultada na API do Mercado Pago; navegador e conteúdo do aviso nunca ativam nada.
- Webhook público valida a assinatura HMAC-SHA256 (`x-signature`, `x-request-id`) com a assinatura secreta do Vault, em comparação de tempo constante; aviso sem assinatura válida é registrado e recusado (401).
- Idempotência: cada cobrança concede período uma vez; aviso repetido já processado é ignorado; aviso que falhou é reprocessado.
- Funções `billing_*` só para `service_role`; tabelas de cobrança sem acesso direto e sem exclusão; nenhum dado de cartão é armazenado.
- `back_url` do checkout só aceita a origem HTTPS do próprio site (ou localhost) e a interface só redireciona para domínios do Mercado Pago.

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
