-- Session-local staging tables mirroring the legacy (Spring/Flyway) schema column order.
-- Loaded with \copy from the CSV files produced by export-legacy.sh, then consumed by transform.sql.
-- Temporary tables disappear when the psql session ends.
create temporary table legacy_project (
    id bigint primary key, title text, description text, status text, start_date date, due_date date,
    archived_at timestamptz, created_at timestamptz, updated_at timestamptz
);

create temporary table legacy_task (
    id bigint primary key, project_id bigint, title text, description text, status text, priority text,
    estimated_minutes int, due_date date, completed_at timestamptz, created_at timestamptz, updated_at timestamptz
);

create temporary table legacy_subtask (
    id bigint primary key, task_id bigint, title text, completed boolean, created_at timestamptz
);

create temporary table legacy_focus_session (
    id bigint primary key, task_id bigint, project_id bigint, started_at timestamptz, ended_at timestamptz,
    planned_focus_minutes int, planned_break_minutes int, paused_seconds_accum bigint, last_paused_at timestamptz,
    actual_focus_seconds bigint, status text, notes text, created_at timestamptz, version int
);

create temporary table legacy_goal (
    id bigint primary key, title text, description text, type text, target_value int, period text,
    start_date date, end_date date, status text, project_id bigint, created_at timestamptz, updated_at timestamptz
);

create temporary table legacy_note (
    id bigint primary key, title text, content text, pinned boolean, project_id bigint,
    created_at timestamptz, updated_at timestamptz
);

create temporary table legacy_journal_entry (
    id bigint primary key, entry_date date, content text, created_at timestamptz, updated_at timestamptz
);
