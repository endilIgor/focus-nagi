-- Copies the staged legacy rows into the Supabase schema, owned by one Supabase Auth user.
--   * ids are preserved, so every relationship (task -> project, session -> task, ...) stays intact;
--   * the legacy `owner` row (username + BCrypt hash) is intentionally NOT migrated: the owner signs
--     in through Supabase Auth, and `migration.owner_id` names that auth.users id;
--   * identity sequences are advanced past the imported ids;
--   * row counts are verified; any failure aborts the whole transaction.
-- Requires: staging.sql loaded in the same session and `set migration.owner_id = '<uuid>'`.
do $$
declare
    v_setting text := current_setting('migration.owner_id', true);
    v_owner uuid;
    v_table text;
    v_expected bigint;
    v_actual bigint;
    v_has_rows boolean;
begin
    if v_setting is null or v_setting = '' then
        raise exception 'Set migration.owner_id to the Supabase auth user id before running transform.sql';
    end if;
    v_owner := v_setting::uuid;

    if not exists (select 1 from auth.users where id = v_owner) then
        raise exception 'Owner % does not exist in auth.users. Create the user in Supabase Auth first.', v_owner;
    end if;

    foreach v_table in array array['project', 'task', 'subtask', 'focus_session', 'goal', 'note', 'journal_entry']
    loop
        execute format('select exists (select 1 from public.%I)', v_table) into strict v_has_rows;
        if v_has_rows then
            raise exception 'Target table public.% already contains data; refusing to import twice.', v_table;
        end if;
    end loop;

    insert into public.project (id, user_id, title, description, status, start_date, due_date, archived_at,
                                created_at, updated_at)
    overriding system value
    select id, v_owner, title, description, status, start_date, due_date, archived_at, created_at, updated_at
    from pg_temp.legacy_project;

    insert into public.task (id, user_id, project_id, title, description, status, priority, estimated_minutes,
                             due_date, completed_at, created_at, updated_at)
    overriding system value
    select id, v_owner, project_id, title, description, status, priority, estimated_minutes, due_date,
           completed_at, created_at, updated_at
    from pg_temp.legacy_task;

    insert into public.subtask (id, user_id, task_id, title, completed, created_at)
    overriding system value
    select id, v_owner, task_id, title, completed, created_at
    from pg_temp.legacy_subtask;

    insert into public.focus_session (id, user_id, task_id, project_id, started_at, ended_at, planned_focus_minutes,
                                      planned_break_minutes, paused_seconds_accum, last_paused_at,
                                      actual_focus_seconds, status, notes, created_at, version)
    overriding system value
    select id, v_owner, task_id, project_id, started_at, ended_at, planned_focus_minutes, planned_break_minutes,
           paused_seconds_accum, last_paused_at, actual_focus_seconds, status, notes, created_at, version
    from pg_temp.legacy_focus_session;

    insert into public.goal (id, user_id, title, description, type, target_value, period, start_date, end_date,
                             status, project_id, created_at, updated_at)
    overriding system value
    select id, v_owner, title, description, type, target_value, period, start_date, end_date, status,
           project_id, created_at, updated_at
    from pg_temp.legacy_goal;

    insert into public.note (id, user_id, title, content, pinned, project_id, created_at, updated_at)
    overriding system value
    select id, v_owner, title, content, pinned, project_id, created_at, updated_at
    from pg_temp.legacy_note;

    insert into public.journal_entry (id, user_id, entry_date, content, created_at, updated_at)
    overriding system value
    select id, v_owner, entry_date, content, created_at, updated_at
    from pg_temp.legacy_journal_entry;

    foreach v_table in array array['project', 'task', 'subtask', 'focus_session', 'goal', 'note', 'journal_entry']
    loop
        execute format(
            'select setval(pg_get_serial_sequence(%L, ''id''), coalesce(max(id), 0) + 1, false) from public.%I',
            'public.' || v_table, v_table);

        execute format('select count(*) from pg_temp.%I', 'legacy_' || v_table) into v_expected;
        execute format('select count(*) from public.%I where user_id = $1', v_table) into v_actual using v_owner;
        if v_expected <> v_actual then
            raise exception 'Row count mismatch for %: legacy % vs imported %', v_table, v_expected, v_actual;
        end if;
        raise notice 'imported %: % rows', v_table, v_actual;
    end loop;
end
$$;
