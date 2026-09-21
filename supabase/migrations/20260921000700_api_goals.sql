-- Goal API functions plus the shared focus/task aggregates also used by Today and Analytics.
-- Only COMPLETED focus sessions count; windows are half-open [from, to) instants derived from
-- local calendar days in the requested time zone. Idempotent.

create or replace function app_private.focus_seconds_between(
    p_uid uuid, p_from timestamptz, p_to timestamptz, p_project_id bigint)
returns bigint
language sql
stable
set search_path = ''
as $$
    select coalesce(pg_catalog.sum(f.actual_focus_seconds), 0)::bigint
    from public.focus_session f
    where f.user_id = p_uid and f.status = 'COMPLETED'
      and f.started_at >= p_from and f.started_at < p_to
      and (p_project_id is null or f.project_id = p_project_id)
$$;

create or replace function app_private.focus_sessions_between(
    p_uid uuid, p_from timestamptz, p_to timestamptz, p_project_id bigint)
returns bigint
language sql
stable
set search_path = ''
as $$
    select pg_catalog.count(*)
    from public.focus_session f
    where f.user_id = p_uid and f.status = 'COMPLETED'
      and f.started_at >= p_from and f.started_at < p_to
      and (p_project_id is null or f.project_id = p_project_id)
$$;

create or replace function app_private.tasks_completed_between(
    p_uid uuid, p_from timestamptz, p_to timestamptz, p_project_id bigint)
returns bigint
language sql
stable
set search_path = ''
as $$
    select pg_catalog.count(*)
    from public.task t
    where t.user_id = p_uid
      and t.completed_at >= p_from and t.completed_at < p_to
      and (p_project_id is null or t.project_id = p_project_id)
$$;

create or replace function app_private.goal_json(g public.goal)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'id', g.id,
        'title', g.title,
        'description', g.description,
        'type', g.type,
        'targetValue', g.target_value,
        'period', g.period,
        'startDate', g.start_date,
        'endDate', g.end_date,
        'status', g.status,
        'projectId', g.project_id,
        'createdAt', app_private.iso(g.created_at),
        'updatedAt', app_private.iso(g.updated_at)
    )
$$;

-- DAILY/WEEKLY/MONTHLY track the calendar window containing today (ISO weeks start on Monday);
-- CUSTOM uses the goal's own range (a single day when end_date is null).
create or replace function app_private.goal_progress(g public.goal, p_tz text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
    v_today date := app_private.local_today(p_tz);
    v_start date;
    v_end date;
    v_from timestamptz;
    v_to timestamptz;
    v_current bigint;
begin
    case g.period
        when 'CUSTOM' then
            v_start := g.start_date;
            v_end := coalesce(g.end_date, g.start_date);
        when 'DAILY' then
            v_start := v_today;
            v_end := v_today;
        when 'WEEKLY' then
            v_start := pg_catalog.date_trunc('week', v_today::timestamp)::date;
            v_end := v_start + 6;
        else
            v_start := pg_catalog.date_trunc('month', v_today::timestamp)::date;
            v_end := (v_start + interval '1 month' - interval '1 day')::date;
    end case;

    v_from := app_private.day_start(v_start, p_tz);
    v_to := app_private.day_start(v_end + 1, p_tz);
    v_current := case g.type
        when 'FOCUS_MINUTES' then app_private.focus_seconds_between(g.user_id, v_from, v_to, g.project_id) / 60
        when 'FOCUS_SESSIONS' then app_private.focus_sessions_between(g.user_id, v_from, v_to, g.project_id)
        else app_private.tasks_completed_between(g.user_id, v_from, v_to, g.project_id)
    end;

    return pg_catalog.jsonb_build_object(
        'goalId', g.id,
        'type', g.type,
        'currentValue', v_current,
        'targetValue', g.target_value,
        'done', v_current >= g.target_value,
        'periodStart', v_start,
        'periodEnd', v_end
    );
end
$$;

create or replace function app_private.lock_goal(p_uid uuid, p_id bigint)
returns public.goal
language plpgsql
set search_path = ''
as $$
declare
    v_row public.goal;
begin
    select * into v_row from public.goal where id = p_id and user_id = p_uid for update;
    if not found then
        perform app_private.fail('GOAL_NOT_FOUND');
    end if;
    return v_row;
end
$$;

create or replace function public.api_goal_create(
    p_title text, p_description text, p_type text, p_target_value int, p_period text, p_start_date date,
    p_end_date date, p_project_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_now timestamptz := app_private.clock_now();
    v_row public.goal;
begin
    if p_end_date is not null and p_start_date is not null and p_end_date < p_start_date then
        perform app_private.fail('GOAL_INVALID_DATES');
    end if;
    perform app_private.require_project(v_uid, p_project_id);
    insert into public.goal (user_id, title, description, type, target_value, period, start_date, end_date,
                             project_id, created_at, updated_at)
    values (v_uid, pg_catalog.btrim(p_title), p_description, p_type, p_target_value, p_period, p_start_date,
            p_end_date, p_project_id, v_now, v_now)
    returning * into v_row;
    return app_private.goal_json(v_row);
end
$$;

create or replace function public.api_goal_list(p_status text, p_page int, p_size int)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_page int := app_private.clamp_page(p_page);
    v_size int := app_private.clamp_size(p_size, 50);
    v_total bigint;
    v_content jsonb;
begin
    select pg_catalog.count(*) into v_total
    from public.goal g where g.user_id = v_uid and (p_status is null or g.status = p_status);

    select coalesce(pg_catalog.jsonb_agg(app_private.goal_json(s.g) order by (s.g).created_at desc, (s.g).id desc), '[]'::jsonb)
    into v_content
    from (
        select g from public.goal g
        where g.user_id = v_uid and (p_status is null or g.status = p_status)
        order by g.created_at desc, g.id desc
        limit v_size offset v_page::bigint * v_size
    ) s;

    return app_private.page_json(v_content, v_total, v_page, v_size);
end
$$;

create or replace function public.api_goal_get(p_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.goal;
begin
    select * into v_row from public.goal where id = p_id and user_id = v_uid;
    if not found then
        perform app_private.fail('GOAL_NOT_FOUND');
    end if;
    return app_private.goal_json(v_row);
end
$$;

-- title/description/targetValue/startDate: null keeps the stored value. endDate keeps its value
-- only when neither startDate nor endDate is sent; otherwise it is replaced (null clears it).
create or replace function public.api_goal_update(
    p_id bigint, p_title text, p_description text, p_target_value int, p_start_date date, p_end_date date)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.goal := app_private.lock_goal(v_uid, p_id);
    v_start date := coalesce(p_start_date, v_row.start_date);
    v_end date := case when p_start_date is null and p_end_date is null then v_row.end_date else p_end_date end;
begin
    if v_end is not null and v_end < v_start then
        perform app_private.fail('GOAL_INVALID_DATES');
    end if;
    update public.goal
    set title = coalesce(pg_catalog.btrim(p_title), v_row.title),
        description = coalesce(p_description, v_row.description),
        target_value = coalesce(p_target_value, v_row.target_value),
        start_date = v_start,
        end_date = v_end,
        updated_at = app_private.clock_now()
    where id = p_id and user_id = v_uid
    returning * into v_row;
    return app_private.goal_json(v_row);
end
$$;

-- p_action: complete | archive | restore.
create or replace function public.api_goal_transition(p_id bigint, p_action text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_now timestamptz := app_private.clock_now();
    v_row public.goal := app_private.lock_goal(v_uid, p_id);
begin
    case p_action
        when 'complete' then
            if v_row.status <> 'ACTIVE' then
                perform app_private.fail('INVALID_GOAL_STATE', 'Only an active goal can be completed.');
            end if;
            update public.goal set status = 'COMPLETED', updated_at = v_now
            where id = p_id and user_id = v_uid returning * into v_row;
        when 'archive' then
            if v_row.status = 'ARCHIVED' then
                perform app_private.fail('INVALID_GOAL_STATE', 'Goal is already archived.');
            end if;
            update public.goal set status = 'ARCHIVED', updated_at = v_now
            where id = p_id and user_id = v_uid returning * into v_row;
        when 'restore' then
            if v_row.status <> 'ARCHIVED' then
                perform app_private.fail('INVALID_GOAL_STATE', 'Only an archived goal can be restored.');
            end if;
            update public.goal set status = 'ACTIVE', updated_at = v_now
            where id = p_id and user_id = v_uid returning * into v_row;
        else
            raise exception using errcode = '22023', message = 'unknown goal action';
    end case;
    return app_private.goal_json(v_row);
end
$$;

create or replace function public.api_goal_progress(p_id bigint, p_tz text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.goal;
begin
    select * into v_row from public.goal where id = p_id and user_id = v_uid;
    if not found then
        perform app_private.fail('GOAL_NOT_FOUND');
    end if;
    return app_private.goal_progress(v_row, p_tz);
end
$$;

select app_private.secure_api_functions();
