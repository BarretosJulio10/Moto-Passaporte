# DECISIONS — Moto Passaporte

Registro de decisões arquiteturais e de produto, com justificativa.
Decisões tomadas recebem um número ADR; decisões em aberto ficam na seção "Pendentes".

---

## Decisões tomadas

### ADR-001 — PRD v2.0 é o documento de referência
**Data:** 06/11/2026 · **Status:** aceita
O PRD v2.0 (`docs/PRD.md`) consolida a v1.0. As regras da v1.0 continuam válidas exceto onde a v2.0 as detalha ou complementa.

### ADR-002 — GitHub como fonte da verdade; banco por migrações versionadas
**Data:** 06/11/2026 · **Status:** aceita
**Contexto:** o projeto Supabase ainda não está conectado.
**Decisão:** toda estrutura de banco (tabelas, RLS, funções, triggers) é escrita como arquivos de migração em `supabase/migrations/`, versionados no Git, e aplicados em ordem quando o Supabase for conectado. Alterações posteriores sempre por **nova** migração.
**Consequência:** o banco nasce reproduzível e auditável (PRD 18.3). A validação real de RLS e regras só acontece após a conexão — os testes de segurança são o primeiro passo depois de aplicar as migrações.

### ADR-003 — Projeto Supabase em conta separada
**Data:** 06/11/2026 · **Status:** aceita
O Moto Passaporte usa um projeto Supabase próprio, isolado de outros projetos: **MOTO_Passaporte** (`ripgenhykaajcnzdxoid`), PostgreSQL 17.

### ADR-009 — Região do Supabase: us-east-1
**Data:** 06/11/2026 · **Status:** aceita
O projeto foi criado em us-east-1 (EUA). São Paulo (sa-east-1) daria menor latência ao público brasileiro (estimativa: ~100–150 ms a menos por requisição), mas o responsável pelo produto optou por manter. A região não pode ser alterada depois; mudar exigirá criar outro projeto e migrar dados. Reavaliar antes do lançamento público se a latência for perceptível.

### ADR-010 — Nomes dos arquivos de migração = versão registrada no Supabase
**Data:** 06/11/2026 · **Status:** aceita
Cada arquivo em `supabase/migrations/` tem o mesmo prefixo de versão registrado pelo Supabase ao aplicar a migração, para que o histórico do repositório e o do banco coincidam (e a Supabase CLI reconheça as migrações já aplicadas).

### ADR-004 — Mercado Pago como provedor de cobrança
**Data:** 06/11/2026 · **Status:** aceita (definido no PRD v2.0)
Integração somente no backend (Edge Functions). Supabase guarda o estado interno; Mercado Pago processa pagamentos. Camada de integração isolada para permitir troca de provedor.

### ADR-005 — Fluxo Git: commits direto na `main` (resolve D-T2)
**Data:** 06/11/2026 · **Status:** aceita
Por decisão do responsável pelo produto, o desenvolvimento é feito direto na `main`, com commits pequenos e descritivos. **Desvio do PRD 18.2** (que recomenda branches e `main` protegida): reavaliar antes da homologação/produção, quando houver usuários reais.

### ADR-006 — Plano gratuito: 1 motocicleta (resolve parte de P-1)
**Data:** 06/11/2026 · **Status:** aceita
Limite configurável em `system_settings.free_plan_max_motorcycles` (valor inicial 1), alterável sem código. Valores e benefícios do Premium seguem pendentes (P-1).

### ADR-007 — Duplicidade de cadastro pela placa (resolve parte de P-6)
**Data:** 06/11/2026 · **Status:** aceita
Uma placa ativa só pode pertencer a uma moto (índice único parcial em `motorcycle_plates`, placa normalizada). Ao tentar cadastrar placa já ativa, o sistema **não revela** a moto existente: cria um pedido de verificação (`motorcycle_claim_requests`) analisado pela administração.
**Limitação conhecida:** a placa pode mudar e pode haver erro de digitação; o chassi seria mais robusto. O chassi continua armazenado (restrito ao proprietário) e pode ser usado como segunda verificação futuramente. Verificação de oficinas (outra parte de P-6) segue pendente.

### ADR-008 — Campos públicos padrão do passaporte (resolve P-8)
**Data:** 06/11/2026 · **Status:** aceita
Por padrão, a página pública / QR Code exibe somente: marca, modelo, versão, ano de fabricação, ano/modelo, cilindrada, cor e data de criação do passaporte (foto principal quando existir, Fase 2). Histórico, quilometragem, oficinas e comprovantes só aparecem quando o proprietário escolher expressamente (Fase 4). Nunca públicos: placa, chassi, dados pessoais, proprietários anteriores e diário privado.

### ADR-011 — Interface construída direto neste repositório (resolve D-T1)
**Data:** 06/11/2026 · **Status:** aceita
O responsável pelo produto escolheu que a interface seja desenvolvida diretamente neste repositório (pelo Claude), e não pelo Lovable.
**Pré-requisito:** liberar a instalação de pacotes (rede) no ambiente do Claude e iniciar uma nova conversa (KI-008).
**Stack do frontend** (mantém o previsto no PRD 16.1 e compatível com o padrão do Lovable, caso se decida usá-lo no futuro):
- Vite + React + TypeScript (strict)
- Tailwind CSS + componentes acessíveis no estilo shadcn/ui
- React Router (rotas públicas e áreas autenticadas separadas)
- `@supabase/supabase-js` tipado com `src/types/supabase.ts`
- TanStack Query para dados do servidor
- Biblioteca de QR Code no cliente a partir do `public_id`
- Vitest + Testing Library (unitários) e Playwright (E2E, já disponível no ambiente)
Organização de pastas conforme PRD 16.3 (`src/core`, `src/modules/...`), sem criar diretórios vazios.

### ADR-012 — Hospedagem do frontend na Vercel
**Data:** 06/11/2026 · **Status:** aceita
O site/aplicação será publicado pela Vercel, conectada ao repositório GitHub `BarretosJulio10/Moto-Passaporte` (deploy automático a cada push na `main`; pré-visualização por branch quando houver).
Configuração prevista (aplicar quando o frontend existir — ADR-011):
- Framework: Vite · Build: `npm run build` · Saída: `dist`
- Variáveis de ambiente na Vercel: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (somente a chave pública; **nunca** a service role)
- Reescrita de rotas para `index.html` (SPA), via `vercel.json`
- Após o primeiro deploy: cadastrar a URL da Vercel em Supabase → Auth → URL Configuration (Site URL e Redirect URLs)
- Região de funções (se usadas): próxima de us-east-1, onde está o Supabase (ADR-009)
Até o frontend existir, um deploy na Vercel não terá o que publicar — isso é esperado.

---

## Pendentes — técnicas

| ID | Decisão | Impacto | Necessária antes de |
|---|---|---|---|
| D-T3 | Criptografia em coluna do chassi (Supabase Vault/pgsodium) vs. tabela isolada com RLS só do proprietário | Proteção extra do chassi em caso de vazamento do banco | Antes de produção |

## Pendentes — produto (PRD seção 27)

| ID | Decisão | Afeta a Fase 1? |
|---|---|---|
| P-1 | Valores finais e benefícios do Premium (limite do gratuito resolvido: ADR-006) | Não |
| P-2 | Cotas de armazenamento após simulação financeira | Não (Fase 2/5) |
| P-3 | Período de tolerância após falha de cobrança, suspensão e reativação | Não (Fase 5) |
| P-4 | Política de reembolso e cancelamento | Não (Fase 5) |
| P-5 | Planos de assinatura do Mercado Pago vs. assinaturas individuais sem plano | Não (Fase 5) |
| P-6 | Exigências de verificação das oficinas (duplicidade de moto resolvida: ADR-007) | Não (Fase 3) |
| P-7 | Fluxo excepcional de transferência quando o proprietário anterior não pode participar | Não (Fase 4) |
| P-9 | Canais e prazos de atendimento ao usuário | Não |
| P-10 | Retenção/exportação de anexos após cancelamento e encerramento de conta | Não (Fase 5) |
| P-11 | Responsável interno pelo tratamento de dados (LGPD) e procedimento de incidentes | Não (antes do lançamento) |
