#!/usr/bin/env bash
# Regressão completa (PRD 19.2, ADR-027). Rodar antes de cada publicação.
#   1. Tipos do site          4. Banco de teste (segurança, regras, varredura, backup/restauração/rollback) — se PGHOST
#   2. Testes unitários/tela  5. Ponta a ponta no navegador (Supabase simulado)
#   3. Tipos das Edge Functions
# Não acessa produção. Os testes no Supabase real ficam em tests/security/supabase/ (transação desfeita).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
STATUS=0
step() {
  local name="$1"; shift
  printf '\n=== %s ===\n' "$name"
  if "$@"; then printf -- '--> %s: OK\n' "$name"; else printf -- '--> %s: FALHOU\n' "$name"; STATUS=1; fi
}
step "Tipos do site" npx tsc -b
step "Testes unitários e de tela" npx vitest run
step "Tipos das Edge Functions" scripts/validation/check_edge_functions.sh
if [ -n "${PGHOST:-}" ]; then
  step "Banco de teste" bash -c 'scripts/validation/run_db_tests.sh > /tmp/mp-db-tests.log 2>&1 && grep -c PASSARAM /tmp/mp-db-tests.log | xargs -I{} echo "{} suítes aprovadas (log em /tmp/mp-db-tests.log)"'
  step "Backup, restauração e rollback" bash -c 'scripts/ops/restore_check.sh 2>&1 | grep -v NOTICE | tail -1; exit ${PIPESTATUS[0]}'
else
  printf '\n=== Banco de teste ===\n--> pulado: defina PGHOST/PGPORT/PGUSER de um PostgreSQL de teste\n'
fi
step "Ponta a ponta" env NO_PROXY=localhost no_proxy=localhost scripts/validation/run_e2e.sh
printf '\n%s\n' "$([ $STATUS -eq 0 ] && echo 'REGRESSÃO COMPLETA: TUDO APROVADO' || echo 'REGRESSÃO COM FALHAS')"
exit $STATUS
