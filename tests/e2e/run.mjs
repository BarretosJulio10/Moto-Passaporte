// Testes ponta a ponta da interface (PRD 19.2, Fase 6.4, ADR-027).
// Navegador real (Chromium/Playwright) contra o build do site; o Supabase é simulado
// por interceptação de rede, com estado por cenário e registro das chamadas.
// A segurança dos dados é testada no banco (tests/security); aqui se testa que cada
// perfil consegue concluir seu fluxo e que a interface chama o backend certo.
//
// Uso: scripts/validation/run_e2e.sh   (constrói e sobe o site; não acessa a internet)
const PW = process.env.PLAYWRIGHT_MODULE ?? '/opt/npm-tools/node_modules/playwright/index.mjs'
const { chromium } = await import(PW)
const BASE = process.env.E2E_BASE ?? 'http://localhost:4175'
const API = 'https://mock.supabase.co'

const UID = '11111111-1111-1111-1111-111111111111'
const MOTO = 'aaaaaaaa-1111-2222-3333-444444444444'
const ORG = 'bbbbbbbb-1111-2222-3333-444444444444'
const PUB = '7f3a9c2e81d04b6a9e1f22c3d4b5a6c7'
const now = Math.floor(Date.now() / 1000)
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: now + 7200, iat: now, email: 'ana@exemplo.com' })}.sig`
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'ana@exemplo.com', app_metadata: {}, user_metadata: { full_name: 'Ana Souza' }, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: jwt, token_type: 'bearer', expires_in: 7200, expires_at: now + 7200, refresh_token: 'r', user }

const moto = {
  id: MOTO, public_id: PUB, brand: 'Honda', model: 'CB 500F', version: 'ABS', manufacturing_year: 2022, model_year: 2023, displacement_cc: 471,
  color: 'Preta', status: 'active', passport_created_at: '2026-11-06T22:00:00Z', current_plate: 'ABC1D23', owned_since: '2026-11-06T22:00:00Z',
  acquisition_date: '2024-03-10', latest_mileage: 15200, latest_mileage_at: '2026-11-06',
}
const plan = { code: 'free', kind: 'free', name: 'Gratuito', billing_period: null, max_motorcycles: 1, storage_quota_mb: 100, motorcycles_used: 1, features: [], entitlements: [], max_share_links: 1 }

/** Respostas padrão; cada cenário sobrescreve o que precisa. */
function baseWorld(over = {}) {
  return {
    logged: true,
    rest: { my_motorcycles: [moto], motorcycle_plates: [], mileage_records: [], maintenance_timeline: [], motorcycle_diary_feed: [], organization_members: [], workshops: [], ...over.rest },
    rpc: {
      is_admin: false,
      my_admin_access: { has_admin_role: false, aal: 'aal1', allowed: false },
      get_my_plan: plan,
      get_storage_usage: { used_bytes: 0, quota_bytes: 104857600, max_file_bytes: 10485760 },
      get_public_plans: [],
      get_payment_public_config: { billing_enabled: false },
      ...over.rpc,
    },
    fn: over.fn ?? {},
    ...over.flags,
  }
}

const browser = await chromium.launch()
const results = []

async function scenario(name, world, viewport, steps) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', locale: 'pt-BR' })
  const calls = []
  if (world.logged) await ctx.addInitScript(([s]) => localStorage.setItem('sb-mock-auth-token', s), [JSON.stringify(session)])
  await ctx.route(`${API}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const p = url.pathname
    const single = (req.headers()['accept'] || '').includes('pgrst.object')
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) })
    let body = null
    try { body = req.postDataJSON() } catch { body = null }
    if (p.startsWith('/auth/v1/user')) return world.logged ? json({ ...user, factors: world.factors ?? [] }) : json({ message: 'no session' }, 401)
    if (p === '/auth/v1/factors' && req.method() === 'POST') {
      calls.push({ kind: 'auth', name: 'enroll', body })
      world.factors = [{ id: 'f1', factor_type: 'totp', status: 'unverified', friendly_name: body?.friendly_name, created_at: '', updated_at: '' }]
      return json({ id: 'f1', type: 'totp', friendly_name: body?.friendly_name,
        totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } })
    }
    if (/^\/auth\/v1\/factors\/[^/]+\/challenge$/.test(p)) return json({ id: 'ch1', type: 'totp', expires_at: now + 300 })
    if (/^\/auth\/v1\/factors\/[^/]+\/verify$/.test(p)) {
      calls.push({ kind: 'auth', name: 'verify', body })
      if (body?.code !== '123456') return json({ code: 'mfa_verification_failed', message: 'Invalid TOTP code entered' }, 422)
      world.factors = [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'x', created_at: '', updated_at: '' }]
      world.rpc.my_admin_access = { has_admin_role: true, aal: 'aal2', allowed: true }
      return json({ ...session, user: { ...user, factors: world.factors } })
    }
    if (p.startsWith('/auth/v1')) return json({})
    if (p.startsWith('/rest/v1/rpc/')) {
      const fnName = p.slice('/rest/v1/rpc/'.length)
      calls.push({ kind: 'rpc', name: fnName, body })
      const v = world.rpc[fnName]
      const out = typeof v === 'function' ? v(body, calls) : v
      if (out && out.__error) return json({ code: out.__error, message: out.message ?? 'erro' }, 400)
      return json(out === undefined ? (fnName.startsWith('get_') || fnName.startsWith('admin_list') ? [] : null) : out)
    }
    if (p.startsWith('/rest/v1/')) {
      const table = p.slice('/rest/v1/'.length)
      calls.push({ kind: 'rest', name: table, method: req.method() })
      const rows = world.rest[table] ?? []
      return json(single ? (rows[0] ?? null) : rows)
    }
    if (p.startsWith('/functions/v1/')) {
      const fnName = p.slice('/functions/v1/'.length)
      calls.push({ kind: 'function', name: fnName, body })
      return json(world.fn[fnName] ?? { ok: true })
    }
    return json([])
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const checks = []
  const check = (ok, label) => checks.push({ ok: Boolean(ok), label })
  try {
    await steps({ page, calls, check, go: (path) => page.goto(BASE + path, { waitUntil: 'networkidle' }) })
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    check(sw <= viewport.width, `sem rolagem lateral (${sw}px em ${viewport.width}px)`)
    check(errors.length === 0, `sem erros de JavaScript ${errors.length ? JSON.stringify(errors) : ''}`)
  } catch (e) {
    check(false, `falhou: ${e.message.split('\n')[0]}`)
  }
  await ctx.close()
  results.push({ name, checks })
}

const desktop = { width: 1280, height: 900 }
const mobile = { width: 360, height: 800 }
const rpcCalled = (calls, name) => calls.filter((c) => c.kind === 'rpc' && c.name === name)

// 1. Visitante: passaporte público só com dados públicos, sem ler tabelas privadas
await scenario('Visitante abre o passaporte público', baseWorld({
  flags: { logged: false },
  rpc: { get_public_passport: { public_id: PUB, brand: 'Honda', model: 'CB 500F', version: 'ABS', manufacturing_year: 2022, model_year: 2023, displacement_cc: 471, color: 'Preta', passport_created_at: '2026-11-06T22:00:00Z' } },
}), mobile, async ({ page, calls, check, go }) => {
  await go(`/p/${PUB}`)
  await page.getByText('CB 500F').first().waitFor()
  check(true, 'mostra a moto')
  check(rpcCalled(calls, 'get_public_passport')[0]?.body?.p_public_id === PUB, 'consulta pelo código público')
  check(!calls.some((c) => c.kind === 'rest' && ['my_motorcycles', 'motorcycle_plates', 'maintenance_timeline'].includes(c.name)), 'não lê tabelas privadas')
  check(!(await page.content()).includes('ABC1D23'), 'placa não aparece')
})

// 2. Sem login, a área do proprietário pede entrada
await scenario('Visitante sem login tenta abrir o painel', baseWorld({ flags: { logged: false } }), desktop, async ({ page, check, go }) => {
  await go('/painel')
  await page.waitForURL(/\/entrar/, { timeout: 5000 })
  check(new URL(page.url()).pathname === '/entrar', 'vai para a tela de entrada')
})

// 3. Proprietário registra manutenção
await scenario('Proprietário registra uma manutenção', baseWorld({
  rpc: { create_maintenance_record: 'rec-1' },
}), mobile, async ({ page, calls, check, go }) => {
  await go(`/painel/motos/${MOTO}/historico/novo`)
  await page.getByLabel('Categoria').selectOption({ index: 1 })
  await page.getByLabel('Título').fill('Troca de óleo e filtro')
  await page.getByLabel('Quilometragem (opcional)').fill('15800')
  await page.getByRole('button', { name: 'Salvar registro' }).click()
  await page.waitForURL(new RegExp(`/painel/motos/${MOTO}/historico$`), { timeout: 5000 })
  const c = rpcCalled(calls, 'create_maintenance_record')[0]
  check(c && c.body.p_motorcycle_id === MOTO && c.body.p_title === 'Troca de óleo e filtro', 'envia o registro da moto certa')
  check(true, 'volta para o histórico')
})

// 4. Comprador aceita a transferência
await scenario('Comprador aceita a transferência', baseWorld({
  rest: { my_motorcycles: [] },
  rpc: {
    get_my_incoming_transfers: [{ id: 'tr-1', brand: 'Yamaha', model: 'Fazer 250', version: null, manufacturing_year: 2021, plate: 'XYZ9A88',
      latest_mileage: 30100, maintenance_count: 12, from_name: 'Bruno Lima', message: 'Moto revisada', created_at: '2026-11-07T10:00:00Z', expires_at: '2026-11-14T10:00:00Z' }],
    accept_transfer_request: MOTO,
  },
}), mobile, async ({ page, calls, check, go }) => {
  await go('/painel')
  await page.getByText('Fazer 250').first().waitFor()
  check(await page.getByText('Bruno Lima').first().isVisible(), 'mostra quem envia')
  await page.getByRole('button', { name: 'Aceitar e receber a moto' }).click()
  await page.waitForURL(new RegExp(`/painel/motos/${MOTO}`), { timeout: 5000 })
  check(rpcCalled(calls, 'accept_transfer_request')[0]?.body?.p_transfer_id === 'tr-1', 'aceita o pedido certo')
})

// 5. Oficina pesquisa a placa e pede acesso
await scenario('Oficina pesquisa placa e pede acesso', baseWorld({
  rest: {
    organization_members: [{ organization_id: ORG, role: 'responsible', can_request_access: true, can_register_services: true }],
    workshops: [{ organization_id: ORG, business_name: 'Oficina do Zé', public_slug: 'oficina-do-ze', city: 'Barretos', state: 'SP', verification_status: 'verified' }],
  },
  rpc: {
    search_motorcycle_by_plate: { found: true, brand: 'Honda', model: 'CB 500F', manufacturing_year: 2022, access_id: null, access_status: null, access_type: null, origin_available: false, motorcycle_id: null },
    request_workshop_access: 'acc-1',
  },
}), mobile, async ({ page, calls, check, go }) => {
  await go(`/oficina/${ORG}`)
  await page.getByLabel('Placa', { exact: true }).first().fill('ABC1D23')
  await page.getByRole('button', { name: /Pesquisar|Buscar/ }).click()
  await page.getByText('CB 500F').first().waitFor()
  check(!(await page.content()).includes('15200'), 'antes da autorização não mostra histórico')
  await page.getByRole('button', { name: 'Pedir acesso' }).click()
  await page.waitForTimeout(400)
  const c = rpcCalled(calls, 'request_workshop_access')[0]
  check(c && c.body.p_organization_id === ORG && c.body.p_plate === 'ABC1D23', 'pede acesso pela oficina e placa certas')
})

// 6. Usuário comum não entra na administração
await scenario('Usuário comum tenta abrir a administração', baseWorld(), desktop, async ({ page, calls, check, go }) => {
  await go('/admin/armazenamento')
  await page.getByText('Acesso restrito').waitFor()
  check(true, 'mostra acesso restrito')
  check(!rpcCalled(calls, 'admin_storage_overview').length, 'não consulta dados administrativos')
})

// 7. Admin limpa arquivos sem vínculo, com motivo
await scenario('Admin limpa arquivos sem vínculo', baseWorld({
  rpc: {
    is_admin: true,
    my_admin_access: { has_admin_role: true, aal: 'aal2', allowed: true },
    admin_storage_overview: { bucket_files: 3, bucket_bytes: 3145728, linked_files: 1, linked_bytes: 1048576, by_kind: [{ kind: 'photo', files: 1, bytes: 1048576 }],
      by_context: [{ context: 'maintenance', files: 1, bytes: 1048576 }], temporary_files: 0, temporary_bytes: 0, orphan_files: 2, orphan_bytes: 2097152,
      retention_hours: 24, alert_percent: 80, workshop_quota_bytes: 524288000, max_file_bytes: 10485760, users_in_alert: 0, workshops_in_alert: 0, last_cleanup: null },
    admin_list_unlinked_files: [{ storage_path: `${MOTO}/cccccccc-1111-2222-3333-444444444444.pdf`, size_bytes: 1048576, created_at: '2026-11-01T12:00:00Z', is_orphan: true }],
  },
  fn: { 'storage-cleanup': { ok: true, deleted_files: 2, deleted_bytes: 2097152, failed_files: 0 } },
}), mobile, async ({ page, calls, check, go }) => {
  await go('/admin/armazenamento')
  await page.getByRole('button', { name: 'Limpar arquivos sem vínculo' }).click()
  await page.getByRole('button', { name: 'Apagar arquivos' }).click()
  check(!calls.some((c) => c.kind === 'function'), 'sem motivo não executa')
  await page.getByLabel(/Motivo/).fill('Limpeza de envios que falharam')
  await page.getByRole('button', { name: 'Apagar arquivos' }).click()
  await page.getByText(/2 arquivo\(s\) apagado\(s\)/).waitFor()
  const f = calls.find((c) => c.kind === 'function' && c.name === 'storage-cleanup')
  check(f?.body?.reason === 'Limpeza de envios que falharam', 'envia o motivo à função de limpeza')
})

// 9. Proprietário vê o aviso no sino e abre a central de notificações
await scenario('Proprietário abre as notificações pelo sino', baseWorld({
  rpc: {
    count_my_unread_notifications: (_b, calls) => (calls.some((c) => c.name === 'mark_my_notifications_read') ? 0 : 2),
    get_my_notifications: [
      { id: 'n1', kind: 'workshop_access_request', title: 'Oficina do Zé pediu acesso', body: 'A oficina pediu para ver o histórico da Honda CB 500F.',
        link: `/painel/motos/${MOTO}`, created_at: '2026-11-07T12:00:00Z', read_at: null },
      { id: 'n2', kind: 'payment_failed', title: 'Falha no pagamento', body: 'Confira o cartão.', link: '/painel/plano', created_at: '2026-11-06T12:00:00Z', read_at: null },
    ],
    mark_my_notifications_read: 2,
    get_my_notification_preferences: [{ kind: 'payment_failed', optional: false, in_app: true, email: false }, { kind: 'reminder_due', optional: true, in_app: true, email: false }],
  },
}), mobile, async ({ page, calls, check, go }) => {
  await go('/painel')
  const bell = page.getByRole('link', { name: 'Notificações: 2 não lidas' })
  await bell.waitFor()
  check(true, 'sino mostra 2 não lidas')
  await bell.click()
  await page.getByRole('heading', { name: 'Notificações' }).waitFor()
  const item = page.getByRole('link', { name: 'Oficina do Zé pediu acesso' })
  await item.waitFor()
  check((await item.getAttribute('href')) === `/painel/motos/${MOTO}`, 'aviso com link para a moto')
  await page.waitForTimeout(2200)
  check(rpcCalled(calls, 'mark_my_notifications_read').length === 1, 'marca como lidas ao abrir')
  check(await page.getByLabel(/Falhas e atrasos de pagamento no site \(essencial\)/).isDisabled(), 'aviso essencial não pode ser desligado')
})

// 8. Admin sem a segunda etapa ativa o aplicativo autenticador antes de entrar
await scenario('Admin ativa a verificação em duas etapas', baseWorld({
  rpc: {
    my_admin_access: { has_admin_role: true, aal: 'aal1', allowed: false },
    admin_get_metrics: { users_total: 3, users_new_7d: 0, users_new_30d: 3, users_restricted: 0, motorcycles_total: 1, motorcycles_new_7d: 1, workshops_total: 0,
      workshops_active: 0, workshops_unverified: 0, records_total: 0, records_30d: 0, subscriptions_active: 0, subscriptions_past_due: 0, subscriptions_canceling: 0,
      mrr_cents: 0, payments_pending: 0, payments_rejected_30d: 0, invoices_failed: 0, storage_bytes: 0, files_total: 0, transfers_pending: 0,
      access_requests_pending: 0, claims_pending: 0, reports_30d: 0, billing_environment: 'test' },
  },
}), mobile, async ({ page, calls, check, go }) => {
  await go('/admin')
  await page.getByRole('heading', { name: 'Verificação em duas etapas' }).waitFor()
  check(!rpcCalled(calls, 'admin_get_metrics').length, 'sem a segunda etapa não carrega dados administrativos')
  await page.getByRole('button', { name: 'Ativar agora' }).click()
  await page.getByAltText('QR Code para o aplicativo autenticador').waitFor()
  check(await page.getByText('JBSWY3DPEHPK3PXP').isVisible(), 'mostra QR Code e chave')
  await page.getByLabel('Código de 6 números').fill('000000')
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await page.getByText(/Código incorreto/).waitFor()
  check(true, 'código errado é recusado com mensagem clara')
  await page.getByLabel('Código de 6 números').fill('123456')
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await page.getByRole('heading', { name: 'Administração' }).waitFor()
  check(rpcCalled(calls, 'admin_get_metrics').length > 0, 'depois do código certo entra na administração')
})

await browser.close()

let failed = 0
for (const r of results) {
  const bad = r.checks.filter((c) => !c.ok)
  failed += bad.length
  console.log(`${bad.length ? 'FALHOU' : 'OK    '}  ${r.name}`)
  for (const c of r.checks) console.log(`        ${c.ok ? '✓' : '✗'} ${c.label}`)
}
const total = results.reduce((s, r) => s + r.checks.length, 0)
console.log(`\n${results.length} cenários, ${total - failed}/${total} verificações aprovadas.`)
process.exit(failed ? 1 : 0)
