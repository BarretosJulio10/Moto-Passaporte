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
| PostgreSQL 16 local — Fase 2 (manutenção) | `tests/security/phase2_maintenance_test.sql` | 29 aprovadas |
| Supabase real — Fase 2, em transação desfeita | `tests/security/supabase/phase2_maintenance_rollback.sql` | 26 aprovadas |

Cobertura: isolamento entre proprietários, anônimos, oficinas e admin; escalada para admin; imutabilidade; não revelação em duplicidade de placa; preservação da história na exclusão de conta.

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
