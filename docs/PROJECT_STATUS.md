# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.4.0
**Data:** 06/11/2026
**Fase:** Fase 1 — banco testado no Supabase dev; frontend base, site público e autenticação implementados

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

Concluído em 0.4.0: base do frontend, identidade visual, página inicial, termos/privacidade (rascunho), telas de autenticação, painel base do proprietário.

1. **Responsável pelo produto:** configurar URLs de autenticação no Supabase (KI-012) e variáveis de ambiente na Vercel (ADR-012). Opcional: liberar o domínio do Supabase para testes ponta a ponta (KI-009).
2. Fase 1, itens 1.5/1.6/1.9 — painel do proprietário: cadastro de moto na tela (`register_motorcycle`), detalhe da moto, troca de placa, registro de km, QR Code e página pública `/p/:publicId`.
3. Fase 1, item 1.8b — páginas de FAQ e contato.
4. Fase 1, item 1.9 — bases dos painéis de oficina (cadastro gratuito via `create_workshop`) e admin.
5. Testes ponta a ponta e atualização do `PRD_CHECKLIST.md`; depois, Fase 2.

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.

## Último backup confirmado

Não aplicável — banco sem dados de usuários.
