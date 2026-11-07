// Copia todos os arquivos do bucket privado "attachments" para uma pasta local (ADR-028).
// Uso (no GitHub Actions ou na máquina do responsável, nunca no navegador):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ops/backup_storage.mjs <pasta-destino>
// A pasta é empacotada e criptografada pelo workflow de backup. A chave service_role nunca é registrada.
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const [dest] = process.argv.slice(2)
if (!dest) throw new Error('Informe a pasta de destino.')
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
const BUCKET = 'attachments'
const supabase = createClient(url, key, { auth: { persistSession: false } })

async function list(prefix) {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`Falha ao listar ${prefix || '/'}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) return out
  }
}

let files = 0
let bytes = 0
const manifest = []
for (const folder of await list('')) {
  // Pastas (id da moto) vêm sem id; arquivos soltos na raiz não são esperados, mas também são copiados.
  const entries = folder.id ? [{ ...folder, path: folder.name }] : (await list(folder.name)).map((f) => ({ ...f, path: `${folder.name}/${f.name}` }))
  for (const f of entries) {
    const { data, error } = await supabase.storage.from(BUCKET).download(f.path)
    if (error) throw new Error(`Falha ao baixar ${f.path}: ${error.message}`)
    const buf = Buffer.from(await data.arrayBuffer())
    const target = join(dest, f.path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, buf)
    files += 1
    bytes += buf.length
    manifest.push({ path: f.path, size: buf.length, updated_at: f.updated_at })
  }
}
await writeFile(join(dest, 'MANIFEST.json'), JSON.stringify({ bucket: BUCKET, files, bytes, generated_at: new Date().toISOString(), items: manifest }, null, 2))
console.log(`Arquivos copiados: ${files} (${bytes} bytes).`)
