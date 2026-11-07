# PROJECT_STATUS — Moto Passaporte

**Versão atual:** 0.2.0
**Data:** 06/11/2026
**Fase:** Fase 1 — banco de dados da fundação `testado` (local); frontend não iniciado

## Ambientes

| Ambiente | URL | Banco | Situação |
|---|---|---|---|
| Desenvolvimento | — | — | não configurado |
| Homologação | — | — | não configurado |
| Produção | — | — | não configurado |

## Fase 1 — andamento

| Item | Situação |
|---|---|
| Estrutura do projeto, Git, documentação | `implementado` |
| Banco: perfis, papéis, organizações, oficinas | `testado` (local) |
| Banco: moto, ID permanente, placas, titularidade, km, duplicidade | `testado` (local) |
| Banco: auditoria e RLS | `testado` (local) |
| Passaporte público (campos padrão) | `testado` (local) |
| Site público | `planejado` |
| Painéis base (proprietário, oficina, admin) | `planejado` |
| QR Code (geração na interface a partir do `public_id`) | `planejado` |

## Próximos passos

1. Conectar o projeto Supabase novo, aplicar as migrações e rodar os testes de segurança lá (KI-001).
2. Decidir D-T1 (quem constrói a interface).
3. Iniciar o frontend da Fase 1: site público, autenticação e painel base do proprietário.

## Riscos ativos

- Migrações ainda não validadas no Supabase real (KI-001).

## Último backup confirmado

Não aplicável — ainda não há dados.
