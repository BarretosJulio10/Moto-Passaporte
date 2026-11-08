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

### ADR-040 — App instalável (PWA) com notificações no celular (Web Push)
**Data:** 08/11/2026 · **Status:** aceita (pedido do responsável)
- O site é instalável (manifesto, ícones, service worker): Android pelo botão "Instalar"; iPhone por Safari → Compartilhar → "Adicionar à Tela de Início" (página /instalar). É o mesmo site: tudo que muda no sistema aparece no app. Versão nova: aviso "Atualizar" e recarga.
- Cache só da "casca" (arquivos com hash, ícones, página sem conexão). Nada vindo do Supabase vai para o cache: dados pessoais sempre ao vivo e com login. Sem internet: página "Sem conexão".
- Notificações no celular pelo padrão Web Push (sem Firebase nem serviço pago): chaves VAPID geradas no próprio servidor (privada só no Vault), conteúdo criptografado para cada aparelho (aes128gcm), implementação própria testada contra a referência. Chega com o app fechado; no iPhone exige iOS 16.4+ e o app instalado.
- Todo aviso do sino pode ir ao celular. Coluna "No celular" nas preferências: ligada por padrão nos avisos importantes; lembretes de manutenção e espaço desligados até a pessoa ligar. Silêncio das 22h às 8h (Brasília), exceto pedidos de acesso de oficina. Avisos com mais de 2 dias não são mais enviados.
- Envio pela Edge Function `push-send`, chamada pelo banco logo após o aviso (pg_net, no máximo 1 chamada a cada 5 s) e a cada 5 min pelo pg_cron. Aparelho que não existe mais (404/410) ou com 5 falhas seguidas é removido. Até 10 aparelhos por conta.
- Pedido de permissão só por toque do usuário: em Notificações e num convite no painel depois da primeira moto ("Agora não" esconde por 14 dias).

### ADR-039 — Premium por período pago à vista: Pix, débito ou boleto
**Data:** 08/11/2026 · **Status:** aceita (pedido do responsável: clientes que não querem informar cartão)
- Além da assinatura automática no cartão de crédito, cada plano Premium pode ser pago **à vista por período** (mensal = 1 mês, semestral = 6, anual = 12) pelo Checkout do Mercado Pago: Pix, cartão de débito, boleto ou saldo. Nenhum dado de cartão fica salvo. Mesmo preço do plano (desconto para Pix fica para decisão comercial).
- O Premium é liberado só quando a API do Mercado Pago confirma o pagamento (aviso + conferência no retorno e na conciliação a cada 6 h); valor menor que o do período não libera. Renovar antes do fim soma ao período atual. Pix pago depois de a tentativa expirar ainda é reconhecido (até 10 dias).
- Avisos: 30 dias antes (só 6 e 12 meses), 15, 7, "vence hoje" e "venceu" (no sino; e-mail se a pessoa ligou). "Meu plano" mostra até quando vale, com "Renovar agora" nos últimos 30 dias; o painel destaca nos últimos 7. Venceu: volta ao gratuito sem perder dados.
- Ordem do plano vigente: assinatura no cartão > período pago > bônus (cortesia) > gratuito. Quem assina no cartão durante um período pago tem a 1ª cobrança no fim do período. Reembolso e contestação encerram o período na hora.
- Tabela `premium_passes` sem acesso direto (só funções); limite de 10 tentativas por dia por conta.

### ADR-038 — Alerta ativo por monitor externo (KI-030)
**Data:** 08/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- Workflow *Monitor* no GitHub Actions a cada 30 min (fora do Supabase e da Vercel, para avisar mesmo quando eles caem): site, Auth e a função pública `system_health()`.
- `system_health()` devolve só sim/não por verificação (sem contagens, nomes ou dados): rotinas sem falha em 24 h, conciliação e limpeza recentes, nenhuma rotina travada, Webhook sem erros em série e sem avisos parados.
- Aviso por e-mail do próprio GitHub (execução com falha) e por alerta em *Issues*, fechado sozinho quando normaliza. Sem segredos no workflow: só a chave pública. Canal por WhatsApp fica para depois, se o volume pedir.

### ADR-037 — Premium por cortesia
**Data:** 08/11/2026 · **Status:** aceita (pedido do responsável: liberar o Premium para a conta admin)
- O administrador libera um plano Premium sem cobrança para uma conta, em /admin → Usuários → detalhe → "Premium por cortesia", com motivo auditado e prazo opcional (vale até o fim do dia escolhido, horário de Brasília). Uma cortesia em vigor por conta; trocar encerra a anterior. A pessoa recebe aviso.
- Ordem do plano vigente: assinatura paga > cortesia > gratuito. A cortesia tem os benefícios e limites do plano escolhido no catálogo, com o nome "(cortesia)" e preço zero. Não gera fatura, pagamento nem cobrança no Mercado Pago.
- Fim do bônus: avisos 7 dias antes, 1 dia antes e quando termina (só para quem não assinou); a conta volta sozinha ao gratuito, sem cobrança. Quem assina durante o bônus tem a 1ª cobrança do Mercado Pago marcada para o dia em que o bônus termina (`auto_recurring.start_date`); até lá a assinatura fica "pendente" e o Premium segue pelo bônus.
- Uso previsto: conta da equipe, parceiros, oficinas convidadas e testes. Tabela `premium_grants` sem acesso direto (só por funções).

### ADR-036 — Direitos do titular: cópia dos dados, pedidos e exclusão por anonimização (LGPD art. 18; PRD 15.6)
**Data:** 08/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável; texto jurídico pendente de revisão)
- Em "Minha conta" o usuário baixa a cópia dos seus dados (JSON: conta, motos atuais com placas, km, manutenções e lembretes, motos anteriores, diário, links, transferências, oficinas, assinaturas, faturas, pagamentos, avisos e pedidos). Ficam de fora caminhos de arquivo, códigos de links, chassi (cifrado) e dados de terceiros.
- Pedidos de exclusão, correção, acesso ou outro: o usuário abre (até 3 em andamento), acompanha e cancela enquanto pendente. A equipe responde em /admin/privacidade com motivo auditado; o titular recebe aviso.
- Exclusão = **anonimização**: o histórico pertence à moto (PRD 10), então a conta não é apagada do Auth. Apaga nome, e-mail, telefone, diário e fotos do diário, avisos, lembretes e pedidos de placa; bloqueia o login. Mantém, sem identificação, histórico das motos, transferências, cobranças e auditoria (obrigação legal). Só depois de transferir ou arquivar as motos, encerrar assinatura e sair de oficinas.
- Tabela `privacy_requests` sem acesso direto (só por funções). Procedimento e bases legais em `docs/LGPD.md`.

### ADR-035 — Limite de consultas anônimas por conexão (KI-003)
**Data:** 08/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- Passaporte público e passaporte compartilhado: até 120 consultas por hora por conexão, cada um com o seu limite (configurações `public_passport_views_per_hour` e `shared_passport_views_per_hour`).
- A conexão é identificada pelo IP que o Supabase repassa, transformado num resumo SHA-256 com uma chave secreta do Vault **e a data do dia**. O IP nunca é guardado; o mesmo visitante gera resumos diferentes em dias diferentes. Registros com mais de 2 dias são apagados (LGPD: mínimo necessário).
- Consulta recusada não soma na contagem. A tela mostra "Muitas consultas seguidas", sem dizer se o passaporte existe.
- Sem cabeçalho de IP (chamadas internas), não há limite. Limite na borda (CDN) continua possível depois, se o volume pedir.

### ADR-034 — Comprovantes abertos pelo link de compartilhamento (PRD 11; KI-022)
**Data:** 08/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- Com "Mostrar comprovantes" marcado, quem tem o link abre as notas fiscais, ordens de serviço e recibos **dos serviços vigentes** da moto. Fotos do diário, arquivos sem serviço e comprovantes de registros anulados ou substituídos nunca saem pelo link.
- O link informa só o id e o tipo de cada comprovante (nunca o caminho no Storage). A Edge Function `shared-file` (sem login) pede ao banco o arquivo; o banco confere o link (vigente, não revogado, criado pelo titular atual, moto ativa), as opções e o vínculo do arquivo, aplica limite de 60 aberturas por link por hora e registra cada abertura (sem dados do visitante). A função devolve um link temporário de 60 segundos.
- O texto da opção no painel passou a dizer claramente que os arquivos serão abertos por quem tiver o link.

### ADR-033 — Conferência do conteúdo dos arquivos no servidor (KI-018)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- Entre o envio ao Storage e o registro, o site chama a Edge Function `attachment-check` (com login). Ela confere que o arquivo é do próprio usuário, ainda não registrado, que a extensão bate com o tipo declarado e que os primeiros bytes têm a assinatura do formato (JPG, PNG, WebP, PDF). Se não bater, apaga o arquivo.
- O resultado vai para `attachment_checks` (fechada ao navegador, gravada só pela função). Um gatilho em `attachments` só aceita registrar arquivo **conferido, com o mesmo tipo, nas últimas 2 horas** — não dá para pular a conferência chamando as funções de registro direto.
- Não substitui antivírus; reduz o risco de arquivo disfarçado (ex.: executável com nome .jpg). Arquivos são servidos só por link temporário e baixados, nunca executados pelo site.

### ADR-032 — Chassi cifrado em coluna (D-T3)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- Decisão D-T3: **cifrar**. `chassis_enc = pgp_sym_encrypt(chassi, chave, aes256)`; a chave (32 bytes aleatórios) é gerada no banco e guardada no Vault. Regra no banco impede chassi em texto aberto (`chassis is null` sempre); um gatilho cifra o valor recebido no cadastro.
- Acesso só do titular atual, por `get_my_chassis` / `set_my_chassis`; leitura e escrita direta na tabela revogadas, inclusive para o próprio titular e para o admin. Transferência: o novo dono passa a ver, o anterior deixa de ver (testado).
- Vazamento de banco ou backup não expõe chassis (o backup não leva o Vault). Em compensação, **a chave precisa ser guardada junto com a chave do backup**; sem ela, uma restauração em outro projeto perde os chassis (OPERATIONS.md §1 e §3).
- A varredura de segurança passou a checar escrita por coluna, com lista permitida (perfil, dados da moto, perfil da oficina).

### ADR-031 — Central de notificações gerada no banco (PRD 12)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- Avisos internos no site para todos os eventos do PRD 12: pedido/decisão/revogação de oficina, novo serviço de oficina, transferência (recebida e respondida), lembretes, fim do Premium, pagamento confirmado, falha/atraso de pagamento, espaço quase cheio, respostas da verificação de placa e aviso administrativo (com motivo, auditado).
- Gerados **no banco** (gatilhos nas tabelas do evento + rotina diária às 08:07), não pelo navegador: não dá para forjar aviso, e nenhum fluxo esquece de avisar. Falha ao gerar aviso nunca desfaz a ação principal.
- Cada um só lê os próprios avisos (funções `get_my_*`); tabela fechada. Repetição evitada por chave do evento. Avisos lidos há mais de 180 dias são apagados.
- Preferências: só os avisos opcionais (lembretes, espaço, fim do Premium, serviços de oficina) podem ser silenciados; os essenciais não. A opção "por e-mail" é gravada (`email_pending`) para quando houver provedor de e-mail — **o PRD não exige e-mail no MVP**; ativar é decisão do responsável (provedor e custo).
- O aviso ao titular sobre possível venda (verificação de placa) continua sem identificar o solicitante.

### ADR-030 — Verificação em duas etapas obrigatória para administradores (PRD 15.1)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- `is_admin()` só vale com sessão verificada em duas etapas (claim `aal` = `aal2` do Supabase Auth). Como toda autorização administrativa passa por ela (funções `admin_*`, políticas RLS de admin, Edge Functions com login de admin), a regra vale no banco, não só na tela. Token sem `aal` conta como `aal1`.
- Método: TOTP (aplicativo autenticador), nativo do Supabase Auth, sem custo e sem SMS.
- No site, o admin que ainda não ativou vê o QR Code; quem já ativou digita o código ao entrar em `/admin`. Usuário comum não vê diferença.
- Recuperação (celular perdido): remover o fator no painel do Supabase (Authentication → Users) e ativar de novo. Rollback de emergência existe, mas volta a liberar a administração só com senha.

### ADR-029 — Rotinas automáticas por pg_cron + Edge Function (PRD 8.3, 7.6, 20)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- **Conciliação com o Mercado Pago a cada 6 horas** (KI-024) e **limpeza diária de arquivos sem vínculo** (KI-029), mesmas regras das ações manuais. Sem token do Mercado Pago, a conciliação fica como "pulada".
- O `pg_cron` chama a Edge Function `scheduled-jobs` via `pg_net`. A autenticação é um segredo de 64 caracteres **gerado no próprio banco** e guardado no Vault: ninguém o digita nem o vê; a função o confere no banco. Sem login de usuário (verify_jwt desligado), sem dados no corpo além do nome da rotina.
- Cada execução vai para `job_runs` (sem dados pessoais nem segredos); uma por vez; execução presa há mais de 1 hora é encerrada como falha. O painel admin mostra a última execução e as falhas em 24 h.
- Limpeza automática é auditada com autor vazio (sistema) e o motivo fixo.
- O endereço das funções fica em `functions_base_url` (não público), para atualizar numa restauração em outro projeto.

### ADR-028 — Backup, restauração e rollback (PRD 18.4, 20)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- **Backup diário** pelo GitHub Actions (local separado do Supabase): só **dados** (`public`, `auth.users/identities`, `storage.buckets/objects`), estrutura do `public` como referência e todos os arquivos do bucket. Retenção de 30 dias.
- **Criptografia com chave pública (age):** o servidor de backup não consegue abrir o que guarda. Escolhido em vez de senha compartilhada porque o repositório é público e porque uma senha precisaria ficar no próprio GitHub.
- **Restauração = migrações do Git + dados do backup**, com gatilhos desligados na carga. Um dump só do `public` perderia as políticas de `storage.objects` e o gatilho de `auth.users`; um dump completo do banco não é restaurável num projeto Supabase novo (schemas gerenciados).
- Segredos do Vault ficam fora do backup e são recadastrados no painel admin.
- **Rollback:** preferência por correção para frente; scripts `supabase/rollback/*.down.sql` para as migrações da Fase 6, testados (desfaz → confere → reaplica). Rollback nunca reabre falha de segurança já corrigida.
- **Teste de restauração** automático em banco de teste em toda regressão; com backup real a cada 3 meses, num projeto separado.

### ADR-027 — Estratégia de testes e regressão (PRD 19)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- **Segurança e regras:** no banco, onde a proteção existe (RLS, funções, gatilhos). Suítes por fase em PostgreSQL local com simulação do Supabase e, para cada fase, uma versão no Supabase real dentro de transação desfeita.
- **Varredura por catálogo** (`sweep_violations.sql.inc`): falha se houver tabela sem RLS, escrita direta liberada, leitura anônima fora da lista, visão que ignora RLS, SECURITY DEFINER sem `search_path`, função liberada a anônimo fora da lista, função de servidor exposta, função `admin_*` sem checagem de admin, bucket público ou política para anônimo fora da lista. O próprio teste prova que cada regra detecta a brecha. Listas permitidas só mudam com decisão registrada.
- **Ponta a ponta da interface:** navegador real contra o build, com o Supabase simulado por interceptação de rede (o ambiente do Claude não alcança o Supabase, KI-009). Confere que cada perfil conclui seu fluxo, que a interface chama o backend certo, sem erro de JavaScript e sem rolagem lateral no celular.
- **Com serviços reais:** roteiro manual em `docs/HOMOLOGATION.md`, executado na homologação (6.6).
- **Regressão:** `scripts/validation/run_all.sh` antes de cada publicação.

### ADR-026 — Armazenamento: o banco decide, a Edge Function apaga (PRD 7.6)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- Consumo vem dos metadados do bucket privado e de `attachments`. Espaço do titular segue a mesma regra da cota (motos atuais, sem arquivos de oficinas, diário só do próprio autor). Alerta a partir de `storage_alert_percent` (padrão 80%).
- "Sem registro" = objeto no bucket sem linha em `attachments`. Dentro de `storage_orphan_retention_hours` (padrão 24 h) é envio em andamento e nunca é apagado; depois disso é "sem vínculo". Arquivo ligado a registro nunca é apagado (o histórico é imutável).
- O Supabase bloqueia apagar objetos pelo SQL. A limpeza é em duas etapas: `admin_plan_storage_cleanup` (com o token do admin: valida, exige motivo, grava o plano e a auditoria; uma limpeza por vez) e a Edge Function `storage-cleanup`, que apaga só os caminhos do plano pela API de Storage e conclui com `storage_cleanup_finish` (service_role), que só conta o que estava no plano.
- Limpeza é manual por enquanto; agendamento automático fica para depois (KI-029).

### ADR-025 — Pedidos de verificação de placa: análise humana, aviso anônimo, sem transferência forçada (ADR-007)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- Quem tenta cadastrar uma placa já ativa vê só o próprio pedido (placa, situação, resposta); nunca a moto, o titular ou o histórico existentes. Pode complementar a explicação e cancelar enquanto pendente.
- O admin vê a fila com o contexto necessário (moto, titular atual, idade da conta do solicitante, e-mail mascarado), responde ao solicitante (texto obrigatório) e decide aprovar ou recusar com motivo de 10 a 500 caracteres, auditado. Pedido encerrado não é decidido de novo.
- "Aprovado" não move a moto: a transferência continua sendo feita pelo titular (ADR-018). O admin pode avisar o titular atual; o aviso aparece no painel dele, sem nome nem contato do solicitante, e pode ser dispensado. Aviso só vale para quem é titular desde antes do aviso (troca posterior de dono não herda avisos antigos).
- Transferência sem a participação do dono anterior segue pendente de decisão do responsável (P-7).

### ADR-024 — Configurações por catálogo e auditoria em duas camadas (PRD 7.7, 7.8)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- **Correção de segurança:** o admin podia alterar `system_settings` direto pela API (política de RLS), inclusive ligar `billing_enabled` sem as checagens do ADR-020. A escrita direta foi revogada; configurações mudam só por `admin_update_setting`.
- Catálogo (`setting_spec`) define o que é editável, o tipo (inteiro com faixa, e-mail, WhatsApp) e o grupo na tela. Valores são validados e normalizados no servidor; alteração exige motivo e é auditada (antes/depois). Valor igual não gera registro. `billing_enabled` continua só pela tela de Pagamentos; chaves antigas (KI-023) não aparecem.
- Auditoria: a busca (`admin_search_audit`, filtros por tipo, ação, autor, moto, oficina, período; paginação por id) mostra só metadados e o motivo. O conteúdo antes/depois pode ter dados privados: abrir exige motivo e grava `admin_viewed_audit`.

### ADR-023 — Administração com motivo obrigatório e bloqueio pelo Auth (PRD 7.1–7.3, 7.7)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- Indicadores do painel numa só função (`admin_get_metrics`). Receita recorrente mensal considera só assinaturas de produção com direito vigente (semestral ÷ 6, anual ÷ 12).
- Lista de usuários mostra e-mail mascarado. Ver dados de uma conta (e-mail, telefone, motos com placa, assinatura) exige motivo de 10 a 500 caracteres e grava `admin_viewed_user` na auditoria.
- Suspender/bloquear/reativar conta e oficina, e mudar a verificação de oficina, exigem motivo e ficam auditados com situação anterior e nova. Conta suspensa ou bloqueada recebe `banned_until = infinity` no Supabase Auth: não entra de novo; sessão aberta termina quando o token de acesso vence (até 1 hora). Administradores não podem ser suspensos por essa tela nem suspender a si mesmos.
- Nenhuma ação administrativa altera motos, histórico, pagamentos aprovados ou registros de oficina. Oficina suspensa/bloqueada para de operar pelas regras já existentes (`is_org_active`).
- "Suspensa" e "bloqueada" têm o mesmo efeito técnico hoje; a diferença é de registro (temporária × definitiva).

### ADR-022 — Faturas por ciclo e recibo interno (PRD 8.6)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- `invoices` registra cada ciclo: ao aprovar um pagamento, a fatura mais antiga em aberto é quitada (ou criada já paga) com o período concedido, e abre-se a fatura do ciclo seguinte com vencimento no fim do período pago. Cobrança recusada marca a fatura como "cobrança não aprovada" e conta tentativas (um aviso repetido não conta duas vezes). Reembolso/contestação mudam a fatura paga; assinatura cancelada ou encerrada cancela as faturas em aberto (gatilho).
- Número legível sequencial `MP-AAAA-000001`. A sequência não volta atrás em transações desfeitas, então pode haver números pulados (aceitável; não é numeração fiscal).
- Recibo do usuário (`/painel/plano/recibo/:id`): comprovante interno, imprimível, com aviso "não é nota fiscal". Emissão de NFS-e fica fora do escopo até decisão contábil (KI-027).
- Faturas não são editadas nem excluídas; admin só consulta.

### ADR-021 — Benefícios Premium configuráveis, lembretes e relatório imprimível (PRD 4.3, 5.8, 5.9)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; revisável)
- Cada plano tem **recursos** (`entitlements`: `pdf_reports`, `maintenance_reminders`) e um **limite de links de compartilhamento ativos por moto** (`max_share_links`), editáveis no admin (função própria `admin_set_plan_benefits`, com versão e auditoria). A assinatura guarda os recursos contratados. Valores iniciais: gratuito 3 links e nenhum recurso; Premium 10 links, relatórios e lembretes (provisório, P-1). "Compartilhamento avançado" = mais links simultâneos.
- **Lembretes:** por km, por intervalo de meses ou por data (o que vencer primeiro). Intervalos sempre informados pelo usuário — o sistema não sugere intervalos técnicos. Situação calculada (`ok`, `soon`, `due`, `paused`, `done`): "em breve" a 15 dias ou a 10% do intervalo (mínimo 300 km). Concluir reinicia a contagem e **não** cria registro no histórico. Só o titular atual vê os seus; quem compra a moto não herda os lembretes do antigo dono. Sem Premium: continua vendo, concluindo, pausando e excluindo, mas não cria nem edita.
- **Relatório:** página de impressão (`/painel/motos/:id/relatorio`) com estilo A4; o usuário salva como PDF pela janela de impressão do navegador/celular. Não há biblioteca de PDF no projeto e a instalação de pacotes está bloqueada neste ambiente; a página de impressão funciona em qualquer navegador e mantém o texto selecionável. Cada geração é registrada (`motorcycle_reports`) e recebe uma referência impressa. Nunca inclui dados pessoais nem chassi; valores, observações e placa são opcionais; registros anulados e substituídos ficam fora; aviso de que não é laudo nem certificado.
- Alternativa adiada: PDF gerado no servidor (Edge Function) — reavaliar se for preciso enviar o arquivo por e-mail ou anexá-lo automaticamente.

### ADR-020 — Assinaturas pelo Mercado Pago: estado confirmado no servidor (PRD 8)
**Data:** 07/11/2026 · **Status:** aceita (decidida pelo Claude dentro da autonomia dada pelo responsável; políticas comerciais provisórias até P-3, P-4 e P-5)
- **Modelo (P-5, provisório):** assinatura avulsa do Mercado Pago (`/preapproval`, sem plano no provedor), criada pela Edge Function `mercadopago-billing` com o preço e a periodicidade contratados; o usuário paga na página segura do Mercado Pago (`init_point`). Assim o preço fica gravado em cada contrato e o catálogo continua só no nosso banco.
- **Fonte da verdade:** o Premium só é liberado quando uma cobrança aparece como aprovada **na API do Mercado Pago**. O retorno do navegador só dispara uma consulta; o Webhook (`mercadopago-webhook`, sem login, protegido pela assinatura HMAC) também só dispara consulta. Cada cobrança aprovada concede um período uma única vez (`period_granted`), então avisos repetidos não duplicam nada.
- **Estados:** assinatura `pending → active → past_due/paused → canceled/expired`, `rejected` quando o checkout falha; pagamento `pending/approved/rejected/canceled/refunded/charged_back`.
- **Políticas provisórias:** tolerância de 7 dias após cobrança recusada (`billing_grace_days`, P-3); cancelamento mantém o Premium até o fim do período pago, sem reembolso proporcional (P-4); reembolso ou contestação encerram o Premium na hora. Direito de arrependimento (7 dias, CDC art. 49) atendido manualmente pelo suporte até haver fluxo próprio (KI-025).
- **Rebaixamento:** ao voltar ao gratuito, nada é apagado; o usuário só não cadastra motos nem anexos acima do limite.
- **Conciliação:** botão "Conciliar agora" no admin consulta cada assinatura em andamento no Mercado Pago. Execução automática periódica fica pendente (KI-024).
- Liberação da contratação (`billing_enabled`) só pelo admin e só com token testado e assinatura do Webhook cadastrada.

### ADR-019 — Credenciais do Mercado Pago gerenciadas pelo administrador (PRD 8, 15.2)
**Data:** 07/11/2026 · **Status:** aceita (pedido do responsável: trocar de conta do Mercado Pago pelo painel, sem mexer em código)
- Token de acesso e assinatura secreta do Webhook são cadastrados na página "Pagamentos" do admin e guardados **criptografados no Supabase Vault**. A tabela `payment_gateway_settings` guarda só a referência, os 4 últimos caracteres, o ambiente (teste/produção), a chave pública e o resultado do último teste.
- O navegador só envia os segredos; nenhuma função devolve o valor (nem ao admin). Leitura só por funções restritas ao servidor (`service_role`), usadas pelas Edge Functions.
- Campo em branco mantém o segredo atual. Trocar token ou ambiente apaga a verificação da conta e exige novo "Testar conexão" (Edge Function `mercadopago-check`, que consulta `/users/me` e exige conta do Brasil). A tela pede confirmação antes de trocar de conta.
- Toda gravação é auditada sem os segredos (só "token alterado: sim/não").
- Consequência para a 5.2: cada assinatura guardará a conta do Mercado Pago em que foi criada; trocar de conta não migra assinaturas existentes (elas continuam sendo cobradas na conta anterior até acabarem ou serem canceladas). Tratar no Webhook e no painel quando as assinaturas existirem.
- Alternativa descartada: segredos das Edge Functions (exigiriam acesso ao painel do Supabase a cada troca).

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
| D-T3 | ~~Criptografia em coluna do chassi~~ — **decidido: cifrar (ADR-032, v0.30.0)** | — | — |

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
