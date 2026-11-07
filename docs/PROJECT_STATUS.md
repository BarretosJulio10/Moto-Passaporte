# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.3.1
**Data:** 06/11/2026
**Fase:** Fase 1 — banco de dados aplicado e testado no Supabase dev; frontend não iniciado

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | Vercel (conectando ao GitHub — ADR-012; sem frontend ainda) | Supabase `ripgenhykaajcnzdxoid` (MOTO_Passaporte, us-east-1, PG 17) | banco da Fase 1 aplicado |
| Homologação | — | — | não configurado |
| Produção | — | — | não configurado |

## Fase 1 — andamento

| Item | Situação |
|---|---|
| Estrutura do projeto, Git, documentação | `implementado` |
| Banco: perfis, papéis, organizações, oficinas | `testado` (Supabase dev) |
| Banco: moto, ID permanente, placas, titularidade, km, duplicidade | `testado` (Supabase dev) |
| Banco: auditoria e RLS | `testado` (Supabase dev) |
| Passaporte público (campos padrão) | `testado` (Supabase dev) |
| Site público | `planejado` |
| Painéis base (proprietário, oficina, admin) | `planejado` |
| QR Code (geração na interface a partir do `public_id`) | `planejado` |

## Próximos passos (em ordem)

**Bloqueio atual:** KI-008 — liberar instalação de pacotes e abrir nova conversa. Interface será feita direto no repositório (ADR-011).

1. Na nova conversa: conferir estado (protocolo da seção 8 do `PROJECT_MEMORY.md`) e confirmar que `npm` acessa o registro.
2. Fase 1, item 1.8 — base do frontend: Vite + React + TS, Tailwind, roteamento, cliente Supabase tipado, identidade visual (cores, tipografia, logo provisório).
3. Fase 1, item 1.7 — telas de cadastro (com aceite dos termos), login, logout e recuperação de senha; configurar Auth no Supabase (confirmação de e-mail, URLs de redirecionamento).
4. Fase 1, item 1.8 — site público: início, como funciona, para motociclistas, para oficinas, planos, FAQ, contato, termos e privacidade.
5. Fase 1, itens 1.5/1.6/1.9 — painel do proprietário (cadastro de moto, minhas motos, QR Code), página do passaporte público, bases dos painéis de oficina e admin.
6. Testes (unitários + E2E com Playwright) e atualização do `PRD_CHECKLIST.md`.

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.

## Último backup confirmado

Não aplicável — banco sem dados de usuários.
