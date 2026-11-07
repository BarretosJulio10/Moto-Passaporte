# CHANGELOG — Moto Passaporte

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versionamento semântico (`MAJOR.MINOR.PATCH`).

## [Não publicado]

### Adicionado
- ADR-011: interface construída direto no repositório; stack do frontend definida.
- Plano ordenado da interface da Fase 1 em `PROJECT_STATUS.md`.

## [0.3.1] — 06/11/2026

### Adicionado
- `docs/PRD_CHECKLIST.md`: conferência item a item do PRD por fase.
- Protocolo de trabalho obrigatório em `PROJECT_MEMORY.md` (seção 8): conferir o feito, seguir em ordem, sempre a partir do PRD.
- `docs/API_DOCUMENTATION.md`: contrato frontend ↔ Supabase (Auth, RPCs, view, erros, mensagens).
- `src/types/supabase.ts`: tipos TypeScript gerados do banco (verificados com `tsc --strict`).

## [0.3.0] — 06/11/2026

### Adicionado
- Migrações da Fase 1 aplicadas no Supabase dev (`ripgenhykaajcnzdxoid`).
- Migração `20261107003512_phase1_hardening.sql`: EXECUTE revogado das funções de trigger, políticas RLS com `(select auth.uid())`, 10 índices de chaves estrangeiras.
- Teste para Supabase real em transação desfeita: `tests/security/supabase/phase1_rls_test_rollback.sql` (71 verificações aprovadas).
- Decisões ADR-009 (região us-east-1) e ADR-010 (nomes de migração = versão no Supabase).

### Alterado
- Arquivos de migração renomeados para as versões registradas no Supabase.
- `tests/db/supabase_stub.sql`: colunas `aud` e `role` em `auth.users`.

### Rollback
- Banco sem dados de usuários: reverter = remover os objetos das migrações na ordem inversa. Nenhum dado a restaurar.

## [0.2.0] — 06/11/2026

### Adicionado
- Migrações da Fase 1 (`supabase/migrations/20261106000100` a `000500`): auditoria imutável, perfis e papéis, configurações do sistema, organizações e oficinas, motocicletas com ID permanente, histórico de placas, titularidade, chassi protegido, quilometragem com alerta de inconsistência, pedidos de verificação de duplicidade e passaporte público com campos padrão.
- Funções `register_motorcycle`, `change_motorcycle_plate`, `record_mileage`, `create_workshop`, `get_public_passport`.
- Testes de segurança `tests/security/phase1_rls_test.sql` (73 verificações aprovadas) e simulação do Supabase `tests/db/supabase_stub.sql`.
- Script `scripts/validation/run_db_tests.sh`.
- `docs/DATABASE.md` e `docs/SECURITY.md`.
- Decisões ADR-005 a ADR-008 (Git direto na main, 1 moto no gratuito, duplicidade por placa, campos públicos padrão).

### Rollback
- Banco ainda não aplicado em nenhum ambiente: nenhum rollback de dados necessário.

## [0.1.0] — 06/11/2026

### Adicionado
- PRD v2.0 em `docs/PRD.md`.
- Memória técnica `docs/PROJECT_MEMORY.md`.
- Registro de decisões `docs/DECISIONS.md` (ADR-001 a ADR-004 e decisões pendentes).
- `docs/PROJECT_STATUS.md` e `docs/KNOWN_ISSUES.md`.
- `README.md`, `.gitignore` e `.env.example` iniciais.
