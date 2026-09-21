#!/usr/bin/env bash
# Imports the CSV export into Supabase in ONE transaction, owned by an existing Supabase Auth user.
#
#   SUPABASE_DB_URL=postgresql://postgres.<ref>@<pooler-host>:5432/postgres \
#   OWNER_USER_ID=<auth.users id of the owner> \
#     scripts/migrate-data/import-supabase.sh [data-dir]
#
# This is the only privileged step of the migration: it connects with the database password
# (PGPASSWORD / ~/.pgpass), never with the service_role API key, and runs from an admin machine.
# It refuses to run when the target tables already contain data.
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the Supabase Postgres connection string (session pooler or direct)}"
: "${OWNER_USER_ID:?Set OWNER_USER_ID to the Supabase Auth user id that will own the data}"
DATA_DIR="$(cd "${1:-migration-data}" && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! "$OWNER_USER_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "OWNER_USER_ID must be a UUID." >&2
  exit 1
fi
if [[ "$DATA_DIR" == *"'"* || "$SCRIPT_DIR" == *"'"* ]]; then
  echo "Paths must not contain single quotes." >&2
  exit 1
fi

TABLES=(project task subtask focus_session goal note journal_entry)
for table in "${TABLES[@]}"; do
  [[ -f "${DATA_DIR}/${table}.csv" ]] || { echo "Missing ${DATA_DIR}/${table}.csv" >&2; exit 1; }
done

{
  echo "\\set ON_ERROR_STOP on"
  echo "begin;"
  echo "\\i '${SCRIPT_DIR}/staging.sql'"
  for table in "${TABLES[@]}"; do
    echo "\\copy pg_temp.legacy_${table} from '${DATA_DIR}/${table}.csv' with (format csv, header true)"
  done
  echo "select set_config('migration.owner_id', :'owner_id', true);"
  echo "\\i '${SCRIPT_DIR}/transform.sql'"
  echo "commit;"
} | PGOPTIONS="-c timezone=UTC" psql "$SUPABASE_DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 -v owner_id="$OWNER_USER_ID"

echo "Import committed. Verify with:"
echo "  psql \"\$SUPABASE_DB_URL\" -v owner_id=${OWNER_USER_ID} -f ${SCRIPT_DIR}/verify.sql"
