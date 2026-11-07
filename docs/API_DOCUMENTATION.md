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
- `rpc('request_workshop_access', { p_organization_id, p_plate, p_message? })` → `{ id, status }`. Devolve o pedido aberto se já existir. Erros: placa não encontrada, espera após recusa, limite diário.
- `rpc('cancel_workshop_access_request', { p_access_id })`.
- `rpc('get_workshop_access_list', { p_organization_id })` → lista; `plate`, `latest_mileage`, `motorcycle_id` só quando `status = 'approved'`.

Titular:
- `rpc('get_motorcycle_workshop_access', { p_motorcycle_id })`, `rpc('get_my_pending_access_requests')`.
- `rpc('decide_workshop_access', { p_access_id, p_approve })`, `rpc('revoke_workshop_access', { p_access_id })`.

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
Hoje: `free_plan_max_motorcycles` (usar na página de planos e no aviso de limite — nunca fixar o número no código).
