#!/usr/bin/env bash
# Aplica as migrações num banco PostgreSQL de TESTE (com simulação do Supabase)
# e executa os testes de segurança. NUNCA apontar para produção.
#
# Uso: PGHOST=... PGPORT=... PGUSER=postgres scripts/validation/run_db_tests.sh
# Requer: psql e um servidor PostgreSQL 15+ onde PGUSER possa criar bancos.

set -euo pipefail

DB="${TEST_DB:-moto_passaporte_test}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PSQL=(psql -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB}" -c "create database ${DB}"
# Papéis do Supabase são globais no cluster; ignora erro se já existirem.
"${PSQL[@]}" -d "${DB}" -f "${ROOT}/tests/db/supabase_stub.sql" 2>/dev/null || {
  echo "Aviso: papéis já existiam no cluster; recriando banco sem eles."
  "${PSQL[@]}" -d postgres -c "drop database if exists ${DB}" -c "create database ${DB}"
  sed '/^create role/d' "${ROOT}/tests/db/supabase_stub.sql" | "${PSQL[@]}" -d "${DB}"
}

for f in "${ROOT}"/supabase/migrations/*.sql; do
  echo ">> $(basename "$f")"
  "${PSQL[@]}" -d "${DB}" -f "$f"
done

for t in "${ROOT}"/tests/security/*.sql; do
  echo ">> $(basename "$t")"
  "${PSQL[@]}" -d "${DB}" -f "$t" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
done
