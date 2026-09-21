-- Post-import checks. Run as an admin role:
--   psql "$SUPABASE_DB_URL" -v owner_id=<uuid> -f scripts/migrate-data/verify.sql
-- Compare the counts with migration-data/legacy-counts.txt produced by export-legacy.sh.
\echo 'Row counts owned by the migrated user:'
select 'project' as table_name, count(*) as rows from public.project where user_id = :'owner_id'
union all select 'task', count(*) from public.task where user_id = :'owner_id'
union all select 'subtask', count(*) from public.subtask where user_id = :'owner_id'
union all select 'focus_session', count(*) from public.focus_session where user_id = :'owner_id'
union all select 'goal', count(*) from public.goal where user_id = :'owner_id'
union all select 'note', count(*) from public.note where user_id = :'owner_id'
union all select 'journal_entry', count(*) from public.journal_entry where user_id = :'owner_id'
order by 1;

\echo 'Rows owned by anyone else (expected: 0 for a single-owner install):'
select count(*) as foreign_rows from (
    select user_id from public.project union all select user_id from public.task
    union all select user_id from public.focus_session union all select user_id from public.goal
    union all select user_id from public.note union all select user_id from public.journal_entry
) r where user_id <> :'owner_id';

\echo 'Active focus sessions (expected: 0 or 1):'
select count(*) as active_sessions from public.focus_session
where user_id = :'owner_id' and status in ('RUNNING', 'PAUSED');

\echo 'Constraints not yet validated (expected: none):'
select conrelid::regclass as table_name, conname from pg_constraint
where connamespace = 'public'::regnamespace and not convalidated;

\echo 'Row level security enabled per table (expected: all true):'
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname;

\echo 'Next id per table (next_id must be greater than max_id):'
select 'project' as table_name, (select max(id) from public.project) as max_id,
       (select case when is_called then last_value + 1 else last_value end from public.project_id_seq) as next_id
union all select 'task', (select max(id) from public.task),
       (select case when is_called then last_value + 1 else last_value end from public.task_id_seq)
union all select 'subtask', (select max(id) from public.subtask),
       (select case when is_called then last_value + 1 else last_value end from public.subtask_id_seq)
union all select 'focus_session', (select max(id) from public.focus_session),
       (select case when is_called then last_value + 1 else last_value end from public.focus_session_id_seq)
union all select 'goal', (select max(id) from public.goal),
       (select case when is_called then last_value + 1 else last_value end from public.goal_id_seq)
union all select 'note', (select max(id) from public.note),
       (select case when is_called then last_value + 1 else last_value end from public.note_id_seq)
union all select 'journal_entry', (select max(id) from public.journal_entry),
       (select case when is_called then last_value + 1 else last_value end from public.journal_entry_id_seq);
