# CHANGELOG — Moto Passaporte

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versionamento semântico (`MAJOR.MINOR.PATCH`).

## [Não publicado]

### Operação
- Conta do responsável pelo produto recebeu o papel `admin` (inserção interna em `user_roles`, auditada).
- `support_whatsapp` configurado; a página de contato passa a exibir o WhatsApp.
- Primeiro cadastro real em produção confirmado de ponta a ponta (e-mail, perfil, aceite dos termos, papel).

## [0.41.0] — 08/11/2026 — App instalável e notificações no celular

### Adicionado
- PWA: ícone na tela inicial (Android e iPhone), abre em tela cheia, página "Sem conexão", aviso "Nova versão disponível · Atualizar" e convite para instalar no painel. Página /instalar com o passo a passo do iPhone e do Android (ADR-040).
- Notificações no celular, mesmo com o app fechado: card "Avisos no celular" em Notificações (ativar, enviar teste, aparelhos da conta, remover) e convite no painel depois da primeira moto. Coluna "No celular" nas preferências.
- Envio pela Edge Function `push-send` (Web Push padrão, sem serviço pago), silêncio das 22h às 8h exceto pedidos de oficina, limpeza automática de aparelhos que saíram.
- Número de avisos no ícone do app (quando o aparelho permite); o sino atualiza na hora quando chega um aviso com o app aberto.

### Testes
- Criptografia e assinatura VAPID conferidas contra a implementação de referência (descriptografia como o celular faria). Supabase real: cadeia completa aviso → função → servidor de push do Google → aparelho inexistente removido; padrões por tipo, preferência desligada, silêncio, bloqueio do navegador. Navegador real: service worker ativo, manifesto e ícones, página sem conexão e fluxo "Atualizar". Tela: 6 novos (204).

### Rollback desta versão
- `supabase/rollback/20261108172328_web_push.down.sql` (ler o topo) e publicar o site anterior. Quem já instalou continua com o ícone, que abre o site normal.

## [0.40.0] — 08/11/2026 — Pix, débito e boleto

### Adicionado
- Em "Meu plano", cada Premium tem dois botões: **Cartão de crédito** (assinatura automática, como antes) e **Pix, débito ou boleto** (paga o período à vista pelo Mercado Pago, sem cartão salvo) — ADR-039.
- Avisos do período pago: 30 dias (semestral e anual), 15, 7, vence hoje e venceu. "Meu plano" mostra "Premium pago até…", com "Renovar agora" perto do fim; o painel destaca nos últimos 7 dias. Renovar antes soma ao período atual.
- Histórico "Pagamentos por Pix, débito ou boleto" para o usuário (com "Continuar pagamento" se ficou pela metade) e lista em /admin/assinaturas.
- Edge Functions: `mercadopago-billing` v3 (`pay_pass`, `sync_pass`), `mercadopago-webhook` v2 e `scheduled-jobs` v2 (confere pagamentos avulsos pendentes).

### Testes
- Supabase real (com desfazer): preparar, valor menor recusado, pagamento aplicado e idempotente, renovação somando, avisos 30/15/hoje/venceu, volta ao gratuito, recusado e bloqueio do navegador nas funções de servidor. Tela: 3 novos (198).

### Rollback desta versão
- `supabase/rollback/20261108165626_premium_passes.down.sql` (ler as instruções no topo: conceder bônus a quem já pagou) e publicar o site e as Edge Functions anteriores.

## [0.39.0] — 08/11/2026 — Fim do bônus sem surpresa

### Adicionado
- Avisos do bônus Premium: 7 dias antes, 1 dia antes e quando termina, com convite para assinar (ADR-037).
- "Meu plano" mostra até quando vai o bônus e que, assinando agora, a primeira cobrança só acontece quando ele terminar.

### Alterado
- Assinar durante o bônus: a 1ª cobrança do Mercado Pago fica para o dia em que o bônus termina (antes era cobrada na hora). Edge Function `mercadopago-billing` v2.

### Testes
- Supabase real (com desfazer): aviso de 7 dias com a data certa, sem repetir, aviso de fim, volta ao gratuito, data da 1ª cobrança e `bonus_until`. Tela: 2 novos (195).

### Rollback desta versão
- Reaplicar as definições anteriores de `get_my_plan`, `billing_prepare_subscription` e `system_generate_notifications` (migrações `20261107194520`, `20261107153512`/`20261107225331`) e publicar a versão anterior da Edge Function.

## [0.38.1] — 08/11/2026 — Bônus Premium direto na lista

### Alterado
- Botão "Bônus Premium" em cada conta da lista de usuários: libera de 1 a 6 meses sem precisar abrir os dados pessoais (não exige o motivo de consulta; a concessão continua auditada).

## [0.38.0] — 08/11/2026 — Bônus Premium em um clique e atualização automática

### Adicionado
- /admin → Usuários → detalhe → "Bônus Premium (sem cobrança)": botões de 1 a 6 meses com confirmação (um clique + confirmar), além de "Outro prazo" e "Retirar bônus". Com bônus em vigor, os meses são somados ao fim do bônus atual. Motivo gravado automaticamente na auditoria (ADR-037).

### Corrigido
- Aba aberta durante uma publicação nova mostrava "Unexpected Application Error / Failed to fetch dynamically imported module". Agora o site recarrega sozinho uma vez para pegar a versão nova; outros erros mostram uma tela amigável com "Recarregar".

### Testes
- 6 novos (soma de meses com fim de mês, bônus de 3 meses com confirmação, erro de versão antiga, tela de erro amigável): 193 no total.

## [0.37.0] — 08/11/2026 — Alerta ativo

### Adicionado
- Workflow *Monitor* (a cada 30 min): site, login e saúde do banco/rotinas/Webhook; em falha, e-mail do GitHub e alerta em *Issues*, fechado sozinho ao normalizar (ADR-038; KI-030).
- Função pública `system_health()` (só sim/não por verificação, sem dados).

### Rollback desta versão
- `supabase/rollback/20261108162247_system_health.down.sql` e apagar `.github/workflows/monitor.yml`.

## [0.36.0] — 08/11/2026 — Premium por cortesia

### Adicionado
- /admin → Usuários → detalhe: "Premium por cortesia" para liberar ou retirar um plano Premium sem cobrança, com prazo opcional e motivo auditado; a pessoa recebe aviso (ADR-037).

### Operação
- Conta do administrador com Premium anual por cortesia, sem prazo.

### Testes
- Supabase real (com desfazer): permissões fechadas, plano gratuito e data passada recusados, troca de cortesia, plano exibido como "Premium anual (cortesia)" e volta ao gratuito ao retirar.

### Rollback desta versão
- `supabase/rollback/20261108161839_premium_grants.down.sql` e publicar o site anterior.

## [0.35.0] — 08/11/2026 — Direitos do titular (LGPD)

### Adicionado
- Aba "Minha conta" (/painel/conta): dados da conta, botão "Baixar cópia dos meus dados" e pedidos de privacidade (exclusão, correção, acesso, outro), com acompanhamento e cancelamento (ADR-036).
- /admin/privacidade: fila de pedidos, resposta ao titular com motivo auditado e exclusão por anonimização com conferências (motos, assinatura, oficina, transferência pendente).
- `docs/LGPD.md`: dados tratados, finalidades, bases legais, retenção e procedimento de atendimento (rascunho para revisão jurídica).

### Operação
- `support_email` definido (KI-015). MFA do administrador ativado. Contratação pelo site liberada após teste de conexão com sucesso em produção.

### Testes
- Banco local: 38 verificações (phase6m). Supabase real (com desfazer): permissões fechadas para visitantes, RLS ligado, cópia com 17 blocos, criar/listar/cancelar pedido e bloqueio da anonimização de pedido que não é de exclusão.

### Rollback desta versão
- `supabase/rollback/20261108161525_privacy_rights.down.sql` e publicar o site anterior.

## [0.34.0] — 08/11/2026 — Limite de consultas anônimas

### Segurança
- Passaporte público e compartilhado: até 120 consultas por hora por conexão; acima disso, "Muitas consultas seguidas". Só um resumo do IP com chave diária é guardado, por até 2 dias (ADR-035; KI-003).

### Testes
- Banco local: 12 verificações novas (26 suítes). Supabase real: 6 (limite, compartilhado com limite próprio, outra conexão liberada, IP não guardado, contagens fechadas) e uma consulta real pela API pública contada pelo limite. Tela: 3 novos (181).

### Rollback desta versão
- `supabase/rollback/20261108032719_public_rate_limit.down.sql` e publicar o site anterior.

## [0.33.0] — 08/11/2026 — Comprovantes pelo link de compartilhamento

### Adicionado
- No passaporte compartilhado com "Mostrar comprovantes", cada nota fiscal, ordem de serviço ou recibo tem o botão "Abrir", que abre o arquivo numa nova aba por link temporário de 60 segundos (ADR-034; KI-022).
- Edge Function `shared-file`, função `shared_attachment_for_download` (service_role), registro `passport_share_file_views` e limite `share_file_views_per_hour` (60).

### Alterado
- Opção do link renomeada para "Mostrar comprovantes", com aviso de que os arquivos serão abertos por quem tiver o link.
- Configurações `free_plan_max_motorcycles` e `free_plan_storage_quota_mb` marcadas como não usadas (KI-023).

### Testes
- Banco local: 14 verificações novas (25 suítes). Supabase real: 7 (link com id sem caminho, visitante sem acesso à função interna, abre, sem opção, arquivo sem serviço, link revogado, registro da abertura); Edge Function real responde 404 para link inexistente ou inválido. Tela: abrir comprovante e erro (178).

### Rollback desta versão
- `supabase/rollback/20261108025543_shared_files.down.sql`, remover a Edge Function `shared-file` e publicar o site anterior.

## [0.32.0] — 08/11/2026 — Arquivos conferidos no servidor

### Segurança
- Cada arquivo enviado é conferido no servidor (Edge Function `attachment-check`): dono, tipo declarado e assinatura dos primeiros bytes. Arquivo disfarçado é recusado e apagado (ADR-033; KI-018).
- O banco só registra anexo conferido com o mesmo tipo nas últimas 2 horas (gatilho `attachments_require_check`).

### Desempenho
- Índices nos vínculos `attachment_checks.checked_by`, `storage_cleanups.requested_by` e `subscription_plans.updated_by` (aviso do Supabase).

### Testes
- Banco local: 9 verificações novas (24 suítes). Supabase real: 8 (sem conferência, conteúdo errado, tipo trocado, conferência vencida, autoaprovação bloqueada, conferido registra). Varredura: 0 violações. Backup/restauração/rollback com as 10 migrações da Fase 6: 15 verificações.

### Rollback desta versão
- `supabase/rollback/20261107231202_attachment_checks.down.sql`, remover a Edge Function `attachment-check` e publicar o site anterior. Índices: ver cabeçalho de `20261108024810_fk_indexes.sql`.

## [0.31.0] — 07/11/2026 — Site mais leve

### Desempenho
- Painel, oficina, administração, relatórios e páginas compartilhadas carregam sob demanda (33 páginas). Primeira carga: 207 kB comprimidos (antes 277 kB) (KI-010).

### Rollback desta versão
- Só o site: voltar o deploy anterior na Vercel.

## [0.30.0] — 07/11/2026 — Chassi cifrado

### Segurança
- Chassi guardado cifrado (AES-256, chave no Vault); nenhum chassi em texto aberto no banco nem nos backups. O chassi já cadastrado em produção foi convertido (ADR-032; KI-002).
- Leitura e alteração do chassi só pelo titular atual, por função; acesso direto à tabela revogado.
- Varredura de segurança: nova regra para escrita por coluna fora da lista permitida.

### Testes
- Banco local: suíte da Fase 1 atualizada (+8 verificações de criptografia); 23 suítes. Supabase real: chassi 9 (inclui transferência) e Fase 1 completa 71. Varredura com a regra nova: 0 violações.

### Rollback desta versão
- `supabase/rollback/20261107230107_chassis_encryption.down.sql` (só em emergência: volta o chassi para texto aberto) e publicar o site anterior.

## [0.29.0] — 07/11/2026 — Central de notificações

### Adicionado
- Sino com contador no topo da área logada e página `/painel/notificacoes` (lista, marcar como lidas ao abrir, preferências).
- Avisos automáticos de oficina, serviços, transferências, pagamentos, verificação de placa e rotina diária (lembretes, fim do Premium, atraso, espaço), mais aviso administrativo em `/admin/usuarios` (ADR-031; KI-020).
- Tabelas `notifications` e `notification_preferences`; agendamento diário `moto-passaporte-notifications`.

### Testes
- Banco local: 36 verificações novas, incluindo os avisos gerados pelos fluxos reais das 22 suítes anteriores (todas continuam passando). Supabase real: 9 (transferência real de ponta a ponta). Tela: 2 novos (176). Ponta a ponta: 9 cenários, 41 verificações. Varredura: 0 violações.

### Rollback desta versão
- `supabase/rollback/20261107225331_notifications.down.sql` e publicar o site anterior.

## [0.28.0] — 07/11/2026 — Verificação em duas etapas para administradores

### Segurança
- `is_admin()` exige sessão com verificação em duas etapas (aal2). Sem ela, nenhuma função, dado ou Edge Function administrativa responde (ADR-030; KI-014).
- `/admin` mostra a ativação do aplicativo autenticador (QR Code e chave) ou pede o código.

### Testes
- Banco local: 15 verificações novas (22 suítes). Supabase real: 8 (aal1, sem claim, aal2, usuário comum). Testes antigos do Supabase atualizados para sessões de admin com aal2 (conferido com a suíte 6.1: 4/4). Ponta a ponta: 8 cenários, 35 verificações (ativação com código errado e certo).

### Rollback desta versão
- `supabase/rollback/20261107223918_admin_mfa.down.sql` (só em emergência: volta a administração com senha apenas) e publicar o site anterior.

## [0.27.0] — 07/11/2026 — Preparação do lançamento: rotinas automáticas

### Adicionado
- Conciliação automática com o Mercado Pago a cada 6 horas e limpeza diária de arquivos sem vínculo (`pg_cron` → Edge Function `scheduled-jobs`), com registro em `job_runs` e quadro "Rotinas automáticas" no painel admin.
- Funções `admin_job_status`, `job_run_start`, `job_run_finish`, `scheduled_job_secret_ok`, `system_plan_storage_cleanup`; extensões `pg_cron` e `pg_net`.

### Testes
- Banco local: 17 verificações novas (21 suítes). Supabase real: as duas rotinas executadas de ponta a ponta pelo banco (conciliação "pulada" sem token; limpeza "nada para limpar"); segredo errado recusado (401); varredura sem violações.

### Rollback desta versão
- `supabase/rollback/20261107223027_scheduled_jobs.down.sql` (desliga os agendamentos; conciliação e limpeza voltam a ser só manuais) e remover a Edge Function `scheduled-jobs`.

## [0.26.0] — 07/11/2026 — Fase 6.5: backup, restauração e rollback

### Adicionado
- Workflow `.github/workflows/backup.yml`: backup diário criptografado (age) de dados, contas, metadados e arquivos; inativo até os segredos serem cadastrados.
- `scripts/ops/backup_storage.mjs`: cópia de todos os arquivos do bucket com `MANIFEST.json`.
- `scripts/ops/restore_check.sh`: teste de backup → criptografia → restauração → rollback → reaplicação (13 verificações), incluído em `run_all.sh`.
- Scripts de rollback das migrações da Fase 6 em `supabase/rollback/`.
- Manual de operação: `docs/OPERATIONS.md` (backup, restauração, rollback por camada, monitoramento, ambientes).

### Rollback desta versão
- Só arquivos de operação e documentação; nada no banco ou no site. Desfazer = remover o workflow.

## [0.25.0] — 07/11/2026 — Fase 6.4: testes e regressão

### Adicionado
- Varredura de segurança por catálogo (`tests/security/sweep_violations.sql.inc`), com teste local que prova a detecção de 10 tipos de brecha e versão para o Supabase real (`tests/security/supabase/phase6e_security_sweep.sql`): 0 violações.
- Testes ponta a ponta no navegador (`tests/e2e/run.mjs`, `scripts/validation/run_e2e.sh`): 7 cenários, 29 verificações.
- Regressão completa em um comando: `scripts/validation/run_all.sh`.
- Roteiro de homologação com Supabase e Mercado Pago reais: `docs/HOMOLOGATION.md`.

## [0.24.0] — 07/11/2026 — Fase 6.3: monitoramento de armazenamento

### Adicionado
- `/admin/armazenamento`: espaço total, por categoria e por origem; contas, motos e oficinas que mais usam espaço, com alerta de limite; arquivos sem registro (em andamento × sem vínculo); limpeza com motivo e histórico.
- Edge Function `storage-cleanup` (login de admin) e funções `admin_storage_overview`, `admin_storage_top_users`, `admin_storage_top_motorcycles`, `admin_storage_top_workshops`, `admin_list_unlinked_files`, `admin_plan_storage_cleanup`, `admin_list_storage_cleanups`, `storage_cleanup_finish`; tabela `storage_cleanups`.
- Configurações `storage_orphan_retention_hours` (24 h) e `storage_alert_percent` (80%), editáveis em Configurações.

### Testes
- Banco local: 22 verificações novas (19 suítes). Supabase real (transação desfeita): 10. Frontend: 174.

## [0.23.0] — 07/11/2026 — Fase 6.2: verificação de placa

### Adicionado
- "Meus pedidos de verificação" no painel: situação, resposta da equipe, complemento e cancelamento do pedido.
- Aviso anônimo ao titular atual quando a equipe confirma um pedido procedente, com opção de dispensar.
- `/admin/verificacoes`: fila por situação, contexto da moto e do titular, resposta ao solicitante, decisão com motivo e aviso opcional ao titular.
- Funções `get_my_claims`, `update_my_claim_note`, `cancel_my_claim`, `get_my_ownership_notices`, `dismiss_ownership_notice`, `admin_list_claims`, `admin_resolve_claim`; colunas `owner_notified_at` e `owner_notice_dismissed_at`; auditoria em `motorcycle_claim_requests`.

### Corrigido
- Aviso ao titular não aparecia quando a titularidade e o aviso tinham o mesmo instante (migração `plate_claims_notice_fix`).

### Testes
- Banco local: 23 verificações novas (18 suítes). Supabase real (transação desfeita): 10. Frontend: 172.

## [0.22.0] — 07/11/2026 — Fase 6.1 concluída: auditoria e configurações

### Segurança
- Fechada a escrita direta do admin em `system_settings` (permitia ligar a contratação sem as checagens) — ADR-024.

### Adicionado
- Migração `admin_audit_settings`: `setting_spec`, `admin_list_settings`, `admin_update_setting` (validação, normalização, motivo), `admin_search_audit` (filtros e paginação), `admin_get_audit_entry` (com motivo, auditado), `admin_audit_facets`.
- Páginas `/admin/configuracoes` (contato, limites, regras, cobrança) e `/admin/auditoria` (filtros, "carregar mais", conteúdo com motivo mostrando o que mudou).
- Testes: banco 26 (local) + 9 (Supabase, transação desfeita); interface 167 no total (4 novos).

## [0.21.0] — 07/11/2026 — Fase 6.1: painel administrativo

### Adicionado
- Migração `admin_management` (ADR-023): situação da conta em `profiles`; `admin_get_metrics`, `admin_list_users`, `admin_get_user` (com motivo), `admin_set_user_status` (bloqueia login no Auth), `admin_list_workshops`, `admin_set_workshop_status`, `admin_set_workshop_verification`.
- Painel: indicadores de uso, assinaturas e receita, pendências e armazenamento, com destaque para problemas.
- Páginas `/admin/usuarios` e `/admin/oficinas` com busca, consulta com motivo e ações com motivo.
- Testes: banco 27 (local) + 11 (Supabase, transação desfeita, inclui bloqueio no Auth); interface 163 no total (5 novos).

## [0.20.0] — 07/11/2026 — Fase 5 concluída: faturas por ciclo e recibo

### Adicionado
- Migração `invoices` (ADR-022): faturas por ciclo com número legível, vínculo com o pagamento, tentativas e estados; `billing_apply_payment` mantém as faturas; gatilho cancela faturas em aberto quando a assinatura termina; `get_my_invoices`, `get_invoice_receipt`, `admin_list_invoices`.
- "Meu plano": faturas com vencimento, falhas e link para o recibo; pagamentos renomeados para "Tentativas de pagamento".
- Recibo imprimível (`/painel/plano/recibo/:id`), sem valor fiscal.
- Admin: faturas na página "Assinaturas e avisos".
- Testes: banco 20 (local) + 11 (Supabase, transação desfeita); interface 158 no total.

## [0.19.0] — 07/11/2026 — Fase 5.4: benefícios Premium

### Adicionado
- Migração `premium_benefits` (ADR-021): recursos e limite de links por plano (e na assinatura), `admin_set_plan_benefits`, `maintenance_reminders` com `create/update/complete/delete_reminder`, `set_reminder_paused`, `get_motorcycle_reminders`, `get_my_due_reminders`; `motorcycle_reports` e `register_motorcycle_report`; limite de links de compartilhamento passa a vir do plano.
- Lembretes de manutenção na página da moto e aviso no painel (vencidos e próximos).
- Relatório do histórico para imprimir ou salvar em PDF, com opções (placa, comprovantes, valores, observações) e referência.
- Administração: recursos liberados e links por moto no formulário de planos.
- Testes: banco 48 (local) + 13 (Supabase, transação desfeita); interface 156 no total (12 novos).

### Alterado
- Gratuito: até 3 links de compartilhamento ativos por moto (antes 10 para todos).

## [0.18.0] — 07/11/2026 — Fase 5.2 a 5.5: assinaturas Premium pelo Mercado Pago

### Adicionado
- Migração `subscriptions` (ADR-020): `subscriptions`, `payments`, `payment_events`; funções do servidor `billing_*` (preparar, vincular checkout, aplicar estado da assinatura e do pagamento, registrar avisos, cancelar, alvos de conciliação); `get_my_subscription`, `get_my_payments`, `admin_list_subscriptions`, `admin_list_payment_events`, `admin_set_billing_enabled`; `user_plan` passa a considerar a assinatura com direito vigente (tolerância de atraso configurável).
- Edge Functions `mercadopago-billing` (assinar, conferir, cancelar, conciliar) e `mercadopago-webhook` (valida a assinatura HMAC e consulta a API antes de aplicar). Camada isolada em `supabase/functions/_shared/mercadopago.ts`.
- Painel: assinar o Premium (vai ao Mercado Pago), situação da assinatura, aviso de atraso, cancelamento com confirmação, histórico de pagamentos, confirmação ao voltar do Mercado Pago.
- Administração: liberar/desligar a contratação; página "Assinaturas e avisos" (`/admin/assinaturas`) com conciliação.
- `scripts/validation/check_edge_functions.sh` (tipos das Edge Functions).
- Testes: banco 52 (local) + 17 (Supabase, transação desfeita); interface 144 no total (8 novos); validação da assinatura do Webhook testada.

## [0.17.0] — 07/11/2026 — Fase 5.2 (parte 1): conta do Mercado Pago no painel do admin

### Adicionado
- Migração `payment_settings` (ADR-019): `payment_gateway_settings`, segredos no Supabase Vault, `admin_get_payment_settings`, `admin_save_payment_settings`, funções só do servidor (`payment_access_token`, `payment_webhook_secret`, `record_payment_check`) e `get_payment_public_config` (chave pública só com a contratação liberada).
- Edge Function `mercadopago-check`: testa o token na API do Mercado Pago e guarda a conta conectada.
- Administração: página "Pagamentos (Mercado Pago)" (`/admin/pagamentos`) com ambiente, chave pública, token, assinatura do Webhook, teste de conexão e confirmação ao trocar de conta.
- Testes: banco 29 (local) + 18 (Supabase, transação desfeita, inclui verificação de criptografia no Vault); interface 136 no total (6 novos).

## [0.16.0] — 07/11/2026 — Fase 5.1: planos e preços configuráveis

### Adicionado
- Migração `subscription_plans` (ADR-018): catálogo de planos com histórico imutável de versões e auditoria; `get_public_plans` (site), `get_my_plan` (painel), `admin_list_plans`, `admin_save_plan`, `admin_set_plan_active`, `admin_get_plan_history`; configuração pública `billing_enabled` (desligada).
- Administração: página "Planos e preços" (`/admin/planos`) para editar preço, limites, benefícios, teste grátis, regras de cancelamento e visibilidade, criar planos Premium, ativar/desativar e ver o histórico com o que mudou.
- Site: seção de planos lê preços e limites do cadastro ("Contratação em breve" enquanto o pagamento não estiver liberado).
- Painel: resumo do plano ("1 de 1 moto") e página "Meu plano" (`/painel/plano`) com uso de motos e espaço.
- Testes: banco 35 (local) + 19 (Supabase, transação desfeita); interface 130 no total (10 novos).

### Alterado
- Cadastro de moto, aceite de transferência e cota de anexos usam os limites do plano vigente em vez de configurações soltas.

## [0.15.0] — 07/11/2026 — Fase 4 concluída: compartilhamento controlado

### Adicionado
- Migração `passport_shares` (ADR-017): `passport_shares` (código de 192 bits, opções fixas, validade, revogação, contagem de acessos, auditada), `passport_settings` (página básica desativável), `create_passport_share`, `revoke_passport_share`, `get_motorcycle_shares`, `get_shared_passport` (sem cadastro; nunca expõe dados pessoais, chassi, observações, funcionários ou ids; vale só enquanto quem criou é o titular), `get_passport_settings`, `set_public_page_enabled`; `get_public_passport` respeita a página desativada.
- Página da moto: "Compartilhar com comprador" (criar link com nome, validade e o que mostrar; copiar, QR Code, ver como o comprador, revogar, links encerrados). QR Code da página básica com ativar/desativar.
- Página do comprador `/c/:código`: identificação, Oficina de Origem, resumo de evidências, quilometragem documentada, histórico com selos de origem, valores, tipos de comprovante e diário conforme escolhido; aviso de que não é laudo nem documento oficial.
- Perguntas frequentes atualizadas.
- Testes: banco 36 (local) + 17 (Supabase, transação desfeita); interface 120 no total (8 novos).

## [0.14.0] — 07/11/2026 — Fase 4: transferência do passaporte

### Adicionado
- Migração `transfers` (ADR-016): `transfer_requests` (imutável após a decisão, auditada), `create_transfer_request`, `cancel_transfer_request`, `reject_transfer_request`, `accept_transfer_request` (transação única: troca de titularidade ligada ao pedido, encerramento de todas as autorizações de oficina inclusive Origem, cancelamento de pedidos pendentes, limite do plano de quem recebe), `get_motorcycle_transfers`, `get_my_incoming_transfers`, `get_my_previous_motorcycles`. FK de `motorcycle_ownerships.transfer_id`.
- Página da moto: seção "Vendeu a moto?" com explicação do que acontece, confirmação, pedido em aberto e cancelamento.
- Painel: "Um passaporte foi transferido para você" (dados da moto, quem envia, data da compra, aceitar ou recusar) e "Motos anteriores", com acesso só de leitura ao próprio diário (resolve KI-019).
- Testes: banco 42 (local) + 19 (Supabase, transação desfeita); interface 112 no total (7 novos).

### Alterado
- Perguntas frequentes: resposta sobre venda da moto reflete a transferência disponível.

## [0.13.0] — 07/11/2026 — Fase 3 concluída: serviços registrados pela oficina

### Adicionado
- Migração `workshop_services` (ADR-015): `create_workshop_service` (origem "Confirmado por oficina", oficina e funcionário identificados, km como leitura da oficina, correção só pela própria oficina), `get_workshop_timeline` (histórico técnico; valor, observações, comprovantes e funcionário só dos próprios registros), `register_workshop_attachment` e `get_workshop_storage_usage` (cota de 500 MB por oficina), `maintenance_records.recorded_by_name`, `attachments.organization_id`. Envio e leitura de arquivos pela oficina autorizada; cota do titular não conta comprovantes da oficina.
- Interface da oficina: página da moto autorizada (`/oficina/:orgId/motos/:motoId`) com placa, última leitura e histórico; formulário "Registrar serviço" e correção; anexar comprovante nos próprios registros. Link "Abrir histórico" nas motos autorizadas.
- Titular vê "Registrado por" nos serviços da oficina.
- Textos do site atualizados (perguntas frequentes e painel da oficina) para o que já existe.

### Alterado
- Formulário de registro reaproveitado para a oficina (sem o campo de oficina em texto livre).
- Painel da oficina: seção "Chegando em breve" removida (tudo já disponível).
- Testes: banco 32 (local) + 15 (Supabase, transação desfeita); interface 105 no total (5 novos).

## [0.12.0] — 07/11/2026 — Fase 3: equipe da oficina

### Adicionado
- Migração `workshop_team`: permissões por membro (`can_request_access`, `can_register_services`), `has_org_permission`, convites (`organization_invites`: link de uso único para o e-mail convidado, 7 dias, só hash guardado, até 20 em aberto), `create_org_invite`, `revoke_org_invite`, `get_invite_preview`, `accept_org_invite`, `get_org_members`, `get_org_invites`, `update_org_member`, `remove_org_member`, `leave_organization`. Ninguém altera o próprio papel ou permissões; a oficina sempre mantém um responsável; membros não são excluídos (só removidos). Pesquisa e pedido de acesso passam a exigir a permissão.
- Interface: página **Equipe** da oficina (convidar com permissões, link para copiar ou enviar pelo WhatsApp, alterar papel e permissões, remover, convites em aberto, sair da oficina) e página de aceite do convite (`/convite/:token`). Painel da oficina esconde a pesquisa de quem não tem permissão.
- Testes: banco 44 (local) + 19 (Supabase, transação desfeita); interface 100 no total (8 novos).

## [0.11.0] — 07/11/2026 — Fase 3: Oficina de Origem

### Adicionado
- Migração `origin_workshop` (ADR-014): Oficina de Origem como autorização `origin`, uma ativa por moto, só nos primeiros 30 dias do passaporte (configurável); `request_workshop_access(..., p_origin)`, `decide_workshop_access(..., p_as_origin)`, `set_origin_workshop`; pesquisa e leitura do titular informam se a moto ainda aceita Origem.
- Oficina: opção "Ajudamos a criar este passaporte" ao pedir acesso; selo "Oficina de Origem" nas motos autorizadas.
- Titular: autorizar como Oficina de Origem, autorizar só o acesso ou recusar; definir ou tirar o título de uma oficina autorizada.
- Testes: banco 20 (local) + 13 (Supabase, transação desfeita); interface 92 no total (6 novos).

## [0.10.0] — 07/11/2026 — Fase 3: pesquisa por placa e autorizações

### Adicionado
- Migração `workshop_access`: `plate_search_log` (só hash da placa), `motorcycle_workshop_access` (pendente → autorizada/recusada/cancelada; autorizada → revogada/encerrada; nunca apagada; auditada), `search_motorcycle_by_plate`, `request_workshop_access`, `cancel_workshop_access_request`, `decide_workshop_access`, `revoke_workshop_access`, `get_motorcycle_workshop_access`, `get_my_pending_access_requests`, `get_workshop_access_list`, `workshop_has_access`. Limites configuráveis: 30 pesquisas/hora por pessoa, 100 por oficina, 20 pedidos/dia por oficina, 7 dias de espera após recusa.
- Migração `workshop_access_indexes` (aviso de desempenho do Supabase).
- Painel da oficina: pesquisa por placa (antes da autorização só marca, modelo e ano), pedido com mensagem, cancelamento, motos autorizadas com placa e última quilometragem, pedidos aguardando e histórico.
- Página da moto: seção "Oficinas com acesso" com autorizar, recusar, revogar (com confirmação) e histórico. Painel do dono avisa pedidos pendentes.
- Testes: banco 46 (local) + 22 (Supabase, transação desfeita); interface 86 no total (9 novos). Verificação visual em 360 e 1280 px.

## [0.9.0] — 07/11/2026 — Fase 2 concluída: diário da moto

### Adicionado
- Migração `diary`: `motorcycle_diary` (viagem, primeiro passeio, encontro, acessório, personalização, fotos, outro), privado ou compartilhável (ADR-013), `create_diary_entry`, `update_diary_entry`, `delete_diary_entry`, `delete_diary_photo`, view `motorcycle_diary_feed` (com fotos e `is_mine`, sem expor o autor). Auditoria só com metadados.
- Fotos do diário em `attachments` (`diary_entry_id`): só imagens, até 10 por entrada; leitura segue a visibilidade da entrada; apagadas de fato ao excluir.
- Storage: política de exclusão só para arquivo próprio sem registro (fotos removidas do diário e envios que falharam — reduz KI-017); envio e leitura com regras separadas.
- Cota não conta fotos de diário de outros autores.
- Interface: aba **Diário** da moto com filtro (todas, privadas, compartilháveis), entradas por ano, fotos, editar e excluir com confirmação; formulário com escolha de visibilidade explicada e fotos.
- Testes: banco 44 (local, com venda simulada) + 27 (Supabase, transação desfeita); interface 77 no total (10 novos). Verificação visual em 360 e 1280 px.

## [0.8.0] — 06/11/2026 — Fase 2: anexos e comprovantes

### Adicionado
- Migração `attachments`: bucket privado `attachments` (10 MB, JPG/PNG/WEBP/PDF), tabela `attachments` imutável e auditada, políticas do Storage por pasta da moto (só o dono atual envia e lê; sem troca nem exclusão), `register_attachment` (confere dono, pasta, arquivo enviado pelo próprio usuário, tipo, tamanho e cota), `get_storage_usage`. Cota gratuita de 100 MB e limite por arquivo em `system_settings`.
- `maintenance_timeline` passa a trazer os anexos e o `evidence_level` (oficina > comprovante > dono). O filtro "Origem" usa esse nível.
- Interface: comprovantes no formulário de registro e "Anexar comprovante" em cada registro; até 5 por registro; tipo sugerido pelo nome (nota fiscal, ordem de serviço, recibo, foto). Tipo real conferido pelos primeiros bytes; fotos reduzidas para até 2000 px em JPEG; espaço usado exibido. Miniaturas e abertura por links temporários de 10 minutos.
- Testes: banco 22 (local) + 21 (Supabase, transação desfeita); interface 67 no total (9 novos). Verificação visual em 360 e 1280 px.

### Alterado
- Testes de segurança renomeados com prefixo de ordem (`phase2a_`, `phase2b_`).

## [0.7.0] — 06/11/2026 — Fase 2: linha do tempo e manutenção

### Adicionado
- Migração `maintenance`: `maintenance_records`, `maintenance_items`, 17 categorias do PRD 5.4, `create_maintenance_record`, `void_maintenance_record`, view `maintenance_timeline`. Registros imutáveis com correção e anulação rastreáveis; km do serviço entra no histórico de quilometragem.
- Aba **Histórico** da moto: linha do tempo por ano, selos de origem, peças, valor, oficina, filtros (categoria, origem, oficina, período, versões antigas), corrigir e anular.
- Formulário de registro com sugestão de título pela categoria, peças dinâmicas (até 50) e valor em reais.
- Resumo da moto mostra os últimos registros; abas Resumo/Histórico.
- Testes: banco 29 (local) + 26 (Supabase, transação desfeita); interface 58 no total (11 novos). Verificação visual em 360 e 1280 px.

## [0.6.0] — 06/11/2026 — Fase 1 concluída (base)

### Adicionado
- Perguntas frequentes (`/perguntas-frequentes`), com recursos futuros indicados como "em breve".
- Contato (`/contato`) com canais vindos de `system_settings` (migração `contact_settings`).
- Área logada com troca de contexto: Minhas motos, Minha oficina, Administração (só para admin).
- Oficina: cadastro gratuito (`create_workshop`), painel, edição de perfil (especialidades, horário, descrição, visibilidade), perfil público `/oficinas/:slug`, botão de cadastro na página inicial.
- Administração (`/admin`): indicadores (usuários, motos, oficinas) e atividade recente da auditoria, protegido no banco por RLS.
- Validações: endereço público (slug), CNPJ com dígitos verificadores, telefone com DDD, UF.
- Testes: 47 no total (10 novos). Verificação visual com Supabase simulado, sem erros nem rolagem horizontal.

### Corrigido
- KI-012 (URLs de autenticação) configurado no Supabase.

## [0.5.0] — 06/11/2026

### Adicionado
- Painel do proprietário: cadastro de moto (`/painel/motos/nova`) com validação, placa duplicada → pedido de verificação, limite do plano.
- Página da moto (`/painel/motos/:id`): dados, placa atual e anteriores, troca de placa, chassi mascarado (mostrar/editar), quilometragem com alerta de leitura menor e correção documentada.
- QR Code do passaporte: baixar PNG, copiar link, abrir página pública.
- Passaporte público (`/p/:publicId`): só os campos padrão (ADR-008), aviso de não certificação, `noindex`.
- Módulos `motorcycles` (api, schemas, seções) e `sharing`; utilitários `core/shared` (formatação pt-BR, erros do banco).
- Testes: 37 no total (21 novos) — formatação, validações, erros do banco, tela de cadastro, página pública. Verificação visual com Supabase simulado em 360/390/1280 px, sem erros de console nem rolagem horizontal.
- KI-013 (página pública ainda não revogável — Fase 4).

### Infraestrutura
- Site publicado pela Vercel em https://moto-passaporte.vercel.app (deploy automático da `main`), conectado ao Supabase dev.

## [0.4.0] — 06/11/2026

### Adicionado
- Frontend (Fase 1): Vite + React 19 + TypeScript strict, Tailwind 4, React Router 7, TanStack Query, supabase-js tipado.
- Identidade visual (`docs/DESIGN.md`): paleta de passaporte, Archivo variável, peça central "passaporte de exemplo" com carimbos por origem do registro.
- Site público: página inicial, termos de uso e política de privacidade (rascunhos v0.1, revisão jurídica pendente), página 404.
- Autenticação: criar conta (com aceite de termos e metadados do banco), entrar, recuperar e redefinir senha; mensagens de erro em português; rota protegida.
- Painel do proprietário (base): saudação e lista "Minhas motos" a partir da view `my_motorcycles`.
- `vercel.json` (SPA, cabeçalhos de segurança).
- Testes: 16 (Vitest + Testing Library) — validações, tradução de erros, cadastro com Supabase simulado, página inicial. Verificação visual com Playwright em 360, 390 e 1366 px.
- ADR-011 (interface no repositório) e ADR-012 (Vercel).

### Corrigido
- KI-008 resolvido (instalação de pacotes liberada).
- Plano ordenado da interface da Fase 1 em `PROJECT_STATUS.md`.

## [0.3.1] — 06/11/2026

### Adicionado
- `docs/PRD_CHECKLIST.md`: conferência item a item do PRD por fase.
- Protocolo de trabalho obrigatório em `PROJECT_MEMORY.md` (seção 8): conferir o feito, seguir em ordem, sempre a partir do PRD.
- `docs/API_DOCUMENTATION.md`: contrato frontend ↔ Supabase (Auth, RPCs, view, erros, mensagens).
- `src/types/supabase.ts`: tipos TypeScript gerados do banco (verificados com `tsc --strict`).

## [0.3.0] — 06/11/2026

### Adicionado
- Migrações da Fase 1 aplicadas no Supabase dev (`ripgenhykaajcnzdxoid`).
- Migração `20261107003512_phase1_hardening.sql`: EXECUTE revogado das funções de trigger, políticas RLS com `(select auth.uid())`, 10 índices de chaves estrangeiras.
- Teste para Supabase real em transação desfeita: `tests/security/supabase/phase1_rls_test_rollback.sql` (71 verificações aprovadas).
- Decisões ADR-009 (região us-east-1) e ADR-010 (nomes de migração = versão no Supabase).

### Alterado
- Arquivos de migração renomeados para as versões registradas no Supabase.
- `tests/db/supabase_stub.sql`: colunas `aud` e `role` em `auth.users`.

### Rollback
- Banco sem dados de usuários: reverter = remover os objetos das migrações na ordem inversa. Nenhum dado a restaurar.

## [0.2.0] — 06/11/2026

### Adicionado
- Migrações da Fase 1 (`supabase/migrations/20261106000100` a `000500`): auditoria imutável, perfis e papéis, configurações do sistema, organizações e oficinas, motocicletas com ID permanente, histórico de placas, titularidade, chassi protegido, quilometragem com alerta de inconsistência, pedidos de verificação de duplicidade e passaporte público com campos padrão.
- Funções `register_motorcycle`, `change_motorcycle_plate`, `record_mileage`, `create_workshop`, `get_public_passport`.
- Testes de segurança `tests/security/phase1_rls_test.sql` (73 verificações aprovadas) e simulação do Supabase `tests/db/supabase_stub.sql`.
- Script `scripts/validation/run_db_tests.sh`.
- `docs/DATABASE.md` e `docs/SECURITY.md`.
- Decisões ADR-005 a ADR-008 (Git direto na main, 1 moto no gratuito, duplicidade por placa, campos públicos padrão).

### Rollback
- Banco ainda não aplicado em nenhum ambiente: nenhum rollback de dados necessário.

## [0.1.0] — 06/11/2026

### Adicionado
- PRD v2.0 em `docs/PRD.md`.
- Memória técnica `docs/PROJECT_MEMORY.md`.
- Registro de decisões `docs/DECISIONS.md` (ADR-001 a ADR-004 e decisões pendentes).
- `docs/PROJECT_STATUS.md` e `docs/KNOWN_ISSUES.md`.
- `README.md`, `.gitignore` e `.env.example` iniciais.
