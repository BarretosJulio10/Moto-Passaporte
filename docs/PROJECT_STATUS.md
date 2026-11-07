# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.3.1
**Data:** 06/11/2026
**Fase:** Fase 1 — banco de dados aplicado e testado no Supabase dev; frontend não iniciado

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | — | Supabase `ripgenhykaajcnzdxoid` (MOTO_Passaporte, us-east-1, PG 17) | banco da Fase 1 aplicado |
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

## Próximos passos

1. Decidir D-T1 (quem constrói a interface).
2. Iniciar o frontend da Fase 1: site público, autenticação e painel base do proprietário.
3. Configurar Auth no Supabase (confirmação de e-mail, URLs de redirecionamento) junto com o frontend.

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.

## Último backup confirmado

Não aplicável — banco sem dados de usuários.
