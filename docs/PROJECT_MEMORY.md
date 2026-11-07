# PROJECT_MEMORY — Moto Passaporte

> Memória técnica oficial do projeto (PRD v2.0, seção 17).
> Toda sessão de IA ou desenvolvedor deve ler este arquivo **antes** de qualquer alteração.
> Nunca registrar aqui senhas, tokens, chaves, dados pessoais ou segredos operacionais.

**Última atualização:** 06/11/2026
**Versão do projeto:** 0.5.0
**Situação geral:** Fase 1 quase concluída — banco testado no Supabase dev; site público, autenticação e painel do proprietário publicados em https://moto-passaporte.vercel.app (v0.5.0).

Legenda de estados (seção 17.2): `planejado` · `em desenvolvimento` · `implementado` · `testado` · `homologado` · `publicado`.

---

## 1. O que é o produto

SaaS brasileiro que cria uma **identidade digital permanente para cada motocicleta**, com histórico de manutenção, quilometragem, anexos e diário. O histórico pertence à moto, não ao proprietário: o passaporte é transferível e preserva a autoria dos registros anteriores.

Áreas do sistema:
- **Site público** — explica o produto, planos, FAQ, cadastro e passaporte compartilhado.
- **Painel do proprietário** — motos, linha do tempo, quilometragem, lembretes, oficinas, compartilhamento, transferência, assinatura.
- **Painel da oficina** (gratuito) — organização com membros, pesquisa protegida por placa, solicitação de acesso, registro de serviços.
- **Painel administrativo** — operação do SaaS, planos, pagamentos, armazenamento, auditoria e suporte.

Documento de referência: [`docs/PRD.md`](./PRD.md) (v2.0). As regras da v1.0 continuam válidas exceto onde a v2.0 detalha ou complementa.

## 2. Stack

| Camada | Tecnologia | Situação |
|---|---|---|
| Frontend | Vite + React 19 + TypeScript, Tailwind 4, React Router 7, supabase-js, TanStack Query (ADR-011); hospedagem Vercel (ADR-012) | `implementado` — base, site público, autenticação, painel inicial |
| Backend | Supabase: PostgreSQL 17, Auth, Storage, RLS, Edge Functions | Projeto dev `ripgenhykaajcnzdxoid` (us-east-1) com banco da Fase 1 aplicado |
| Pagamentos | Mercado Pago (API de Assinaturas + Webhooks) | `planejado` — Fase 5 |
| Versionamento | Git / GitHub `BarretosJulio10/Moto-Passaporte` | `implementado` |

## 3. Princípios inegociáveis (resumo do PRD)

1. ID interno da moto é imutável e independente de placa e proprietário. Placa **não** é chave primária.
2. Histórico nunca é apagado nem alterado silenciosamente; correções geram novo evento + auditoria.
3. Origem de todo registro é identificável: proprietário, oficina ou documento.
4. Oficina só acessa moto com autorização ativa (ou vínculo de Oficina de Origem ativo). Revogação vale no backend.
5. Transferência encerra **todas** as autorizações anteriores, inclusive Oficina de Origem.
6. Segurança no banco (RLS) e no backend — nunca só na interface. Não desabilitar RLS.
7. Premium só é liberado após confirmação do pagamento **no backend** (Webhook validado + consulta ao Mercado Pago).
8. O produto documenta; não certifica procedência, estado mecânico nem substitui laudo ou DETRAN.
9. Segredos nunca no frontend nem no Git.

## 4. Banco de dados

Situação: Fase 1 **aplicada** no Supabase dev e `testado` lá (71 verificações, em transação desfeita) e localmente (73). Advisors revisados. Detalhes em [`DATABASE.md`](./DATABASE.md) e [`SECURITY.md`](./SECURITY.md).

Estratégia (ADR-002, ADR-010): migrações versionadas em `supabase/migrations/`, com o mesmo prefixo de versão do Supabase. Como já estão aplicadas, mudanças futuras = **nova** migração; nunca editar as existentes. Após aplicar uma migração via MCP, renomear o arquivo local para a versão retornada por `list_migrations`.

Já criadas (Fase 1): `audit_logs`, `profiles`, `user_roles`, `system_settings`, `organizations`, `organization_members`, `workshops`, `motorcycles`, `motorcycle_plates`, `motorcycle_ownerships`, `motorcycle_private`, `mileage_records`, `motorcycle_claim_requests`, view `my_motorcycles`.

Padrões adotados:
- Escritas estruturais só por funções `security definer` com `search_path = ''`; frontend chama via RPC.
- Privilégios padrão do Supabase revogados e concedidos por tabela/coluna; RLS em todas as tabelas.
- Históricos protegidos por triggers (valem até para o dono do banco).
- Admin com acesso mínimo: não lê chassi nem placas por padrão.

Ainda por criar: `transfer_requests` (F4), `motorcycle_workshop_access`, `maintenance_records`, `maintenance_items` (F2/F3), `motorcycle_diary`, `attachments` (F2), `passport_shares` (F4), cobrança e `notifications` (F5), `support_cases` (F6).

## 5. Módulos

| Módulo | Fase | Situação |
|---|---|---|
| Fundação SaaS, auth, papéis, organizações, RLS, auditoria (banco) | 1 | `testado` (Supabase dev) |
| Site público | 1 | `planejado` |
| Cadastro de moto, ID permanente (banco) | 1 | `testado` (Supabase dev) |
| QR Code e telas da Fase 1 | 1 | `planejado` |
| Linha do tempo, manutenção, quilometragem, anexos, diário | 2 | `planejado` |
| Oficinas, membros, pesquisa por placa, autorizações | 3 | `planejado` |
| Transferência e compartilhamento público | 4 | `planejado` |
| Planos, Mercado Pago, assinaturas, cotas | 5 | `planejado` |
| Painel administrativo, testes de segurança, lançamento | 6 | `planejado` |

## 6. Ambientes

| Ambiente | Situação |
|---|---|
| Desenvolvimento | Supabase `ripgenhykaajcnzdxoid` (banco da Fase 1); frontend não configurado |
| Homologação | não configurado |
| Produção | não configurado |

## 7. Pendências imediatas

- Interface: em construção direto neste repositório (ADR-011). Próximo: FAQ/contato e bases dos painéis de oficina e admin. Ver `PROJECT_STATUS.md`.
- Configurar URLs de autenticação no Supabase (KI-012) e variáveis na Vercel.
- Criar ambientes de homologação e produção antes de usuários reais (KI-007).
- Decidir criptografia do chassi (D-T3) antes de produção.

Decisões já fechadas: Git direto na `main` (ADR-005), 1 moto no gratuito (ADR-006), duplicidade por placa (ADR-007), campos públicos padrão (ADR-008), Supabase em us-east-1 (ADR-009), nomes de migração = versão do Supabase (ADR-010).

## 8. Protocolo de trabalho (obrigatório — pedido do responsável pelo produto)

Seguir **sempre em ordem**, conferindo o que já foi feito antes de continuar, e **sempre a partir do PRD**.

**Ao iniciar qualquer sessão:**
1. Ler este arquivo, `PRD_CHECKLIST.md`, `PROJECT_STATUS.md`, `DECISIONS.md` e `KNOWN_ISSUES.md`.
2. Conferir o estado real: `git log` do repositório e `list_migrations` do Supabase — devem bater com a documentação. Divergência = registrar e resolver antes de seguir.
3. Identificar no `PRD_CHECKLIST.md` o **próximo item na ordem das fases** e ler a seção correspondente do `docs/PRD.md`.
4. Informar ao responsável: o que já está feito, o que está em andamento e o que será feito agora.

**Durante:** etapas pequenas; nunca pular fase sem registrar o motivo; não marcar como concluído o que não foi testado.

**Ao terminar cada entrega:**
1. Atualizar `PRD_CHECKLIST.md`, este arquivo, `PROJECT_STATUS.md` e `CHANGELOG.md` (e `DATABASE.md`/`SECURITY.md` quando aplicável).
2. Commit descritivo e push na `main` (ADR-005).
3. Informar o próximo item na ordem.
