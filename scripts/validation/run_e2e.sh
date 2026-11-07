#!/usr/bin/env bash
# Testes ponta a ponta da interface com navegador real e Supabase simulado (tests/e2e/run.mjs).
# Não acessa a internet nem o Supabase. Requer Playwright com Chromium instalado
# (PLAYWRIGHT_MODULE aponta para o index.mjs do pacote; padrão do ambiente do Claude).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${E2E_DIST:-/tmp/mp-e2e-dist}"
PORT="${E2E_PORT:-4175}"
cd "$ROOT"
VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_mock \
  npx vite build --outDir "$OUT" --emptyOutDir >/dev/null
npx vite preview --outDir "$OUT" --port "$PORT" --strictPort >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do curl -s -o /dev/null "http://localhost:$PORT" && break; sleep 0.2; done
E2E_BASE="http://localhost:$PORT" node tests/e2e/run.mjs
