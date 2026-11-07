# DATABASE — Moto Passaporte

**Situação:** migrações da Fase 1 **aplicadas** no Supabase de desenvolvimento (`ripgenhykaajcnzdxoid`, PostgreSQL 17) em 06/11/2026 e `testado` lá (71 verificações) e localmente (73 verificações).

Migrações em `supabase/migrations/`, aplicadas em ordem (prefixo = versão no Supabase, ADR-010):

| Arquivo | Conteúdo |
|---|---|
| `20261107003043_base.sql` | pgcrypto, utilitários (placa), auditoria imutável, triggers genéricos |
| `20261107003102_identity.sql` | `profiles`, `user_roles`, criação automática no cadastro, `has_role`/`is_admin`, `system_settings` |
| `20261107003124_organizations.sql` | `organizations`, `organization_members`, `workshops`, `create_workshop` |
| `20261107003222_motorcycles.sql` | `motorcycles`, `motorcycle_plates`, `motorcycle_ownerships`, `motorcycle_private`, `mileage_records`, `motorcycle_claim_requests`, operações e view `my_motorcycles` |
| `20261107003227_public_passport.sql` | `get_public_passport` (campos públicos padrão — ADR-008) |
| `20261107003512_phase1_hardening.sql` | Reforço pelos advisors: bloqueia RPC de funções de trigger, otimiza RLS com `(select auth.uid())`, índices de FKs |

Dados existentes após a aplicação: apenas as 2 configurações iniciais de `system_settings` (e seus 2 eventos de auditoria). Nenhum dado de teste.

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

## Operações (funções RPC)

| Função | Quem chama | O que faz |
|---|---|---|
| `register_motorcycle(...)` | Usuário autenticado | Valida limite do plano, rate limit e placa; cria moto, placa, titularidade, chassi e km inicial em uma transação. Placa duplicada → `verification_required` |
| `change_motorcycle_plate(moto, placa)` | Titular atual | Encerra a placa atual e cria a nova, preservando o histórico |
| `record_mileage(moto, km, data, nota, corrige)` | Titular atual | Insere leitura; retorna `below_previous` |
| `create_workshop(...)` | Usuário autenticado | Cria organização, membro responsável, perfil e papel `workshop` |
| `get_public_passport(public_id)` | Qualquer pessoa | Retorna apenas campos públicos padrão |
| `has_role`, `is_admin`, `is_current_owner`, `is_org_member`, `is_org_responsible`, `is_org_active` | Políticas RLS | Verificações de permissão |

## View

- `my_motorcycles` (`security_invoker`): motos do usuário com placa atual, data de aquisição e última km.

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
