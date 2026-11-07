# Moto Passaporte

**A identidade digital e o histórico de vida da sua motocicleta.**

SaaS brasileiro que cria um passaporte digital permanente para cada moto — manutenções, quilometragem, comprovantes e diário — transferível ao novo proprietário. Oficinas participantes usam gratuitamente.

> A história da sua moto não precisa começar de novo a cada proprietário.

## Situação

Versão **0.3.0** — banco de dados da Fase 1 aplicado e testado no Supabase de desenvolvimento. Interface não iniciada.

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Requisitos do produto (v2.0) |
| [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md) | Memória técnica — **ler antes de qualquer alteração** |
| [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) | Estado atual, ambientes e próximos passos |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decisões tomadas e pendentes |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Histórico de mudanças |
| [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) | Problemas conhecidos |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Tabelas, operações e regras do banco |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Papéis, matriz de acesso e testes de segurança |

## Stack prevista

React + TypeScript · Supabase (PostgreSQL, Auth, Storage, RLS, Edge Functions) · Mercado Pago

## Regras para contribuir

- Toda mudança de banco é uma migração versionada em `supabase/migrations/`.
- Nunca versionar `.env` real nem segredos — use `.env.example` como modelo.
- Nunca desabilitar RLS.
- Atualizar `PROJECT_MEMORY.md` e `CHANGELOG.md` a cada mudança relevante.
