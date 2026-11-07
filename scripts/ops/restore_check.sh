#!/usr/bin/env bash
# Teste de backup, restauração e rollback (PRD 18.4, 20; Fase 6.5, ADR-028). Só em banco de TESTE.
# Pré-requisito: scripts/validation/run_db_tests.sh já rodou (banco moto_passaporte_test com dados).
#  1. Conta linhas de todas as tabelas do banco de origem.
#  2. Backup como na produção (só dados) → criptografia com age (chave só do teste) → descriptografia.
#  3. Restaura como na produção (migrações do Git + dados, gatilhos desligados) e compara linhas,
#     RLS, funções, permissões, bucket, varredura de segurança e acesso do titular.
#  4. Rollback: aplica os scripts supabase/rollback/*.down.sql (do mais novo ao mais antigo), confere
#     que os objetos saíram e que nada ficou inseguro; reaplica as migrações e roda a suíte da 6.3.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres scripts/ops/restore_check.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="${TEST_DB:-moto_passaporte_test}"
DST="${SRC}_restore"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PSQL=(psql -v ON_ERROR_STOP=1 -qAt)
fail() { echo "FALHOU: $*"; exit 1; }
ok() { echo "OK  $*"; }

SNAP="select string_agg(format('%s.%s=%s', n.nspname, c.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text), ';' order by n.nspname, c.relname)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p') and n.nspname in ('public', 'auth', 'storage', 'vault')"
SHAPE="select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') || '|' ||
              (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relrowsecurity) || '|' ||
              (select count(*) from pg_policies where schemaname in ('public', 'storage')) || '|' ||
              (select md5(string_agg(p.oid::regprocedure::text || coalesce(array_to_string(p.proacl, ','), ''), ';' order by p.oid::regprocedure::text))
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public')"
SWEEP_COUNT() { "${PSQL[@]}" -d "$1" -c "$(cat "$ROOT/tests/security/sweep_violations.sql.inc")" -c "select count(*) from sweep"; }

echo "--- Fase 6.5: backup, restauração e rollback"
src_rows=$("${PSQL[@]}" -d "$SRC" -c "$SNAP")
src_shape=$("${PSQL[@]}" -d "$SRC" -c "$SHAPE")
total=$("${PSQL[@]}" -d "$SRC" -c "select count(*) from public.audit_logs")
[ "$total" -gt 0 ] || fail "banco de origem sem dados (rode run_db_tests.sh antes)"
ok "origem com dados ($(echo "$src_rows" | tr ';' '\n' | wc -l) tabelas, $total eventos de auditoria)"

# Backup como na produção: só dados (public + contas + metadados de arquivos), criptografado com age.
# Só a chave pública fica no servidor de backup.
age-keygen -o "$WORK/key.txt" 2>/dev/null
RECIPIENT=$(grep -o 'age1[0-9a-z]*' "$WORK/key.txt" | head -1)
mkdir "$WORK/bk"
pg_dump -Fc --data-only -n public -d "$SRC" 2>/dev/null -f "$WORK/bk/public_data.dump"
pg_dump -Fc --data-only -t auth.users -t auth.identities -t storage.buckets -t storage.objects -d "$SRC" -f "$WORK/bk/auth_storage_data.dump"
tar -C "$WORK/bk" -cf - . | age -r "$RECIPIENT" -o "$WORK/db.tar.age"
rm -rf "$WORK/bk"
if tar -tf "$WORK/db.tar.age" >/dev/null 2>&1; then fail "arquivo criptografado legível sem a chave"; fi
ok "backup criptografado não é legível sem a chave"
mkdir "$WORK/rs"
age -d -i "$WORK/key.txt" "$WORK/db.tar.age" | tar -C "$WORK/rs" -xf -
ok "backup descriptografado com a chave privada"

# Restauração (OPERATIONS.md §3): projeto novo → migrações do Git → limpa dados semeados → dados do backup
"${PSQL[@]}" -d postgres -c "drop database if exists $DST" -c "create database $DST"
sed '/^create role/d' "$ROOT/tests/db/supabase_stub.sql" | "${PSQL[@]}" -d "$DST" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -d "$DST" -f "$f" >/dev/null; done
PGOPTIONS='-c session_replication_role=replica' "${PSQL[@]}" -d "$DST" -c "do \$\$ declare t text; begin
  for t in select format('%I.%I', schemaname, tablename) from pg_tables where schemaname = 'public' loop
    execute 'truncate ' || t || ' cascade'; end loop;
  delete from storage.objects; delete from storage.buckets; end \$\$;" >/dev/null
for f in auth_storage_data public_data; do
  PGOPTIONS='-c session_replication_role=replica' pg_restore -d "$DST" --data-only --exit-on-error "$WORK/rs/$f.dump"
done
SNAP_APP="${SNAP//\'auth\', /}"; SNAP_APP="${SNAP_APP//, \'vault\'/}"
src_rows=$("${PSQL[@]}" -d "$SRC" -c "$SNAP_APP")
dst_rows=$("${PSQL[@]}" -d "$DST" -c "$SNAP_APP")
[ "$src_rows" = "$dst_rows" ] || { diff <(echo "$src_rows" | tr ';' '\n') <(echo "$dst_rows" | tr ';' '\n') | head; fail "linhas diferentes após restaurar"; }
for t in users identities; do
  [ "$("${PSQL[@]}" -d "$SRC" -c "select to_regclass('auth.$t') is not null")" = t ] || continue
  [ "$("${PSQL[@]}" -d "$SRC" -c "select count(*) from auth.$t")" = "$("${PSQL[@]}" -d "$DST" -c "select count(*) from auth.$t")" ] || fail "auth.$t diferente"
done
ok "mesmas linhas em todas as tabelas do app, contas e metadados de arquivos"
[ "$("${PSQL[@]}" -d "$DST" -c "select count(*) from public.profiles p join auth.users u on u.id = p.id")" = "$("${PSQL[@]}" -d "$SRC" -c "select count(*) from public.profiles")" ] \
  || fail "perfis duplicados ou órfãos (gatilho de nova conta disparou na restauração?)"
ok "gatilhos desligados na carga: nenhum perfil duplicado"
dst_shape=$("${PSQL[@]}" -d "$DST" -c "$SHAPE")
[ "$src_shape" = "$dst_shape" ] || fail "funções/RLS/políticas/permissões diferentes após restaurar ($src_shape × $dst_shape)"
ok "mesmas funções, RLS, políticas e permissões (estrutura das migrações)"
[ "$("${PSQL[@]}" -d "$DST" -c "select string_agg(id || ':' || public, ',') from storage.buckets")" = "attachments:false" ] || fail "bucket"
[ "$(SWEEP_COUNT "$DST")" = 0 ] || fail "varredura de segurança com violações no banco restaurado"
ok "bucket privado e varredura de segurança sem violações no banco restaurado"
"${PSQL[@]}" -d "$DST" -c "select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); set role authenticated;
  select count(*) from public.my_motorcycles" > "$WORK/a.txt"
[ "$(tail -1 "$WORK/a.txt")" = "$("${PSQL[@]}" -d "$SRC" -c "select count(*) from public.motorcycle_ownerships where owner_user_id = '11111111-1111-1111-1111-111111111111' and ended_at is null")" ] \
  || fail "titular não vê as próprias motos após restaurar"
ok "titular vê as próprias motos no banco restaurado (RLS funcionando com os dados)"

# Rollback das migrações da Fase 6 (mais nova → mais antiga) e reaplicação
for f in $(ls "$ROOT"/supabase/rollback/*.down.sql | sort -r); do
  "${PSQL[@]}" -d "$DST" -f "$f" >/dev/null
done
gone=$("${PSQL[@]}" -d "$DST" -c "select count(*) from (values ('admin_storage_overview'), ('admin_resolve_claim'), ('admin_update_setting'), ('admin_get_metrics'), ('mask_email'), ('admin_job_status'), ('my_admin_access'), ('get_my_notifications')) v(f)
                                   where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = v.f)")
[ "$gone" = 0 ] || fail "rollback deixou funções para trás"
cols=$("${PSQL[@]}" -d "$DST" -c "select count(*) from information_schema.columns where table_schema = 'public' and column_name in ('account_status', 'owner_notified_at')")
[ "$cols" = 0 ] || fail "rollback deixou colunas para trás"
ok "rollback remove funções, colunas e tabelas das 7 migrações"
[ "$("${PSQL[@]}" -d "$DST" -c "select count(*) from public.motorcycles")" = "$("${PSQL[@]}" -d "$SRC" -c "select count(*) from public.motorcycles")" ] || fail "rollback mexeu em motos"
[ "$("${PSQL[@]}" -d "$DST" -c "select count(*) from public.maintenance_records")" = "$("${PSQL[@]}" -d "$SRC" -c "select count(*) from public.maintenance_records")" ] || fail "rollback mexeu no histórico"
ok "histórico e motos intactos após o rollback"
w=$("${PSQL[@]}" -d "$DST" -c "select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'system_settings' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')")
[ "$w" = 0 ] || fail "rollback reabriu escrita direta em system_settings"
ok "rollback não reabre a falha de segurança corrigida (escrita direta em configurações)"

for v in 20261107204757 20261107205649 20261107211016 20261107211152 20261107212126 20261107223027 20261107223918 20261107225331; do
  "${PSQL[@]}" -d "$DST" -f "$(ls "$ROOT"/supabase/migrations/${v}_*.sql)" >/dev/null
done
[ "$(SWEEP_COUNT "$DST")" = 0 ] || fail "varredura com violações após reaplicar"
[ "$("${PSQL[@]}" -d "$DST" -c "$SHAPE" | cut -d'|' -f1-3)" = "$(echo "$src_shape" | cut -d'|' -f1-3)" ] || fail "estrutura diferente após reaplicar"
ok "migrações reaplicadas: mesma estrutura e varredura sem violações"
sed -n '/^create schema tests;/,/^grant execute on all functions in schema tests/p' "$ROOT/tests/security/phase1_rls_test.sql" | "${PSQL[@]}" -d "$DST" >/dev/null
"${PSQL[@]}" -d "$DST" -f "$ROOT/tests/security/phase6e_security_sweep_test.sql" >/dev/null 2>&1 || fail "varredura (com brechas plantadas) após reaplicar"
ok "teste da varredura (10 brechas plantadas) passa no banco restaurado e reaplicado"

[ -n "${KEEP_RESTORE_DB:-}" ] || "${PSQL[@]}" -d postgres -c "drop database $DST"
echo "=== TODOS OS TESTES DA FASE 6.5 (BACKUP, RESTAURAÇÃO E ROLLBACK) PASSARAM ==="
