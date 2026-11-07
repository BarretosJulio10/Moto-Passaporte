#!/usr/bin/env bash
# Verifica os tipos das Edge Functions (Deno) com o TypeScript do projeto, usando um shim mínimo do Deno.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
cat > "$TMP/deno-shim.d.ts" <<'SHIM'
declare module 'npm:@supabase/supabase-js@2' { export * from '@supabase/supabase-js' }
declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void }
SHIM
FILES=$(ls "$ROOT"/supabase/functions/*/index.ts | sed 's/.*/"&"/' | paste -sd, -)
cat > "$TMP/tsconfig.json" <<JSON
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "strict": true, "noEmit": true,
  "allowImportingTsExtensions": true, "lib": ["ES2022", "DOM"], "skipLibCheck": true, "ignoreDeprecations": "6.0", "types": [],
  "baseUrl": "$ROOT", "paths": { "@supabase/supabase-js": ["node_modules/@supabase/supabase-js"] } },
  "files": ["$TMP/deno-shim.d.ts", $FILES] }
JSON
"$ROOT/node_modules/.bin/tsc" -p "$TMP/tsconfig.json"
echo "Edge Functions: tipos OK"
