# DATABASE — Moto Passaporte

**Situação:** migrações das Fases 1 e 2 (manutenção) **aplicadas** no Supabase de desenvolvimento (`ripgenhykaajcnzdxoid`, PostgreSQL 17) em 06/11/2026 e `testado` lá (71 verificações) e localmente (73 verificações).

Migrações em `supabase/migrations/`, aplicadas em ordem (prefixo = versão no Supabase, ADR-010):

| Arquivo | Conteúdo |
|---|---|
| `20261107003043_base.sql` | pgcrypto, utilitários (placa), auditoria imutável, triggers genéricos |
| `20261107003102_identity.sql` | `profiles`, `user_roles`, criação automática no cadastro, `has_role`/`is_admin`, `system_settings` |
| `20261107003124_organizations.sql` | `organizations`, `organization_members`, `workshops`, `create_workshop` |
| `20261107003222_motorcycles.sql` | `motorcycles`, `motorcycle_plates`, `motorcycle_ownerships`, `motorcycle_private`, `mileage_records`, `motorcycle_claim_requests`, operações e view `my_motorcycles` |
| `20261107003227_public_passport.sql` | `get_public_passport` (campos públicos padrão — ADR-008) |
| `20261107003512_phase1_hardening.sql` | Reforço pelos advisors: bloqueia RPC de funções de trigger, otimiza RLS com `(select auth.uid())`, índices de FKs |
| `20261107013442_contact_settings.sql` | Configurações públicas `support_email` e `support_whatsapp` (vazias até o responsável definir) |
| `20261107014505_maintenance.sql` | Fase 2: `maintenance_records`, `maintenance_items`, categorias, `create_maintenance_record`, `void_maintenance_record`, view `maintenance_timeline` |
| `20261107101141_workshop_access.sql` | Fase 3: `plate_search_log`, `motorcycle_workshop_access`, pesquisa por placa, pedido, decisão, revogação e leituras por papel |
| `20261107101234_workshop_access_indexes.sql` | Índices de `decided_by` e `ended_by` |
| `20261107194520_premium_benefits.sql` | Benefícios Premium (ADR-021): recursos e links por plano, lembretes, relatórios |
| `20261107153512_subscriptions.sql` | Assinaturas (ADR-020): `subscriptions`, `payments`, `payment_events`, funções `billing_*` do servidor, leitura do usuário e do admin, `user_plan` pela assinatura vigente |
| `20261107151926_payment_settings.sql` | Mercado Pago (ADR-019): `payment_gateway_settings`, segredos no Vault, funções do admin e do servidor |
| `20261107130815_subscription_plans.sql` | Planos (ADR-018): `subscription_plans`, `subscription_plan_versions`, leitura pública, gestão pelo admin, limites pelo plano vigente |
| `20261107110633_passport_shares.sql` | Compartilhamento (ADR-017): `passport_shares`, `passport_settings`, criação, revogação, leitura pública pelo código, página básica desativável |
| `20261107105426_transfers.sql` | Transferência (ADR-016): `transfer_requests`, pedido, cancelamento, recusa, aceite transacional, leituras de pedidos e motos anteriores |
| `20261107104321_workshop_services.sql` | Serviços pela oficina (ADR-015): `create_workshop_service`, `get_workshop_timeline`, `register_workshop_attachment`, `get_workshop_storage_usage`, `recorded_by_name`, `attachments.organization_id`, regras de arquivos para a oficina |
| `20261107103155_workshop_team.sql` | Equipe (PRD 6.2): permissões em `organization_members`, `organization_invites`, convites, gestão de membros, `has_org_permission` |
| `20261107102312_origin_workshop.sql` | Oficina de Origem (ADR-014): índice de uma Origem ativa por moto, `origin_available`, `set_origin_workshop`, parâmetros de Origem em pedido e decisão |
| `20261107095618_diary.sql` | Fase 2: `motorcycle_diary`, fotos do diário em `attachments.diary_entry_id`, RPCs do diário, view `motorcycle_diary_feed`, políticas do Storage separadas (envio, leitura, exclusão de arquivo próprio sem registro) |
| `20261107015821_attachments.sql` | Fase 2: bucket privado `attachments`, tabela `attachments`, políticas do Storage, `register_attachment`, `get_storage_usage`, cota em `system_settings`; `maintenance_timeline` com anexos e `evidence_level` |

Configurações existentes: `registration_rate_limit_per_hour`, `support_email`, `support_whatsapp`, `billing_enabled` e outras de limites operacionais. `free_plan_max_motorcycles` e `free_plan_storage_quota_mb` não são mais lidas (os limites vêm de `subscription_plans`; remoção em KI-023). Nenhum dado de teste.

## Tabelas

### Identidade e acesso
| Tabela | Finalidade | Escrita por |
|---|---|---|
| `profiles` | Nome, e-mail, telefone, aceites de termos | Trigger no cadastro; usuário edita `full_name`, `phone`, `avatar_url` |
| `user_roles` | Papéis globais `owner`, `workshop`, `admin` | Somente backend. `admin` só via SQL/service role |
| `system_settings` | Parâmetros configuráveis (sem segredos) | Administrador |
| `audit_logs` | Trilha de auditoria somente-inserção | Triggers e funções do backend |

### Organizações
| Tabela | Finalidade | Escrita por |
|---|---|---|
| `organizations` | Tenant (tipo `workshop`), status | `create_workshop` |
| `organization_members` | Vínculo usuário ↔ organização (`responsible`/`staff`) | `create_workshop` (gestão de membros: Fase 3) |
| `workshops` | Perfil público da oficina | `create_workshop`; responsável edita o perfil |

### Motocicletas
| Tabela | Finalidade | Regras de integridade |
|---|---|---|
| `motorcycles` | Identidade permanente. `id` (UUID) e `public_id` (32 hex aleatórios) imutáveis | Não pode ser excluída. Titular edita dados básicos |
| `motorcycle_plates` | Histórico de placas com vigência | 1 placa ativa por moto; placa ativa única no sistema; só é permitido encerrar a vigência |
| `motorcycle_ownerships` | Titularidade do passaporte | 1 titular atual por moto; não pode ser excluída; `owner_user_id` com RESTRICT (excluir conta não apaga a história) |
| `motorcycle_private` | Chassi completo | Só o titular atual lê/edita; auditoria sem gravar o valor |
| `mileage_records` | Leituras de km | Imutáveis; correção = novo registro com `corrects_record_id`; `below_previous` sinaliza inconsistência |
| `motorcycle_claim_requests` | Pedido de verificação de placa duplicada | Solicitante vê só o próprio pedido, nunca o `motorcycle_id` |

### Histórico técnico (Fase 2)
| Tabela | Finalidade | Regras de integridade |
|---|---|---|
| `maintenance_records` | Registros da linha do tempo: categoria (PRD 5.4), título, data, km, oficina (texto livre ou participante), valor em centavos, descrição, origem | Imutáveis. Correção = novo registro com `corrects_record_id` + motivo; anulação = registro `is_void`. Cada registro só pode ser corrigido uma vez (cadeia linear). Dono não corrige registro de oficina |
| `maintenance_items` | Peças: nome, fabricante, código, quantidade | Imutáveis; até 50 por registro |
| `attachments` | Comprovantes: caminho no Storage (`<moto>/<uuid>.<ext>`), nome, tipo, tamanho, espécie (nota fiscal, OS, recibo, foto, documento, outro), registro vinculado | Imutáveis (só `uploaded_by` pode virar nulo na exclusão de conta). Tamanho e tipo vêm do Storage, não do cliente. Leitura só pelo titular atual |

| `motorcycle_diary` | Diário (PRD 5.7): categoria, título, texto, data, local, visibilidade (`private`/`shareable`) | Autor edita enquanto titular e exclui a qualquer momento. Privada: só o autor. Compartilhável: titular atual. `author_id` não é concedido ao frontend. Auditoria só com metadados (ADR-013) |

### Oficinas e autorizações (Fase 3)

| Tabela | Conteúdo | Regras |
|---|---|---|
| `plate_search_log` | Pesquisas por placa: oficina, usuário, hash sha256 da placa, encontrou ou não | Imutável; só admin lê; base do limite de tentativas |
| `maintenance_reminders` | Lembretes do titular: gatilhos (km, meses, data), base da contagem, pausa, conclusão | Sem acesso direto; só o titular atual, por funções; criar/editar exige o recurso Premium |
| `motorcycle_reports` | Relatórios gerados (referência e métrica) | Sem acesso direto |
| `subscriptions` | Assinaturas: plano, preço/periodicidade/limites contratados, estado, período pago, vínculo com o Mercado Pago | Sem acesso direto; muda só pelas funções do servidor; não é excluída |
| `payments` | Cobranças com estado próprio e se já concederam período | Sem acesso direto; usuário vê só as suas por função; não é excluída |
| `payment_events` | Avisos recebidos: tipo, recurso, request-id, assinatura válida, resultado | Sem acesso direto; admin lê por função; não é excluído |
| `payment_gateway_settings` | Conta do Mercado Pago: ambiente, chave pública, 4 últimos caracteres dos segredos, último teste | Sem acesso direto; segredos no Supabase Vault; leitura dos segredos só pelo servidor |
| `subscription_plans` | Catálogo de planos: preço, periodicidade, limites, benefícios, visibilidade | Sem acesso direto; só funções; código/tipo/periodicidade imutáveis; não é excluído; um único gratuito, sempre ativo |
| `subscription_plan_versions` | Versões de cada alteração de plano | Sem acesso direto; imutável |
| `passport_shares` | Links de compartilhamento: código, nome, opções do que mostrar, validade, revogação, acessos | Sem acesso direto; opções imutáveis; só revogação uma vez; vale só enquanto o criador é titular |
| `passport_settings` | Página básica do QR Code ativa ou não | Sem acesso direto; só pela função do titular |
| `transfer_requests` | Pedidos de transferência: moto, quem envia, e-mail e conta de quem recebe, mensagem, situação, validade | Sem acesso direto; só pelas funções. Um pedido aberto por moto. Só sai de pendente uma vez |
| `organization_invites` | Convites para a equipe: e-mail, permissões, hash do token, validade, aceite/cancelamento | Sem acesso direto; só pelas funções. Um convite aberto por e-mail e oficina |
| `motorcycle_workshop_access` | Pedidos e autorizações por moto e oficina: tipo (`regular`/`origin`), situação, mensagem, quem pediu/decidiu/encerrou e quando | Nunca apagada. Transições só pending → approved/rejected/canceled e approved → revoked/ended. No máximo um pedido aberto por oficina e moto. Leitura pelas funções `get_*` |

**Storage:** bucket `attachments` privado, 10 MB, JPG/PNG/WEBP/PDF. Políticas em `storage.objects`: envio e leitura só na pasta de moto da qual o usuário é titular atual (`can_access_attachment_object`); sem atualização nem exclusão pela API.

## Operações (funções RPC)

| Função | Quem chama | O que faz |
|---|---|---|
| `register_motorcycle(...)` | Usuário autenticado | Valida limite do plano, rate limit e placa; cria moto, placa, titularidade, chassi e km inicial em uma transação. Placa duplicada → `verification_required` |
| `change_motorcycle_plate(moto, placa)` | Titular atual | Encerra a placa atual e cria a nova, preservando o histórico |
| `record_mileage(moto, km, data, nota, corrige)` | Titular atual | Insere leitura; retorna `below_previous` |
| `create_workshop(...)` | Usuário autenticado | Cria organização, membro responsável, perfil e papel `workshop` |
| `get_public_passport(public_id)` | Qualquer pessoa | Retorna apenas campos públicos padrão |
| `create_maintenance_record(...)` | Titular atual | Cria registro (ou correção) com peças; se informar km, cria/reaproveita/corrige a leitura em `mileage_records`. Retorna `{id, below_previous}` |
| `void_maintenance_record(id, motivo)` | Titular atual | Anula registro do dono; o original continua visível |
| `register_attachment(moto, caminho, nome, espécie, registro?)` | Titular atual | Registra arquivo já enviado pelo próprio usuário; confere pasta, tipo, tamanho, cota e registro não anulado. Retorna o id |
| `create_diary_entry(...)` / `update_diary_entry(...)` | Titular atual (edição: só o autor) | Cria/edita entrada do diário |
| `delete_diary_entry(id)` / `delete_diary_photo(id)` | Autor | Exclui e devolve os caminhos dos arquivos para o app apagar no Storage |
| `search_motorcycle_by_plate(org, placa)` | Membro ativo de oficina ativa | `{found, brand, model, manufacturing_year, access_status, motorcycle_id só se autorizada}`; limita e registra |
| `request_workshop_access(org, placa, msg?)` / `cancel_workshop_access_request(id)` | Membro da oficina | Pede (ou devolve o pedido aberto) / cancela pendente |
| `decide_workshop_access(id, aprovar, como_origem?)` / `revoke_workshop_access(id)` | Titular atual | Autoriza (como Origem ou só acesso) ou recusa pendente / revoga autorizada |
| `set_origin_workshop(id, origem)` | Titular atual | Define (no prazo, se não houver outra) ou tira o título de Oficina de Origem de uma autorização ativa |
| `get_motorcycle_workshop_access(moto)` / `get_my_pending_access_requests()` | Titular atual | Autorizações da moto com dados públicos da oficina / pendências em todas as motos |
| `get_workshop_access_list(org)` | Membro da oficina | Pedidos da oficina; placa, km e id só quando autorizada |
| `create_org_invite(org, email, pedir?, registrar?)` / `revoke_org_invite(id)` / `get_org_invites(org)` | Responsável | Cria convite (devolve o token uma única vez) / cancela / lista abertos |
| `get_invite_preview(token)` / `accept_org_invite(token)` | Autenticado com o e-mail convidado | Prévia (oficina, permissões, situação) / aceite como funcionário |
| `get_org_members(org)` | Membro | Equipe; e-mails só para o responsável |
| `update_org_member(id, papel, pedir, registrar)` / `remove_org_member(id)` | Responsável, nunca sobre si mesmo | Altera papel e permissões / remove |
| `leave_organization(org)` | Membro | Sai da equipe (bloqueado para o único responsável) |
| `has_org_permission(org, 'request_access' \| 'register_services')` | Autenticado | Membro ativo de oficina ativa com a permissão (responsável tem todas) |
| `create_workshop_service(org, moto, ...)` | Membro com `register_services` de oficina autorizada | Registra (ou corrige o próprio) serviço com peças e km. Retorna `{id, below_previous}` |
| `get_workshop_timeline(org, moto)` | Membro de oficina autorizada | Histórico técnico; valor, notas, comprovantes e funcionário só dos registros da oficina |
| `register_workshop_attachment(org, caminho, nome, espécie, registro)` / `get_workshop_storage_usage(org)` | Oficina autorizada com permissão / membro | Comprovante no próprio registro, na cota da oficina / uso da cota |
| `create_transfer_request(moto, email, msg?)` / `cancel_transfer_request(id)` / `get_motorcycle_transfers(moto)` | Titular atual | Pede, cancela e acompanha a transferência |
| `get_my_incoming_transfers()` / `accept_transfer_request(id, data_compra?)` / `reject_transfer_request(id)` | Conta com o e-mail do pedido | Vê, aceita (transação única) ou recusa |
| `get_my_previous_motorcycles()` | Autenticado | Motos que já foram do usuário, com a quantidade de entradas próprias no diário |
| `create_passport_share(moto, nome?, dias?, placa?, km?, histórico?, valores?, comprovantes?, diário?)` / `revoke_passport_share(id)` / `get_motorcycle_shares(moto)` | Titular atual | Cria (devolve o código), revoga e lista links |
| `get_shared_passport(código)` | Público (anônimo) | Passaporte compartilhado conforme as opções; NULL se inválido, revogado, vencido ou de antigo dono; conta o acesso |
| `get_passport_settings(moto)` / `set_public_page_enabled(moto, ativo)` | Titular atual | Página básica do QR Code |
| `workshop_has_access(moto, org?)` | Autenticado | Verdadeiro se o usuário é membro ativo de oficina ativa com autorização aprovada |
| `get_storage_usage()` | Autenticado | `{used_bytes, quota_bytes, max_file_bytes}` do usuário |
| `has_role`, `is_admin`, `is_current_owner`, `is_org_member`, `is_org_responsible`, `is_org_active` | Políticas RLS | Verificações de permissão |

## View

- `my_motorcycles` (`security_invoker`): motos do usuário com placa atual, data de aquisição e última km.
- `maintenance_timeline` (`security_invoker`): registros com `status` (`current`/`superseded`), peças em `items`, anexos em `attachments` e `evidence_level` (`workshop` > `document` > `owner`; `document` quando o registro tem origem documento ou anexos).

## Pontos de extensão previstos

- `mileage_records.evidence_id` → FK para `attachments` (Fase 2).
- `motorcycle_ownerships.transfer_id` → FK para `transfer_requests` (Fase 4).
- Políticas de `motorcycles`, `mileage_records` etc. ganharão acesso de oficina autorizada (Fase 3).
- `register_motorcycle` passará a considerar a assinatura Premium no limite (Fase 5).

## Como testar

**Local (PostgreSQL puro):**
```
PGHOST=... PGPORT=... PGUSER=postgres scripts/validation/run_db_tests.sh
```
Usa `tests/db/supabase_stub.sql` para simular o Supabase e roda `tests/security/*.sql`.

**No Supabase (sem deixar dados):** executar `tests/security/supabase/phase1_rls_test_rollback.sql` no SQL Editor ou via MCP. O script roda tudo em uma transação e termina com o erro proposital `RESULTADO: N testes passaram`, que desfaz todos os dados de teste. Qualquer outro erro (`FALHOU: ...`) indica falha real.
