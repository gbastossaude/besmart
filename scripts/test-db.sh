#!/usr/bin/env bash
# Sobe um PostgreSQL descartável, imita o Supabase (tests/db/00-supabase-stub.sql),
# aplica supabase/migrations/* em ordem — DUAS vezes, para provar que são
# idempotentes — e roda os testes tests/db/*.test.sql.
#   bash scripts/test-db.sh
set -euo pipefail
shopt -s nullglob
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DADOS="$(pwd)/.pgdata"
PORTA="${PGPORT_TESTE:-54329}"
SOCK="$DADOS/sock"
COMO=()
if [ "$(id -u)" = "0" ]; then COMO=(runuser -u postgres --); fi

rm -rf "$DADOS"; mkdir -p "$SOCK"
[ "$(id -u)" = "0" ] && chown -R postgres "$DADOS"
"${COMO[@]}" "$PGBIN/initdb" -D "$DADOS/db" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
"${COMO[@]}" "$PGBIN/pg_ctl" -D "$DADOS/db" -o "-p $PORTA -k $SOCK -c listen_addresses=''" -l "$DADOS/log" start -w >/dev/null
trap '"${COMO[@]}" "$PGBIN/pg_ctl" -D "$DADOS/db" stop -m fast >/dev/null; rm -rf "$DADOS"' EXIT

PSQL=("${COMO[@]}" "$PGBIN/psql" -h "$SOCK" -p "$PORTA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f tests/db/00-supabase-stub.sql >/dev/null
for rodada in 1 2; do
  for m in supabase/migrations/*.sql; do
    "${PSQL[@]}" -f "$m" >/dev/null 2>"$DADOS/err" || { echo "FALHOU ao aplicar $m (rodada $rodada)"; cat "$DADOS/err"; exit 1; }
  done
done
echo "migrations aplicadas duas vezes sem erro"
falhas=0
for t in tests/db/*.test.sql; do
  if "${PSQL[@]}" -tA -f "$t" >"$DADOS/out" 2>&1; then
    echo "ok    $t ($(grep -c '^ok' "$DADOS/out" || true) verificações)"
  else
    echo "FALHA $t"; cat "$DADOS/out"; falhas=1
  fi
done
exit $falhas
