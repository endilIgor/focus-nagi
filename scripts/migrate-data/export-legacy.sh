#!/usr/bin/env bash
# Exports the legacy Spring/PostgreSQL data to CSV files (one per table) plus row counts.
#
#   LEGACY_DATABASE_URL=postgresql://USER@HOST:5432/focusnagi \
#     scripts/migrate-data/export-legacy.sh [output-dir]
#
# Provide the password through PGPASSWORD or ~/.pgpass, never inside the repository.
# The output directory (default: ./migration-data) contains personal data: keep it private,
# outside git (it is gitignored), and delete it after the migration is verified.
set -euo pipefail

: "${LEGACY_DATABASE_URL:?Set LEGACY_DATABASE_URL to the legacy PostgreSQL connection string}"
OUT_DIR="${1:-migration-data}"

if [[ "$OUT_DIR" == *"'"* ]]; then
  echo "Output directory must not contain single quotes." >&2
  exit 1
fi

umask 077
mkdir -p "$OUT_DIR"

declare -A COLUMNS=(
  [project]="id, title, description, status, start_date, due_date, archived_at, created_at, updated_at"
  [task]="id, project_id, title, description, status, priority, estimated_minutes, due_date, completed_at, created_at, updated_at"
  [subtask]="id, task_id, title, completed, created_at"
  [focus_session]="id, task_id, project_id, started_at, ended_at, planned_focus_minutes, planned_break_minutes, paused_seconds_accum, last_paused_at, actual_focus_seconds, status, notes, created_at, version"
  [goal]="id, title, description, type, target_value, period, start_date, end_date, status, project_id, created_at, updated_at"
  [note]="id, title, content, pinned, project_id, created_at, updated_at"
  [journal_entry]="id, entry_date, content, created_at, updated_at"
)
TABLES=(project task subtask focus_session goal note journal_entry)

psql_legacy() {
  PGOPTIONS="-c default_transaction_read_only=on -c timezone=UTC" \
    psql "$LEGACY_DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 "$@"
}

for table in "${TABLES[@]}"; do
  psql_legacy -q -c "\\copy (select ${COLUMNS[$table]} from ${table} order by id) to '${OUT_DIR}/${table}.csv' with (format csv, header true)"
  echo "exported ${table}"
done

counts_sql="select 'project', count(*) from project"
for table in "${TABLES[@]:1}"; do
  counts_sql+=" union all select '${table}', count(*) from ${table}"
done
psql_legacy -At -F ' ' -c "${counts_sql}" > "${OUT_DIR}/legacy-counts.txt"

echo "Legacy row counts:"
cat "${OUT_DIR}/legacy-counts.txt"
echo "Export complete in ${OUT_DIR}"
