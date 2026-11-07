# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.6.0
**Data:** 06/11/2026
**Fase:** Fase 1 concluída (base). Próxima: Fase 2 — histórico e arquivos

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

Concluído em 0.6.0: perguntas frequentes, contato, painéis base de oficina e admin. **Fase 1 concluída (base).**

1. **Responsável pelo produto:** criar a própria conta no site; pedir ao Claude para conceder o papel admin a ela (via SQL interno); definir e-mail/WhatsApp de atendimento (KI-015).
2. **Fase 2** — linha do tempo e registros de manutenção (`maintenance_records`, `maintenance_items`), com origem do registro.
3. Fase 2 — anexos e cotas (Storage privado, compressão de imagens, limites por plano).
4. Fase 2 — diário da moto (privado/compartilhável).

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.

## Último backup confirmado

Não aplicável — banco sem dados de usuários.
