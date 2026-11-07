# PROJECT_MEMORY — Moto Passaporte

> Memória técnica oficial do projeto (PRD v2.0, seção 17).
> Toda sessão de IA ou desenvolvedor deve ler este arquivo **antes** de qualquer alteração.
> Nunca registrar aqui senhas, tokens, chaves, dados pessoais ou segredos operacionais.

**Última atualização:** 06/11/2026
**Versão do projeto:** 0.2.0
**Situação geral:** banco da Fase 1 `testado` localmente (não aplicado no Supabase); frontend `planejado`.

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
| Frontend | React + TypeScript, responsivo (Lovable previsto) | `planejado` |
| Backend | Supabase: PostgreSQL, Auth, Storage, RLS, Edge Functions | `planejado` — projeto Supabase ainda não conectado |
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

Situação: Fase 1 `testado` em PostgreSQL 16 local com simulação do Supabase (73 testes de segurança aprovados). **Não aplicado** no Supabase ainda. Detalhes completos em [`DATABASE.md`](./DATABASE.md) e [`SECURITY.md`](./SECURITY.md).

Estratégia (ADR-002): migrações versionadas em `supabase/migrations/`, aplicadas quando o Supabase for conectado. Mudanças futuras = **nova** migração, nunca edição das antigas (exceto enquanto nenhuma tiver sido aplicada em ambiente algum).

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
| Fundação SaaS, auth, papéis, organizações, RLS, auditoria (banco) | 1 | `testado` (local) |
| Site público | 1 | `planejado` |
| Cadastro de moto, ID permanente (banco) | 1 | `testado` (local) |
| QR Code e telas da Fase 1 | 1 | `planejado` |
| Linha do tempo, manutenção, quilometragem, anexos, diário | 2 | `planejado` |
| Oficinas, membros, pesquisa por placa, autorizações | 3 | `planejado` |
| Transferência e compartilhamento público | 4 | `planejado` |
| Planos, Mercado Pago, assinaturas, cotas | 5 | `planejado` |
| Painel administrativo, testes de segurança, lançamento | 6 | `planejado` |

## 6. Ambientes

| Ambiente | Situação |
|---|---|
| Desenvolvimento | não configurado |
| Homologação | não configurado |
| Produção | não configurado |

## 7. Pendências imediatas

- Conectar o projeto Supabase novo (conta separada; região sugerida: São Paulo), aplicar migrações e rodar `scripts/validation/run_db_tests.sh` equivalente lá.
- Decidir quem constrói a interface: Lovable ou desenvolvimento direto no repositório (D-T1).
- Decidir criptografia do chassi (D-T3) antes de produção.

Decisões já fechadas: Git direto na `main` (ADR-005), 1 moto no gratuito (ADR-006), duplicidade por placa (ADR-007), campos públicos padrão (ADR-008).

## 8. Como retomar o trabalho

1. Ler este arquivo, `PROJECT_STATUS.md`, `DECISIONS.md` e `KNOWN_ISSUES.md`.
2. Ler `docs/PRD.md` na seção do módulo a ser trabalhado.
3. Verificar o que já existe no repositório e no banco **antes** de criar algo.
4. Ao terminar: atualizar este arquivo, `CHANGELOG.md` e `PROJECT_STATUS.md`.
