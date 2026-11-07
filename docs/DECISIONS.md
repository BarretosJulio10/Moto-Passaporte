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

### ADR-013 — Diário: privado nunca muda de dono; diário é editável (PRD 5.7, 11)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- Cada entrada é **privada** (padrão) ou **compartilhável**.
- Privada: só o autor vê, inclusive depois de vender a moto. O novo dono nunca vê (PRD 11: não expor diário privado nem dados privados de antigos donos).
- Compartilhável: acompanha a moto. O titular atual vê, sem saber quem escreveu (`author_id` não é exposto). Na Fase 4 poderá entrar no passaporte público, conforme a seleção do dono.
- Diferente do histórico técnico, o diário não é prova: o autor edita enquanto for titular e exclui a qualquer momento (com as fotos, apagadas de fato no Storage).
- Auditoria só com metadados (categoria, data, visibilidade); título, texto e local não vão para o log.
- Fotos do diário reaproveitam `attachments` (`diary_entry_id`), só imagens, até 10 por entrada, contam na cota de quem enviou.

### ADR-014 — Oficina de Origem como tipo de autorização (PRD 6.5)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- O PRD não define o que é "participar do cadastro inicial". Regra adotada: o reconhecimento só pode ser pedido ou definido nos primeiros **30 dias** do passaporte (`origin_workshop_window_days`, configurável).
- A Oficina de Origem é uma autorização com `access_type = 'origin'`: mesmo acesso de uma oficina autorizada, ativo até ser revogado. Não dá propriedade.
- Consentimento do titular sempre: a oficina pede (marcando "ajudamos a criar este passaporte") e o titular escolhe entre autorizar como Origem, autorizar só o acesso ou recusar. O titular também pode marcar uma oficina já autorizada.
- Uma Oficina de Origem ativa por moto. O titular pode tirar o título sem cortar o acesso, ou revogar tudo.
- A transferência (Fase 4) encerra também a Oficina de Origem (PRD 10). Exibir a Origem no passaporte público fica para o compartilhamento controlado (Fase 4).

### ADR-015 — O que a oficina autorizada vê e registra (PRD 6.4 passo 7, 6.7)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- A oficina autorizada vê o **histórico técnico** da moto: data, categoria, título, descrição, quilometragem, peças, origem e nome da oficina de cada registro.
- **Valor, observações, comprovantes e nome do funcionário** aparecem só nos registros da própria oficina. Os do titular e de outras oficinas ficam privados (notas fiscais e preços são dados do dono). Diário nunca.
- Registro pela oficina: membro com a permissão `can_register_services` (ou responsável); origem `workshop` ("Confirmado por oficina"), com oficina e funcionário (nome guardado no momento do registro). A km entra como leitura da oficina.
- Correções só pela própria oficina, como novo registro; o titular não corrige registro de oficina; a oficina não anula (pode corrigir).
- Comprovantes enviados pela oficina contam na cota da oficina (`workshop_storage_quota_mb`, 500 MB), não do titular. O titular vê todos os comprovantes dos registros da moto.
- Revogação corta na hora o acesso ao histórico e aos arquivos; os registros da oficina continuam no histórico da moto.

### ADR-016 — Transferência do passaporte por e-mail do comprador (PRD 10)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- O titular informa o **e-mail da conta** do comprador; o pedido vale 7 dias (`transfer_request_days`), um aberto por moto, até 10 por dia por titular. Só a conta com esse e-mail vê, aceita ou recusa; o titular pode cancelar. Pedido vencido aparece como expirado.
- Antes de aceitar, o comprador vê marca, modelo, versão, ano, placa atual, última km, quantidade de registros, nome de quem envia e a mensagem. O histórico completo só depois de aceitar.
- Aceite em uma transação: confere que quem pediu ainda é o titular e o limite do plano de quem recebe; encerra a titularidade anterior e cria a nova (ambas ligadas ao pedido, com data de compra opcional); encerra **todas** as autorizações ativas de oficina (inclusive Origem, `end_reason = 'transfer'`) e cancela pedidos de acesso pendentes.
- Histórico, autoria, comprovantes e quilometragem permanecem com a moto. Diário privado do antigo titular continua só dele, consultável em "Motos anteriores" (só leitura e exclusão).
- Sem e-mail ou notificação externa por enquanto: o comprador vê o pedido no painel ao entrar (KI-020). Fluxo sem participação do dono anterior segue pendente (P-7). Não é transferência no DETRAN.

### ADR-018 — Catálogo de planos como fonte única dos limites (PRD 4, 7.4, 8.5, 8.6)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- `subscription_plans` guarda os planos: um gratuito (sempre ativo, visível e sem cobrança) e Premium por periodicidade (mensal, semestral, anual), cada um com preço, observação de preço, limite de motos, espaço, benefícios, teste grátis (0 a 90 dias), regras de cancelamento, visibilidade e ordem.
- Código, tipo e periodicidade não mudam depois de criados; planos não são excluídos (só desativados). Cada alteração gera uma versão imutável em `subscription_plan_versions` (quem, quando, conteúdo) e entra na auditoria.
- Limites de motos e espaço passam a vir do plano vigente (`user_plan`); hoje sempre o gratuito. Com as assinaturas (5.2/5.4), o plano vigente será o da assinatura ativa, e a assinatura guardará preço e periodicidade contratados, para que mudanças no catálogo não alterem contratos existentes (PRD 8.5).
- Valores iniciais do Premium seguem o PRD 4.1 (R$ 9,90 / 49,90 / 89,90) com 3 motos e 500 MB, **provisórios** até a decisão P-1.
- Contratação desligada (`billing_enabled = false`) até o Mercado Pago ser validado ponta a ponta (PRD 8.7).
- As configurações antigas `free_plan_max_motorcycles` e `free_plan_storage_quota_mb` deixam de ser lidas (remoção pendente, KI-023).

### ADR-017 — Compartilhamento controlado e página básica desativável (PRD 11)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- Links de compartilhamento (`passport_shares`): código de 192 bits na URL `/c/<código>`, nome opcional, validade de 7, 30, 90 dias ou sem prazo, até 10 ativos por moto, revogáveis, contagem de acessos. Opções não mudam depois de criadas (crie outro link).
- O titular escolhe: histórico (padrão), quilometragem (padrão), placa, valores, indicação de comprovantes e diário compartilhável. Sempre: identificação da moto, data do passaporte e Oficina de Origem. Nunca: dados pessoais, chassi, observações, nome de funcionários, ids, diário privado.
- O link vale só enquanto quem criou é o titular: a venda encerra os links do antigo dono, e o novo dono não os herda.
- A página básica do QR Code permanente (ADR-008) passa a poder ser desativada pelo titular (resolve KI-013).
- Arquivos dos comprovantes não abrem pelo link (só tipo e quantidade): exigiria assinar URLs no servidor para visitantes sem login (KI-022).

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
