# API_DOCUMENTATION — Moto Passaporte

Contrato entre o frontend e o backend (Supabase). **Fonte da verdade para quem construir a interface** (Lovable ou desenvolvimento direto).
Tipos TypeScript gerados: [`src/types/supabase.ts`](../src/types/supabase.ts) — regenerar após cada migração.

**Projeto:** `https://ripgenhykaajcnzdxoid.supabase.co` (dev)
**Chave no frontend:** somente a chave pública (publishable/anon), via `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca a service role.

---

## Regras para o frontend

1. **Escritas estruturais só por RPC.** O frontend nunca insere diretamente em `motorcycles`, `motorcycle_plates`, `motorcycle_ownerships`, `mileage_records`, `user_roles`, `organizations`, `organization_members` ou `workshops` (inserção). O banco recusa (`permission denied`).
2. **Atualizações diretas permitidas** (RLS valida o dono):
   - `profiles`: `full_name`, `phone`, `avatar_url`
   - `motorcycles`: `brand`, `model`, `version`, `manufacturing_year`, `model_year`, `displacement_cc`, `color`, `initial_notes`
   - `motorcycle_private`: `chassis`
   - `workshops` (responsável): campos do perfil, exceto `verification_status`
3. **Leitura:** a RLS filtra automaticamente. Uma consulta vazia significa "sem acesso" ou "não existe" — a interface não deve diferenciar.
4. **Placa:** exibir formatada, mas enviar como o usuário digitou; o banco normaliza (`abc-1d23` → `ABC1D23`).
5. **QR Code:** gerado no frontend a partir da URL pública `/p/{public_id}` (`publicPassportUrl` em `src/modules/motorcycles/api.ts`). Nunca usar `id` interno em links.
6. **Linguagem:** não exibir termos de certificação ("verificado", "garantido", "laudo") para dados do histórico (PRD 3.4, 5.5).

---

## Autenticação (Supabase Auth)

### Cadastro
`supabase.auth.signUp({ email, password, options: { data: { ... } } })`

Metadados esperados em `options.data` (lidos pelo trigger `handle_new_user`):

| Campo | Tipo | Obrigatório | Efeito |
|---|---|---|---|
| `full_name` | string | sim | Nome no perfil (máx. 120) |
| `terms_accepted` | `true` | sim | Registra `terms_accepted_at` e `privacy_accepted_at` |
| `terms_version` | string | sim | Versão dos termos aceitos (ex.: `"1.0"`) |
| `privacy_version` | string | sim | Versão da política aceita |

Efeitos automáticos: cria `profiles` e o papel `owner` em `user_roles`.
A interface deve **exigir** a caixa de aceite antes de enviar.

### Login, logout, recuperação
Fluxos padrão do Supabase Auth (`signInWithPassword`, `signOut`, `resetPasswordForEmail`, `updateUser`). Confirmação de e-mail deve ficar **ativada** no projeto.

### Papéis do usuário logado
```ts
supabase.from('user_roles').select('role')   // retorna apenas os papéis do próprio usuário
supabase.rpc('has_role', { p_role: 'workshop' })
supabase.rpc('is_admin')
```
Usar para decidir quais painéis mostrar. **A segurança não depende disso** — o banco valida tudo.

---

## Motocicletas

### `register_motorcycle` — cadastrar moto
```ts
supabase.rpc('register_motorcycle', {
  p_brand, p_model, p_manufacturing_year, p_plate, p_current_mileage,   // obrigatórios
  p_version?, p_model_year?, p_displacement_cc?, p_color?,
  p_chassis?, p_acquisition_date?, p_initial_notes?
})
```
**Retorno (jsonb):**
- `{ status: 'created', motorcycle_id, public_id }` → ir para o painel da moto.
- `{ status: 'verification_required', claim_id }` → mostrar: *"Esta placa já possui um passaporte. Abrimos uma solicitação de verificação; você será avisado."* Não mostrar nenhum dado da moto existente.

**Erros (mensagem já em português, exibir ao usuário):**

| Situação | Mensagem |
|---|---|
| Limite do plano | Limite de motocicletas do seu plano atingido. |
| Rate limit (10/hora) | Muitas tentativas de cadastro. Tente novamente mais tarde. |
| Placa inválida | Placa inválida. Use o formato ABC1234 ou ABC1D23. |
| Ano inválido | Ano de fabricação inválido. |
| Km inválida | Quilometragem inválida. |
| Data futura | Data de aquisição não pode estar no futuro. |
| Corrida/concorrência | Não foi possível concluir o cadastro. Tente novamente. |

### `my_motorcycles` — lista do usuário (view)
```ts
supabase.from('my_motorcycles').select('*')
```
Campos: `id`, `public_id`, `brand`, `model`, `version`, `manufacturing_year`, `model_year`, `displacement_cc`, `color`, `status`, `passport_created_at`, `current_plate`, `owned_since`, `acquisition_date`, `latest_mileage`, `latest_mileage_at`.

### `change_motorcycle_plate` — trocar placa
```ts
supabase.rpc('change_motorcycle_plate', { p_motorcycle_id, p_new_plate })
```
Mantém histórico. Erros: `Operação não permitida.`, placa inválida, `Esta placa não pode ser utilizada. Se acredita que é um erro, contate o suporte.`

### Histórico de placas
```ts
supabase.from('motorcycle_plates').select('plate, valid_from, valid_until').eq('motorcycle_id', id).order('valid_from', { ascending: false })
```

### Chassi (somente titular)
```ts
supabase.from('motorcycle_private').select('chassis').eq('motorcycle_id', id).single()
supabase.from('motorcycle_private').update({ chassis }).eq('motorcycle_id', id)
```
Exibir mascarado por padrão (ex.: `9C2•••••••••00001`), com opção "mostrar".

---

## Quilometragem

### `record_mileage`
```ts
supabase.rpc('record_mileage', { p_motorcycle_id, p_mileage, p_recorded_at?, p_note?, p_corrects_record_id? })
```
Retorno: `{ id, below_previous }`. Se `below_previous = true`, exibir alerta neutro: *"Esta leitura é menor que uma anterior. Verifique o valor ou registre uma correção."* — **nunca** sugerir fraude (PRD 5.6).
Correção: enviar `p_corrects_record_id` + `p_note` (motivo obrigatório). O registro original permanece.

### Leituras
```ts
supabase.from('mileage_records').select('*').eq('motorcycle_id', id).order('recorded_at', { ascending: false })
```

---

## Linha do tempo e manutenção (Fase 2)

### `maintenance_timeline` (view)
```ts
supabase.from('maintenance_timeline').select('*').eq('motorcycle_id', id)
  .order('service_date', { ascending: false }).order('created_at', { ascending: false })
```
Cada linha traz `status` (`current` ou `superseded`), `items` (peças em JSON), `corrects_record_id`, `correction_reason` e `is_void`. Por padrão a interface mostra só `current` e esconde anulações; um filtro exibe as versões antigas.

### `create_maintenance_record`
```ts
supabase.rpc('create_maintenance_record', {
  p_motorcycle_id, p_category, p_title, p_service_date,          // obrigatórios
  p_description?, p_mileage?, p_workshop_name?, p_service_value_cents?, p_notes?,
  p_items?: [{ item_name, brand?, part_number?, quantity? }],      // até 50
  p_corrects_record_id?, p_correction_reason?,                    // correção
})
```
Retorno `{ id, below_previous }`. Valor sempre em **centavos**. Se `p_mileage` vier, a leitura entra no histórico de km (ou é reaproveitada/corrigida numa correção).
Erros (exibir a mensagem): data futura, título vazio, "Explique o motivo da correção.", "Este registro já foi corrigido. Corrija a versão mais recente.", "Registros confirmados por oficina só podem ser corrigidos pela oficina."

### `void_maintenance_record`
```ts
supabase.rpc('void_maintenance_record', { p_record_id, p_reason })
```
Anula um registro do dono. Nada é apagado.

## Anexos (Fase 2)

Fluxo: (1) enviar o arquivo ao bucket privado `attachments` no caminho `<motorcycle_id>/<uuid>.<jpg|png|webp|pdf>`; (2) chamar `register_attachment`. Implementação em `src/modules/attachments/api.ts`.

### `register_attachment`
`rpc('register_attachment', { p_motorcycle_id, p_storage_path, p_file_name, p_kind, p_maintenance_record_id? })` → `uuid`.
`p_kind`: `invoice`, `service_order`, `receipt`, `photo`, `document`, `other`. Erros em português (P0001): arquivo não encontrado, formato não aceito, arquivo grande demais, espaço acabou, registro anulado, já registrado.

### `get_storage_usage`
`rpc('get_storage_usage')` → `{ used_bytes, quota_bytes, max_file_bytes }`.

### Ver arquivos
`storage.from('attachments').createSignedUrls(paths, 600)` — só funciona para o titular atual. Os anexos de cada registro vêm em `maintenance_timeline.attachments`.

## Diário (Fase 2)

Implementação em `src/modules/diary/api.ts`.

- Ler: `from('motorcycle_diary_feed').select('*').eq('motorcycle_id', id)` → entradas visíveis ao usuário, com `is_mine` e `photos`.
- `create_diary_entry({ p_motorcycle_id, p_category, p_title, p_entry_date, p_body?, p_location?, p_visibility? })` → `uuid`. `p_category`: `first_ride`, `trip`, `meetup`, `accessory`, `customization`, `photo`, `other`. `p_visibility`: `private` (padrão) ou `shareable`.
- `update_diary_entry({ p_entry_id, ...mesmos campos })` — só o autor, enquanto titular.
- `delete_diary_entry({ p_entry_id })` → `text[]` (caminhos das fotos); depois `storage.from('attachments').remove(caminhos)`.
- `delete_diary_photo({ p_attachment_id })` → `text` (caminho); depois `remove([caminho])`.
- Fotos: mesmo fluxo de anexos com `register_attachment(..., p_diary_entry_id)`; só imagens, até 10.

## Autorizações de oficina (Fase 3)

Implementação em `src/modules/workshop_access/api.ts`.

Oficina (membro ativo de oficina ativa):
- `rpc('search_motorcycle_by_plate', { p_organization_id, p_plate })` → `{ found: false }` ou `{ found: true, brand, model, manufacturing_year, access_id, access_status, motorcycle_id }` (`motorcycle_id` só com autorização ativa). Erros: placa inválida (22023), limite de pesquisas (P0001).
- `rpc('request_workshop_access', { p_organization_id, p_plate, p_message?, p_origin? })` (`p_origin` = pedir reconhecimento como Oficina de Origem; a pesquisa devolve `origin_available`) → `{ id, status }`. Devolve o pedido aberto se já existir. Erros: placa não encontrada, espera após recusa, limite diário.
- `rpc('cancel_workshop_access_request', { p_access_id })`.
- `rpc('get_workshop_access_list', { p_organization_id })` → lista; `plate`, `latest_mileage`, `motorcycle_id` só quando `status = 'approved'`.

Titular:
- `rpc('get_motorcycle_workshop_access', { p_motorcycle_id })`, `rpc('get_my_pending_access_requests')`.
- `rpc('decide_workshop_access', { p_access_id, p_approve, p_as_origin? })` (`p_as_origin = false` aprova pedido de Origem só como acesso), `rpc('revoke_workshop_access', { p_access_id })`.
- `rpc('set_origin_workshop', { p_access_id, p_origin })` — Oficina de Origem (ADR-014).

## Equipe da oficina (Fase 3)

Implementação em `src/modules/workshop/teamApi.ts`.

- Responsável: `create_org_invite({ p_organization_id, p_email, p_can_request_access?, p_can_register_services? })` → `{ id, token, expires_at }` (o link é `/convite/<token>`; o token não pode ser recuperado depois), `get_org_invites`, `revoke_org_invite`, `update_org_member({ p_member_id, p_role, p_can_request_access, p_can_register_services })`, `remove_org_member`.
- Convidado: `get_invite_preview({ p_token })` → `{ status: open|accepted|revoked|expired|inactive|invalid, workshop_name, email_matches, email_hint, can_* , expires_at }`; `accept_org_invite({ p_token })` → id da oficina.
- Membro: `get_org_members({ p_organization_id })`, `leave_organization`, `has_org_permission`.

## Serviços registrados pela oficina (Fase 3, ADR-015)

Implementação em `src/modules/workshop_service/api.ts`.

- `rpc('get_workshop_timeline', { p_organization_id, p_motorcycle_id })` → registros com `is_own`; `service_value_cents`, `notes`, `recorded_by_name` e `attachments` vêm nulos/vazios quando `is_own = false`.
- `rpc('create_workshop_service', { p_organization_id, p_motorcycle_id, p_category, p_title, p_service_date, p_description?, p_mileage?, p_service_value_cents?, p_notes?, p_items?, p_corrects_record_id?, p_correction_reason? })` → `{ id, below_previous }`.
- Comprovantes: enviar para `<motorcycle_id>/<uuid>.<ext>` e `rpc('register_workshop_attachment', { p_organization_id, p_storage_path, p_file_name, p_kind, p_maintenance_record_id })`; cota em `rpc('get_workshop_storage_usage', { p_organization_id })`.
- `maintenance_timeline` (titular) passa a ter `recorded_by_name`.

## Transferência (Fase 4, ADR-016)

Implementação em `src/modules/transfers/api.ts`.

- Titular: `rpc('create_transfer_request', { p_motorcycle_id, p_to_email, p_message? })` → id; `cancel_transfer_request({ p_transfer_id })`; `get_motorcycle_transfers({ p_motorcycle_id })` → lista com `status` (`pending`, `accepted`, `rejected`, `canceled`, `expired`).
- Comprador: `get_my_incoming_transfers()`; `accept_transfer_request({ p_transfer_id, p_acquisition_date? })` → id da moto; `reject_transfer_request({ p_transfer_id })`.
- Antigo titular: `get_my_previous_motorcycles()`; o próprio diário continua em `motorcycle_diary_feed` (só leitura e exclusão).

## Pagamentos — conta do Mercado Pago (Fase 5.2, ADR-019)

Implementação em `src/modules/admin/paymentsApi.ts`.

- Admin: `rpc('admin_get_payment_settings')` → ambiente, chave pública, `access_token_configured`/`access_token_hint`, `webhook_secret_configured`/`webhook_secret_hint`, conta conectada e último teste (nunca os segredos). `rpc('admin_save_payment_settings', { p_environment, p_public_key, p_access_token?, p_webhook_secret? })` — vazio mantém o segredo atual.
- Edge Function `POST /functions/v1/mercadopago-check` (login de admin) → `{ ok, message, account_id, nickname, site_id }`.

### Armazenamento (ADR-026)
- `admin_storage_overview()` → totais, `by_kind`, `by_context`, temporários e sem vínculo, alertas, última limpeza.
- `admin_storage_top_users`, `admin_storage_top_motorcycles`, `admin_storage_top_workshops({ p_limit? })`; `admin_list_unlinked_files({ p_limit? })`; `admin_list_storage_cleanups({ p_limit? })`.
- Edge Function `POST /functions/v1/storage-cleanup` `{ reason }` (login de admin) → `{ ok, deleted_files, deleted_bytes, failed_files }`.
- Público: `rpc('get_payment_public_config')` → `{ billing_enabled, environment, public_key }` (chave só com a contratação liberada).
- Servidor (`service_role`): `payment_access_token()`, `payment_webhook_secret()`, `record_payment_check(...)`.

## Administração (Fase 6.1, ADR-023)

Implementação em `src/modules/admin/adminApi.ts`. Todas exigem administrador.

- `admin_get_metrics()` → indicadores (uso, assinaturas, receita mensal recorrente, pendências, armazenamento).
- `admin_list_users({ p_search?, p_limit? })` (e-mail mascarado); `admin_get_user({ p_user_id, p_reason })` (dados privados, auditado); `admin_set_user_status({ p_user_id, p_status: 'active'|'suspended'|'blocked', p_reason })`.
- `admin_list_workshops({ p_search?, p_limit? })`; `admin_set_workshop_status({ p_organization_id, p_status, p_reason })`; `admin_set_workshop_verification({ p_organization_id, p_verification: 'unverified'|'verified'|'rejected', p_reason })`.
- `admin_list_settings()` → configurações editáveis com `spec` (`kind`, `min`, `max`, `group`, `label`); `admin_update_setting({ p_key, p_value, p_reason })`.
- `admin_search_audit({ p_entity_type?, p_action?, p_actor?, p_motorcycle_id?, p_organization_id?, p_from?, p_to?, p_limit?, p_before_id? })` (sem conteúdo); `admin_get_audit_entry({ p_id, p_reason })`; `admin_audit_facets()`.

### Verificação de placa (ADR-025)
- Solicitante: `get_my_claims()` (sem dados da moto existente); `update_my_claim_note({ p_claim_id, p_note })`; `cancel_my_claim({ p_claim_id })` — só pendentes e próprios.
- Titular atual: `get_my_ownership_notices()` (aviso anônimo: moto e data); `dismiss_ownership_notice({ p_claim_id })`.
- Admin: `admin_list_claims({ p_status?, p_limit? })`; `admin_resolve_claim({ p_claim_id, p_status: 'approved'|'rejected', p_reply, p_notify_owner, p_reason })` — aviso ao titular só se aprovado.
- Motivo: 10 a 500 caracteres.

## Faturas (Fase 5.3, ADR-022)

- Usuário: `get_my_invoices()` → `number`, `period_start/end`, `amount_cents`, `due_date`, `status` (`open`, `failed`, `paid`, `refunded`, `charged_back`, `canceled`), `attempts`; `get_invoice_receipt({ p_invoice_id })` → dados do recibo (só faturas pagas/reembolsadas/contestadas, só do próprio usuário).
- Admin: `admin_list_invoices({ p_limit? })`.

## Benefícios Premium (Fase 5.4, ADR-021)

- Plano: `get_my_plan()` e `get_public_plans()` trazem `entitlements` (`pdf_reports`, `maintenance_reminders`) e `max_share_links`. Admin: `admin_set_plan_benefits({ p_id, p_entitlements, p_max_share_links })`.
- Lembretes (`src/modules/reminders/api.ts`): `get_motorcycle_reminders({ p_motorcycle_id })` → lista com `status` (`due`, `soon`, `ok`, `paused`, `done`), `km_left`, `days_left`; `get_my_due_reminders()`; `create_reminder({ p_motorcycle_id, p_title, p_category?, p_every_km?, p_every_months?, p_due_date?, p_notes?, p_base_mileage?, p_base_date? })`; `update_reminder(...)`; `complete_reminder({ p_reminder_id, p_mileage?, p_date? })`; `set_reminder_paused`; `delete_reminder`.
- Relatório: `register_motorcycle_report({ p_motorcycle_id })` → `{ reference, generated_at }` (exige o recurso; até 30 por hora).

## Assinaturas (Fase 5, ADR-020)

Implementação em `src/modules/plans/billingApi.ts`.

- Usuário: `rpc('get_my_subscription')` → assinatura mais recente (`status`, `current_period_end`, `grace_until`, `has_access`…) ou `null`; `rpc('get_my_payments')` → histórico.
- Edge Function `POST /functions/v1/mercadopago-billing` (login): `{ action: 'subscribe', plan_code }` → `{ checkout_url }` (redirecionar); `{ action: 'sync' }`; `{ action: 'cancel' }`; `{ action: 'reconcile' }` (admin) → `{ checked, synced, failures }`.
- Webhook `POST /functions/v1/mercadopago-webhook` (Mercado Pago; cabeçalhos `x-signature` e `x-request-id`). Tipos tratados: `subscription_preapproval`, `subscription_authorized_payment`, `payment`.
- Admin: `admin_list_subscriptions`, `admin_list_payment_events`, `admin_set_billing_enabled({ p_enabled })`.
- Servidor (`service_role`): `billing_prepare_subscription`, `billing_attach_checkout`, `billing_fail_checkout`, `billing_apply_subscription_state`, `billing_apply_payment`, `billing_log_event`, `billing_finish_event`, `billing_user_subscription`, `billing_cancel_local`, `billing_reconcile_targets`.

## Compartilhamento (Fase 4, ADR-017)

Implementação em `src/modules/sharing/sharesApi.ts`.

- Titular: `rpc('create_passport_share', { p_motorcycle_id, p_label?, p_expires_in_days?, p_show_plate?, p_show_mileage?, p_show_history?, p_show_values?, p_show_attachments?, p_show_diary? })` → `{ id, token }` (URL `/c/<token>`); `revoke_passport_share({ p_share_id })`; `get_motorcycle_shares({ p_motorcycle_id })` → lista com `status` (`active`, `expired`, `revoked`) e `view_count`; `get_passport_settings` / `set_public_page_enabled({ p_motorcycle_id, p_enabled })`.
- Público: `rpc('get_shared_passport', { p_token })` → objeto com identificação, `options`, `origin_workshop` e as seções escolhidas (`plate`, `mileage`, `history`, `diary`), ou `null`.

## Duplicidade

```ts
supabase.from('motorcycle_claim_requests').select('id, plate, status, created_at, resolved_at')
```
Selecionar **apenas** essas colunas (a coluna `motorcycle_id` é bloqueada; `select('*')` falha).

---

## Oficinas

### `create_workshop` — cadastro gratuito
```ts
supabase.rpc('create_workshop', { p_business_name, p_public_slug, p_city?, p_state?, p_phone?, p_whatsapp?, p_email?, p_cnpj?, p_legal_name? })
```
Retorna o `organization_id`. Concede o papel `workshop`. `p_public_slug`: minúsculas, números e hífens (3–60). Limite: 3 oficinas por usuário.
Erro de slug repetido: violação de unicidade → pedir outro endereço.

### Perfil público
```ts
supabase.from('workshops').select('business_name, city, state, specialties, description, logo_url, opening_hours, phone, whatsapp, public_slug').eq('public_slug', slug).single()
```
Funciona para anônimos. `verification_status` indica verificação **cadastral**, não certificação técnica.

---

## Passaporte público

### `get_public_passport`
```ts
supabase.rpc('get_public_passport', { p_public_id })
```
Acesso anônimo. Retorna `{ public_id, brand, model, version, manufacturing_year, model_year, displacement_cc, color, passport_created_at }` ou `null`. Para `null`, exibir uma única mensagem genérica: *"Passaporte não encontrado ou indisponível."*

---

## Configurações públicas

```ts
supabase.from('system_settings').select('key, value').eq('is_public', true)
```
Hoje: `support_email`, `support_whatsapp`, `billing_enabled` (contratação liberada no site). Limites e preços vêm dos planos (abaixo) — nunca fixar no código.

## Planos (Fase 5.1, ADR-018)

Implementação em `src/modules/plans/api.ts`.

- Público: `rpc('get_public_plans')` → lista de planos ativos e visíveis (`code`, `kind`, `billing_period`, `name`, `description`, `price_cents`, `price_note`, `max_motorcycles`, `storage_quota_mb`, `features`, `trial_days`, `cancellation_text`), gratuito primeiro.
- Usuário: `rpc('get_my_plan')` → plano vigente, limites e `motorcycles_used`.
- Admin: `admin_list_plans()`, `admin_save_plan({ p_id?, p_code?, p_kind?, p_billing_period?, p_name, p_description, p_price_cents, p_price_note, p_max_motorcycles, p_storage_quota_mb, p_features, p_trial_days, p_cancellation_text, p_is_public, p_sort_order })` (com `p_id` só edita; código, tipo e periodicidade são ignorados), `admin_set_plan_active({ p_id, p_active })`, `admin_get_plan_history({ p_id })`.

### Rotinas automáticas (ADR-029)
- `admin_job_status()` → por rotina (`reconcile`, `storage_cleanup`): última situação, detalhe, horários, falhas e execuções em 24 h.
- Edge Function `POST /functions/v1/scheduled-jobs` `{ job }` — só para o pg_cron (cabeçalho `x-job-secret`); não chamar pelo navegador.

### Acesso administrativo (ADR-030)
- `my_admin_access()` → `{ has_admin_role, aal, allowed }` da própria sessão. Ativação e código: `supabase.auth.mfa.enroll({ factorType: 'totp' })`, `mfa.challengeAndVerify({ factorId, code })`.

### Notificações (ADR-031)
- `get_my_notifications({ p_limit?, p_before? })`, `count_my_unread_notifications()`, `mark_my_notifications_read({ p_ids? })` (sem ids = todas).
- `get_my_notification_preferences()` → `{ kind, optional, in_app, email }[]`; `set_my_notification_preference({ p_kind, p_in_app, p_email })` (essenciais não podem ter `in_app = false`).
- Admin: `admin_send_notice({ p_user_id, p_title, p_body, p_reason })` (auditado).

### Chassi (ADR-032)
- `get_my_chassis({ p_motorcycle_id })` → texto ou null (só titular atual); `set_my_chassis({ p_motorcycle_id, p_chassis })` (vazio apaga; inválido recusado). A tabela `motorcycle_private` não é mais lida pelo navegador.

### Conferência de arquivos (ADR-033)
- Edge Function `POST /functions/v1/attachment-check` `{ path }` (com login), chamada entre o envio ao Storage e `register_*`. 200 = conferido; 422 = conteúdo não bate com o tipo (arquivo apagado); 404/409 = arquivo de outra pessoa ou já registrado.

### Comprovantes pelo link (ADR-034)
- `get_shared_passport` → em `history[].attachments`: `{ id, kind, mime_type }` (só com "Mostrar comprovantes").
- Edge Function `POST /functions/v1/shared-file` `{ token, attachment_id }` (sem login) → `{ url, file_name }` (link de 60 s); 404 indisponível; 429 limite por hora.

### Limite de consultas anônimas (ADR-035)
- `get_public_passport` e `get_shared_passport` podem responder erro `P0001` com `hint = 'rate_limited'` ("Muitas consultas…"). O site trata com `isRateLimited()` (`src/core/shared/rateLimit.ts`).

## Módulo Oficina — Fase 1 (PRD 2.1, ADR-043)

Todas recebem `p_org` (a oficina) e conferem a sessão. Detalhes em `docs/modules/WORKSHOP.md`, `QUOTES.md`, `WORKSHOP_PRICING.md` e `WORKSHOP_APPROVALS.md`.

| Função | Quem | O que faz |
|---|---|---|
| `get_my_workshop_permissions(org)` | Membro | Permissões do usuário na oficina |
| `get_org_member_extra_permissions(org)` / `set_org_member_extra_permissions(member, quotes, prices)` | Responsável | Permissões de orçamento e de preços por funcionário |
| `workshop_save_customer(org, id?, data)` / `workshop_set_customer_status` | `manage_quotes` | Cria/edita/arquiva cliente |
| `workshop_list_customers(org, busca?, arquivados?)` / `workshop_get_customer(org, id)` | Membro | Lista e ficha (motos e orçamentos) |
| `workshop_save_vehicle(org, id?, cliente, data)` / `workshop_list_vehicles(org, busca?)` | `manage_quotes` / membro | Motos da oficina |
| `workshop_link_vehicle_passport(org, moto_oficina, motorcycle?)` | `manage_quotes` + autorização aprovada | Vincula/desvincula o passaporte |
| `workshop_save_service`, `workshop_save_price_table`, `workshop_save_price_rule`, `workshop_delete_price_rule` | `manage_prices` | Catálogo e preços |
| `workshop_list_catalog(org)` / `workshop_suggest_price(org, serviço, moto?, tabela?, complexidade?)` | Membro | Catálogo e preço sugerido `{price_cents, source, label}` |
| `workshop_create_quote(org, cliente, moto?, original?, motivo?)` | `manage_quotes` | Novo orçamento (ou complementar) em rascunho |
| `workshop_save_quote_draft(org, orçamento, data)` | `manage_quotes` | Salva rascunho e itens; devolve totais |
| `workshop_send_quote(org, orçamento)` | `manage_quotes` | Envia (fecha a versão) ou reenvia; devolve `{token, expires_at}` uma única vez |
| `workshop_revise_quote(org, orçamento, motivo)` | `manage_quotes` | Nova versão (enviado, recusado ou vencido) |
| `workshop_revoke_quote_link`, `workshop_cancel_quote`, `workshop_log_quote_event` | `manage_quotes` / membro | Desativa link, cancela, registra WhatsApp/impressão |
| `workshop_list_quotes(org, situação?, busca?)` / `workshop_get_quote(org, id)` / `workshop_dashboard(org, de?, até?)` | Membro | Lista, detalhe com versões/aceites/eventos e indicadores |
| `get_quote_by_token(token)` | Anônimo | Orçamento do link (`state`: open, expired, decided, replaced, revoked, not_found) |
| `decide_quote_by_token(token, posições[], nome, confirmado, motivo?, sessão?, termos?)` | Anônimo | Aprova tudo, parte (posições) ou recusa (lista vazia); devolve o comprovante |
| `workshop_expire_quotes()` | Servidor (pg_cron) | Vence orçamentos sem resposta |

### Ordens de serviço (Fase 2, ADR-044)

| Função | Quem | O que faz |
|---|---|---|
| `workshop_create_order_from_quote(org, orçamento)` | `manage_quotes` | OS com os itens aprovados (devolve a existente se já houver) |
| `workshop_create_order_manual(org, cliente, moto?, forma, quem, obs, itens, km?)` | `manage_quotes` | OS sem orçamento, com autorização registrada |
| `workshop_add_order_item(org, os, item, forma, quem, obs)` / `workshop_add_complement_to_order(org, os, complementar)` | `manage_quotes` | Item extra autorizado / itens aprovados do complementar |
| `workshop_set_order_status(org, os, situação, obs?)` | `execute_orders` | Situações operacionais |
| `workshop_update_order(org, os, {mechanic_user_id, due_date, km_in, notes})` | `manage_quotes` | Mecânico (com aviso), prazo, km, observações |
| `workshop_update_order_item(org, os, item, {status, part_brand, part_code, notes})` / `workshop_set_technical_notes` | `execute_orders` | Execução, peça, observações técnicas |
| `workshop_save_inspection(org, os, entry\|exit, dados)` | `execute_orders` | Checklist |
| `workshop_register_os_photo(org, os, caminho, etapa, legenda?)` / `workshop_remove_os_photo` | `execute_orders` | Foto conferida / remoção lógica |
| `workshop_complete_order(org, os, km_final, obs, ajuste, motivo)` | `manage_quotes` | Conclui e gera o código do comprovante |
| `workshop_notify_pickup`, `workshop_deliver_order(org, os, quem retirou)`, `workshop_cancel_order(org, os, motivo)` | `manage_quotes` | Retirada, entrega, cancelamento |
| `workshop_list_orders(org, situação?, busca?, só minhas?)` / `workshop_get_order` / `workshop_orders_summary` / `workshop_customer_orders` | Membro | Leitura (quem não gerencia vê só as OS designadas) |
| `workshop_create_order_link(org, os, entry_ack\|receipt)` | `manage_quotes` | Link do cliente (token uma vez) |
| `get_service_order_by_token(token)` / `ack_service_order_entry(token, nome, confirmado)` | Anônimo | Ver checklist/comprovante e dar ciência da entrada |

### Histórico da moto a partir da OS (Fase 3, ADR-045)

| Função | Quem | O que faz |
|---|---|---|
| `workshop_complete_order(org, os, km, obs, ajuste, motivo, {publish, category, title, include_value})` | `manage_quotes` | Conclui e, se possível e pedido (padrão), registra no histórico. Devolve `history_state` e `record_id` |
| `workshop_publish_order_to_history(org, os, categoria?, título?, mostrar_valor?)` | `manage_quotes` + `register_services` + autorização vigente | Registro posterior |
| `workshop_order_history(org, os)` | Membro | Situação (`ready`, `published`, `not_linked`, `no_access`…), sugestões, registro, fotos já enviadas |
| `workshop_link_photo_to_history(org, os, foto, anexo)` | `manage_quotes` | Liga a foto da OS ao anexo criado pelo fluxo `register_workshop_attachment` |

### Gestão (Fase 4, ADR-046)

Contrato completo em `docs/modules/WORKSHOP_MANAGEMENT.md`. Resumo: peças (`workshop_save_part`, `workshop_list_parts`), recebimentos (`workshop_record_payment`, `workshop_void_payment`, `workshop_order_payments`, `workshop_finance`), agenda (`workshop_save_appointment`, `workshop_set_appointment_status`, `workshop_list_appointments`), lembretes e contatos (`workshop_save_reminder`, `workshop_set_reminder_status`, `workshop_log_contact`, `workshop_relationship`, `workshop_customer_contacts`) e `workshop_reports`. `set_org_member_extra_permissions` ganhou `p_manage_finance`; `get_my_workshop_permissions` devolve `manage_finance`.

### Crescimento comercial (Fase 5, ADR-047)

Contrato completo em `docs/modules/WORKSHOP_GROWTH.md`. Públicas (sem conta, com limite): `get_public_workshop`, `get_public_booking_slots`, `request_public_appointment`, `submit_workshop_review`. Da oficina: fotos do perfil, avaliações (`workshop_list_reviews`, `workshop_reply_review`, `workshop_report_review`), campanhas (`workshop_save_campaign`, `workshop_close_campaign`, `workshop_list_campaigns`, `workshop_campaign_recipients`, `workshop_set_marketing_opt_out`). Admin: `admin_list_reviews`, `admin_moderate_review`. `get_service_order_by_token` passou a devolver `review` no comprovante.

### Cliente com conta (Fase 5.1, ADR-048)

Contrato em `docs/modules/WORKSHOP_CUSTOMER_LINK.md`: `workshop_create_customer_invite`, `get_customer_link_preview`, `claim_workshop_customer`, `get_my_workshop_records`, `unlink_my_workshop_customer`, `workshop_unlink_customer`. Rotina diária `system_workshop_reminders()` (serviço).
