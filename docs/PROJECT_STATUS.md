# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.7.0
**Data:** 06/11/2026
**Fase:** Fase 2 em andamento — linha do tempo e manutenção implementadas

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

Concluído em 0.7.0: linha do tempo e registros de manutenção com peças, correção e anulação.

1. **Responsável pelo produto:** conta criada e com papel admin (06/11/2026); WhatsApp de atendimento configurado. Falta o e-mail de atendimento (KI-015).
2. Fase 2, item 2.4 — anexos e cotas: bucket privado no Supabase Storage, fotos/notas fiscais nos registros (origem "com comprovante"), compressão de imagens, limites por plano, URLs temporárias.
3. Fase 2, item 2.6 — diário da moto (privado/compartilhável).
4. Fechar a Fase 2 no `PRD_CHECKLIST.md`; depois, Fase 3 (oficinas e autorizações).

## Riscos ativos

- Apenas um ambiente (dev) — KI-007.
- Chassi sem criptografia em coluna — KI-002.

## Último backup confirmado

Não aplicável — banco sem dados de usuários.
