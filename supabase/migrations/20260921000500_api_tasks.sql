-- Task and subtask API functions. Idempotent.

create or replace function app_private.subtask_json(s public.subtask)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'completed', s.completed,
        'createdAt', app_private.iso(s.created_at)
    )
$$;

-- p_subtasks = null renders the list summary shape (`"subtasks": null`), like the original API.
create or replace function app_private.task_json(t public.task, p_subtasks jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'description', t.description,
        'status', t.status,
        'priority', t.priority,
        'estimatedMinutes', t.estimated_minutes,
        'dueDate', t.due_date,
        'projectId', t.project_id,
        'completedAt', app_private.iso(t.completed_at),
        'createdAt', app_private.iso(t.created_at),
        'updatedAt', app_private.iso(t.updated_at),
        'subtasks', p_subtasks
    )
$$;

create or replace function app_private.task_subtasks_json(p_task_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select coalesce(pg_catalog.jsonb_agg(app_private.subtask_json(s) order by s.id), '[]'::jsonb)
    from public.subtask s
    where s.task_id = p_task_id
$$;

create or replace function app_private.lock_task(p_uid uuid, p_id bigint)
returns public.task
language plpgsql
set search_path = ''
as $$
declare
    v_row public.task;
begin
    select * into v_row from public.task where id = p_id and user_id = p_uid for update;
    if not found then
        perform app_private.fail('TASK_NOT_FOUND');
    end if;
    return v_row;
end
$$;

create or replace function public.api_task_create(
    p_title text, p_description text, p_priority text, p_estimated_minutes int, p_due_date date, p_project_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_now timestamptz := app_private.clock_now();
    v_row public.task;
begin
    perform app_private.require_project(v_uid, p_project_id);
    insert into public.task (user_id, title, description, priority, estimated_minutes, due_date, project_id, created_at, updated_at)
    values (v_uid, pg_catalog.btrim(p_title), p_description, coalesce(p_priority, 'MEDIUM'), p_estimated_minutes,
            p_due_date, p_project_id, v_now, v_now)
    returning * into v_row;
    return app_private.task_json(v_row, null);
end
$$;

create or replace function public.api_task_list(
    p_status text, p_project_id bigint, p_priority text, p_page int, p_size int)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_page int := app_private.clamp_page(p_page);
    v_size int := app_private.clamp_size(p_size, 20);
    v_total bigint;
    v_content jsonb;
begin
    select pg_catalog.count(*) into v_total
    from public.task t
    where t.user_id = v_uid
      and (p_status is null or t.status = p_status)
      and (p_project_id is null or t.project_id = p_project_id)
      and (p_priority is null or t.priority = p_priority);

    select coalesce(pg_catalog.jsonb_agg(app_private.task_json(s.t, null) order by (s.t).created_at desc, (s.t).id desc), '[]'::jsonb)
    into v_content
    from (
        select t
        from public.task t
        where t.user_id = v_uid
          and (p_status is null or t.status = p_status)
          and (p_project_id is null or t.project_id = p_project_id)
          and (p_priority is null or t.priority = p_priority)
        order by t.created_at desc, t.id desc
        limit v_size offset v_page::bigint * v_size
    ) s;

    return app_private.page_json(v_content, v_total, v_page, v_size);
end
$$;

create or replace function public.api_project_task_list(p_project_id bigint, p_page int, p_size int)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
begin
    if p_project_id is null then
        perform app_private.fail('PROJECT_NOT_FOUND');
    end if;
    perform app_private.require_project(v_uid, p_project_id);
    return public.api_task_list(null, p_project_id, null, p_page, coalesce(p_size, 50));
end
$$;

create or replace function public.api_task_get(p_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.task;
begin
    select * into v_row from public.task where id = p_id and user_id = v_uid;
    if not found then
        perform app_private.fail('TASK_NOT_FOUND');
    end if;
    return app_private.task_json(v_row, app_private.task_subtasks_json(v_row.id));
end
$$;

-- title/description/priority/estimatedMinutes: null keeps the stored value.
-- dueDate/projectId are always applied (null clears them), matching the original API.
create or replace function public.api_task_update(
    p_id bigint, p_title text, p_description text, p_priority text, p_estimated_minutes int, p_due_date date,
    p_project_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.task := app_private.lock_task(v_uid, p_id);
begin
    perform app_private.require_project(v_uid, p_project_id);
    update public.task
    set title = coalesce(pg_catalog.btrim(p_title), v_row.title),
        description = coalesce(p_description, v_row.description),
        priority = coalesce(p_priority, v_row.priority),
        estimated_minutes = coalesce(p_estimated_minutes, v_row.estimated_minutes),
        due_date = p_due_date,
        project_id = p_project_id,
        updated_at = app_private.clock_now()
    where id = p_id and user_id = v_uid
    returning * into v_row;
    return app_private.task_json(v_row, app_private.task_subtasks_json(v_row.id));
end
$$;

-- p_action: start | complete | reopen | cancel.
create or replace function public.api_task_transition(p_id bigint, p_action text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_now timestamptz := app_private.clock_now();
    v_row public.task := app_private.lock_task(v_uid, p_id);
begin
    case p_action
        when 'start' then
            if v_row.status <> 'TODO' then
                perform app_private.fail('INVALID_TASK_STATE', 'Only a pending task can be started.');
            end if;
            update public.task set status = 'IN_PROGRESS', updated_at = v_now
            where id = p_id and user_id = v_uid returning * into v_row;
        when 'complete' then
            if v_row.status not in ('TODO', 'IN_PROGRESS') then
                perform app_private.fail('INVALID_TASK_STATE', 'Only a pending or in-progress task can be completed.');
            end if;
            update public.task set status = 'COMPLETED', completed_at = v_now, updated_at = v_now
            where id = p_id and user_id = v_uid returning * into v_row;
        when 'reopen' then
            if v_row.status <> 'COMPLETED' then
                perform app_private.fail('INVALID_TASK_STATE', 'Only a completed task can be reopened.');
            end if;
            update public.task set status = 'TODO', completed_at = null, updated_at = v_now
            where id = p_id and user_id = v_uid returning * into v_row;
        when 'cancel' then
            if v_row.status not in ('TODO', 'IN_PROGRESS') then
                perform app_private.fail('INVALID_TASK_STATE', 'Only a pending or in-progress task can be cancelled.');
            end if;
            update public.task set status = 'CANCELLED', updated_at = v_now
            where id = p_id and user_id = v_uid returning * into v_row;
        else
            raise exception using errcode = '22023', message = 'unknown task action';
    end case;
    return app_private.task_json(v_row, null);
end
$$;

create or replace function public.api_task_delete(p_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
begin
    perform app_private.lock_task(v_uid, p_id);
    if exists (select 1 from public.focus_session where task_id = p_id and user_id = v_uid) then
        perform app_private.fail('TASK_HAS_FOCUS_SESSIONS');
    end if;
    delete from public.task where id = p_id and user_id = v_uid;
end
$$;

create or replace function public.api_subtask_create(p_task_id bigint, p_title text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.subtask;
begin
    perform app_private.lock_task(v_uid, p_task_id);
    insert into public.subtask (user_id, task_id, title, created_at)
    values (v_uid, p_task_id, pg_catalog.btrim(p_title), app_private.clock_now())
    returning * into v_row;
    return app_private.subtask_json(v_row);
end
$$;

create or replace function public.api_subtask_set_completed(p_task_id bigint, p_subtask_id bigint, p_completed boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.subtask;
begin
    perform app_private.lock_task(v_uid, p_task_id);
    update public.subtask set completed = p_completed
    where id = p_subtask_id and task_id = p_task_id and user_id = v_uid
    returning * into v_row;
    if not found then
        perform app_private.fail('SUBTASK_NOT_FOUND');
    end if;
    return app_private.subtask_json(v_row);
end
$$;

create or replace function public.api_subtask_delete(p_task_id bigint, p_subtask_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
begin
    perform app_private.lock_task(v_uid, p_task_id);
    delete from public.subtask where id = p_subtask_id and task_id = p_task_id and user_id = v_uid;
    if not found then
        perform app_private.fail('SUBTASK_NOT_FOUND');
    end if;
end
$$;

select app_private.secure_api_functions();
