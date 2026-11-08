# PROJECT_MEMORY — Moto Passaporte

> Memória técnica oficial do projeto (PRD v2.0, seção 17).
> Toda sessão de IA ou desenvolvedor deve ler este arquivo **antes** de qualquer alteração.
> Nunca registrar aqui senhas, tokens, chaves, dados pessoais ou segredos operacionais.

**Última atualização:** 06/11/2026
**Versão do projeto:** 0.7.0
**Situação geral:** Fase 1 concluída (base); Fase 2 em andamento — linha do tempo e manutenção publicadas em https://moto-passaporte.vercel.app.

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

Criadas na Fase 2: `maintenance_records`, `maintenance_items`, view `maintenance_timeline` (com anexos e `evidence_level`), `attachments` + bucket privado `attachments` no Storage, `motorcycle_diary` + view `motorcycle_diary_feed` (ADR-013).

Criadas na Fase 3: `plate_search_log`, `motorcycle_workshop_access`, `organization_invites` (+ permissões em `organization_members` e `has_org_permission()`) (+ `workshop_has_access()` para as próximas regras de leitura/escrita da oficina).

Ainda por criar: cobrança e `notifications` (F5), `support_cases` (F6).

## 5. Módulos

| Módulo | Fase | Situação |
|---|---|---|
| Fundação SaaS, auth, papéis, organizações, RLS, auditoria (banco) | 1 | `testado` (Supabase dev) |
| Site público (início, FAQ, contato, termos, privacidade) | 1 | `implementado` |
| Cadastro de moto, ID permanente (banco) | 1 | `testado` (Supabase dev) |
| QR Code, painéis do proprietário, oficina (base) e admin (base) | 1 | `implementado` |
| Linha do tempo, manutenção e quilometragem | 2 | `implementado` |
| Anexos e cotas | 2 | `implementado` |
| Diário da moto | 2 | `implementado` |
| Pesquisa por placa e autorizações | 3 | `implementado` |
| Oficina de Origem | 3 | `implementado` (ADR-014) |
| Membros da oficina e permissões | 3 | `implementado` |
| Registro de serviço pela oficina | 3 | `implementado` (ADR-015) |
| Transferência do passaporte | 4 | `implementado` (ADR-016) |
| Compartilhamento público controlado | 4 | `implementado` (ADR-017) |
| Planos e preços configuráveis | 5 | `implementado` (ADR-018) |
| Mercado Pago, assinaturas, cotas | 5 | `planejado` |
| Painel administrativo, testes de segurança, lançamento | 6 | `planejado` |
| Oficina (PRD 2.1) Fase 1: clientes, catálogo, preços, orçamentos, aprovação por link | 2.1-F1 | `testado` (ADR-043, `docs/modules/`) |
| Oficina (PRD 2.1) Fase 2: ordens de serviço, checklists, fotos, comprovante | 2.1-F2 | `testado` (ADR-044) |
| Oficina (PRD 2.1) Fase 3: OS concluída no histórico da moto | 2.1-F3 | `testado` (ADR-045) |
| Oficina (PRD 2.1) Fase 4: agenda, peças, financeiro, relacionamento, relatórios | 2.1-F4 | `testado` (ADR-046) |
| Oficina (PRD 2.1) Fase 5.1: vínculo do cliente, Meus atendimentos, avisos §23, logotipo | 2.1-F5.1 | `testado` (ADR-048) |
| Oficina (PRD 2.1) Fase 5: perfil avançado, avaliações, agendamento público, campanhas | 2.1-F5 | `testado` (ADR-047); WhatsApp oficial `planejado` (KI-040) |

## 6. Ambientes

| Ambiente | Situação |
|---|---|
| Desenvolvimento | Supabase `ripgenhykaajcnzdxoid`; frontend na Vercel (https://moto-passaporte.vercel.app) |
| Homologação | não configurado |
| Produção | não configurado |

## 7. Pendências imediatas

- Credenciais do Mercado Pago: cadastradas pelo admin em /admin/pagamentos, guardadas no Vault, lidas só por `payment_access_token()` (service_role) — ADR-019. Edge Functions ficam em `supabase/functions/` e são publicadas pelo MCP.
- Assinaturas (ADR-020): Edge Functions `mercadopago-billing` e `mercadopago-webhook` + `_shared/mercadopago.ts` (deploy com arquivos `<fn>/index.ts` e `_shared/mercadopago.ts`, entrypoint `<fn>/index.ts`). Regras de negócio nas funções `billing_*` do banco; Premium só com cobrança aprovada consultada na API.
- Benefícios Premium (ADR-021): `user_has_entitlement(user, key)`; lembretes em `maintenance_reminders`; relatório é página de impressão (`/painel/motos/:id/relatorio`), sem biblioteca de PDF.
- Migrações com DROP/DELETE de dados pedem confirmação do responsável no Supabase: preferir mudanças aditivas.
- Faturas (ADR-022) mantidas dentro de `billing_apply_payment`; recibo interno sem valor fiscal.
- Administração (ADR-023): ações com motivo (`require_admin_reason`), auditadas; suspensão usa `auth.users.banned_until`.
- Configurações só por `admin_update_setting` (catálogo `setting_spec`); nova chave editável = adicionar ao catálogo (ADR-024).
- v0.24.0: 6.3 concluído (ADR-026; limpeza pela Edge Function `storage-cleanup`, porque o Supabase bloqueia DELETE em storage.objects).
- v0.25.0: 6.4 concluído (ADR-027). Regressão: `PGHOST=/tmp/pgtest PGPORT=54329 PGUSER=postgres scripts/validation/run_all.sh`. Ao criar função liberada a anônimo ou leitura anônima, atualizar a lista da varredura (`sweep_violations.sql.inc`) com decisão registrada. 
- v0.26.0: 6.5 concluído (ADR-028; OPERATIONS.md). Restauração = migrações do Git + dados do backup (gatilhos desligados). Ao criar migração nova que substitui função existente, escrever o `.down.sql` correspondente em `supabase/rollback/` e manter `restore_check.sh` passando. Próximo item: 6.6 (homologação e publicação).
- v0.27.0: preparação do lançamento — rotinas automáticas (ADR-029, KI-024 e KI-029 resolvidos). Testar uma rotina no Supabase real: `select net.http_post(...)` como no agendamento e ler `net._http_response` e `job_runs`.
- v0.28.0: MFA obrigatório para admin (ADR-030, KI-014). Testes no Supabase real precisam de `'aal', 'aal2'` nos claims do admin. No banco local, o stub de `auth.jwt()` assume aal2 quando só `request.jwt.claim.sub` é definido.
- v0.29.0: central de notificações (ADR-031, KI-020). Novo evento que mereça aviso: chamar `public.notify(user, kind, título, texto, link interno, chave)` no banco (gatilho ou função), acrescentar o `kind` na checagem da tabela e na lista de `get_my_notification_preferences`, e o rótulo em `src/modules/notifications/api.ts`.
- v0.30.0: chassi cifrado (ADR-032, KI-002). Nunca ler `motorcycle_private` pelo navegador; usar `get_my_chassis`/`set_my_chassis`. Nova permissão por coluna exige entrar na lista `column_write_ok` da varredura. Limites já vêm de `user_plan()` (ADR-018): a 5.4 só troca a regra para a assinatura ativa. Antes de cobrar: decisões P-1, P-3, P-4, P-5 e credenciais de teste do Mercado Pago. Ver `PROJECT_STATUS.md` e `PRD_CHECKLIST.md`.
- v0.31.0: páginas sob demanda (KI-010).
- v0.32.0: conferência de conteúdo no servidor (ADR-033, KI-018). Testes que inserem em `storage.objects` no banco local passam pela conferência simulada no stub; para testar a recusa, `set tests.skip_file_check = 'on'`. No Supabase real, gravar o resultado como service_role (`record_attachment_check`).
- v0.33.0: comprovantes pelo link (ADR-034, KI-022) e KI-023. Edge Functions publicadas pelo MCP podem levar só o trecho de `_shared` que usam; ao republicar a partir do Git, mandar o `_shared/mercadopago.ts` completo.
- v0.34.0: limite de consultas anônimas (ADR-035, KI-003). Testes que chamam `get_public_passport`/`get_shared_passport` como anônimo com `request.headers` definido passam pelo limite (padrão 120/h). Ao mudar `get_shared_passport`, o rollback de `public_rate_limit` restaura a versão com ids de comprovantes e o de `shared_files` a versão anterior.
- Criar ambientes de homologação e produção antes de usuários reais (KI-007).
- Decidir criptografia do chassi (D-T3) antes de produção.

Decisões já fechadas: Git direto na `main` (ADR-005), 1 moto no gratuito (ADR-006), duplicidade por placa (ADR-007), campos públicos padrão (ADR-008), Supabase em us-east-1 (ADR-009), nomes de migração = versão do Supabase (ADR-010), diário privado nunca muda de dono (ADR-013), Oficina de Origem como tipo de autorização (ADR-014), visão e registro da oficina autorizada (ADR-015), transferência por e-mail do comprador (ADR-016), compartilhamento controlado (ADR-017).

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
2. Atualizar o quadro **Progresso** do `PRD_CHECKLIST.md`.
3. Commit descritivo e push na `main` (ADR-005); conferir o deploy na Vercel.
4. Informar ao responsável **a % concluída e o que falta** (pedido permanente: "me diga a % já feita e o que falta, sempre") e o próximo item na ordem.
