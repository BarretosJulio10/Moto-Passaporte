# Moto Passaporte

**A identidade digital e o histórico de vida da sua motocicleta.**

SaaS brasileiro que cria um passaporte digital permanente para cada moto — manutenções, quilometragem, comprovantes e diário — transferível ao novo proprietário. Oficinas participantes usam gratuitamente.

> A história da sua moto não precisa começar de novo a cada proprietário.

## Situação

Versão **0.7.0** — no ar em https://moto-passaporte.vercel.app: site público, contas, motos com QR Code e passaporte público, linha do tempo de manutenção, oficinas (base) e painel administrativo base.

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Requisitos do produto (v2.0) |
| [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md) | Memória técnica e protocolo de trabalho — **ler antes de qualquer alteração** |
| [`docs/PRD_CHECKLIST.md`](docs/PRD_CHECKLIST.md) | Conferência item a item do PRD: o que está feito, em andamento e pendente |
| [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md) | Contrato frontend ↔ banco (Auth, RPCs, erros) |
| [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) | Estado atual, ambientes e próximos passos |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decisões tomadas e pendentes |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Histórico de mudanças |
| [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) | Problemas conhecidos |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Tabelas, operações e regras do banco |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Papéis, matriz de acesso e testes de segurança |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Identidade visual: cores, tipografia, princípios |

## Stack

Vite + React + TypeScript · Tailwind CSS · Supabase (PostgreSQL, Auth, Storage, RLS, Edge Functions) · Vercel · Mercado Pago (Fase 5)

## Rodar localmente

```bash
npm install
cp .env.example .env      # preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev               # http://localhost:5173
npm test                  # testes unitários e de tela
npm run build             # verificação de tipos + build de produção
```

Testes do banco: `scripts/validation/run_db_tests.sh` (ver `docs/DATABASE.md`).

## Regras para contribuir

- Toda mudança de banco é uma migração versionada em `supabase/migrations/`.
- Nunca versionar `.env` real nem segredos — use `.env.example` como modelo.
- Nunca desabilitar RLS.
- Atualizar `PROJECT_MEMORY.md` e `CHANGELOG.md` a cada mudança relevante.
