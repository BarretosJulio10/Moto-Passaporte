// Gera o projeto Android (TWA, ADR-063) a partir de android/twa-manifest.json com o Bubblewrap.
// Uso no GitHub Actions: node android/build-twa.mjs <pasta-de-saida>
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(resolve(process.cwd(), 'package.json'))
const { TwaManifest, TwaGenerator, ConsoleLog } = require('@bubblewrap/core')

const out = resolve(process.argv[2] ?? 'twa-project')
const json = JSON.parse(await readFile(new URL('./twa-manifest.json', import.meta.url), 'utf8'))
const manifest = new TwaManifest(json)
const problem = manifest.validate()
if (problem) throw new Error(`twa-manifest.json inválido: ${problem}`)
await new TwaGenerator().createTwaProject(out, manifest, new ConsoleLog('twa'))
console.log(`Projeto gerado em ${out}`)
