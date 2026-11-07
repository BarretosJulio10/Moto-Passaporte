# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.5.0
**Data:** 06/11/2026
**Fase:** Fase 1 — banco testado; site público, autenticação e painel do proprietário implementados; publicado na Vercel

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | https://moto-passaporte.vercel.app (Vercel, deploy automático da `main`) | Supabase `ripgenhykaajcnzdxoid` (MOTO_Passaporte, us-east-1, PG 17) | banco da Fase 1 aplicado |
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

Concluído em 0.5.0: painel do proprietário (cadastro de moto, página da moto, placa, chassi, quilometragem, QR Code) e passaporte público.

1. **Responsável pelo produto:** confirmar URLs de autenticação no Supabase (KI-012) e testar criar conta + cadastrar moto no site publicado.
2. Fase 1, item 1.8b — páginas de FAQ e contato.
3. Fase 1, item 1.9b — base do painel da oficina (cadastro gratuito via `create_workshop`, perfil) e base do painel admin.
4. Fechar a Fase 1 no `PRD_CHECKLIST.md`; depois, Fase 2 (linha do tempo, manutenções, anexos, diário).

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.

## Último backup confirmado

Não aplicável — banco sem dados de usuários.
