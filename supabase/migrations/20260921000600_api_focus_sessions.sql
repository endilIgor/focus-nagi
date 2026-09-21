-- Focus session API functions. State changes lock the row (SELECT ... FOR UPDATE) so concurrent
-- pause/resume/finish/cancel calls serialize; the partial unique index is the backstop for the
-- single active session per user. Durations are always computed from the server clock.
-- Idempotent.

create or replace function app_private.focus_session_json(f public.focus_session)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'id', f.id,
        'taskId', f.task_id,
        'projectId', f.project_id,
        'startedAt', app_private.iso(f.started_at),
        'endedAt', app_private.iso(f.ended_at),
        'plannedFocusMinutes', f.planned_focus_minutes,
        'plannedBreakMinutes', f.planned_break_minutes,
        'pausedSecondsAccum', f.paused_seconds_accum,
        'lastPausedAt', app_private.iso(f.last_paused_at),
        'actualFocusSeconds', f.actual_focus_seconds,
        'status', f.status,
        'notes', f.notes,
        'createdAt', app_private.iso(f.created_at)
    )
$$;

-- Whole seconds between two instants (floored), never negative.
create or replace function app_private.elapsed_seconds(p_from timestamptz, p_to timestamptz)
returns bigint
language sql
immutable
set search_path = ''
as $$
    select greatest(pg_catalog.floor(extract(epoch from (p_to - p_from)))::bigint, 0)
$$;

create or replace function public.api_focus_start(
    p_planned_focus_minutes int, p_planned_break_minutes int, p_task_id bigint, p_project_id bigint, p_notes text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_now timestamptz := app_private.clock_now();
    v_project_id bigint := p_project_id;
    v_task_project bigint;
    v_row public.focus_session;
begin
    if p_task_id is not null then
        select project_id into v_task_project from public.task where id = p_task_id and user_id = v_uid;
        if not found then
            perform app_private.fail('TASK_NOT_FOUND');
        end if;
        if v_task_project is not null then
            if p_project_id is not null and p_project_id <> v_task_project then
                perform app_private.fail('FOCUS_SESSION_PROJECT_MISMATCH');
            end if;
            v_project_id := v_task_project;
        else
            perform app_private.require_project(v_uid, p_project_id);
        end if;
    else
        perform app_private.require_project(v_uid, p_project_id);
    end if;

    if exists (select 1 from public.focus_session where user_id = v_uid and status in ('RUNNING', 'PAUSED')) then
        perform app_private.fail('FOCUS_SESSION_ALREADY_RUNNING');
    end if;

    begin
        insert into public.focus_session (user_id, task_id, project_id, started_at, planned_focus_minutes,
                                          planned_break_minutes, notes, created_at)
        values (v_uid, p_task_id, v_project_id, v_now, p_planned_focus_minutes, p_planned_break_minutes,
                p_notes, v_now)
        returning * into v_row;
    exception when unique_violation then
        -- A concurrent start won the race; the partial unique index kept the invariant.
        perform app_private.fail('FOCUS_SESSION_ALREADY_RUNNING');
    end;
    return app_private.focus_session_json(v_row);
end
$$;

-- Returns the RUNNING/PAUSED session, or JSON null when there is none.
create or replace function public.api_focus_current()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.focus_session;
begin
    select * into v_row from public.focus_session
    where user_id = v_uid and status in ('RUNNING', 'PAUSED')
    limit 1;
    if not found then
        return null;
    end if;
    return app_private.focus_session_json(v_row);
end
$$;

create or replace function public.api_focus_history(
    p_status text, p_project_id bigint, p_task_id bigint, p_from date, p_to date, p_tz text, p_page int, p_size int)
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
    v_from timestamptz := case when p_from is null then null else app_private.day_start(p_from, p_tz) end;
    v_to timestamptz := case when p_to is null then null else app_private.day_start(p_to + 1, p_tz) end;
    v_total bigint;
    v_content jsonb;
begin
    select pg_catalog.count(*) into v_total
    from public.focus_session f
    where f.user_id = v_uid
      and (p_status is null or f.status = p_status)
      and (p_project_id is null or f.project_id = p_project_id)
      and (p_task_id is null or f.task_id = p_task_id)
      and (v_from is null or f.started_at >= v_from)
      and (v_to is null or f.started_at < v_to);

    select coalesce(pg_catalog.jsonb_agg(app_private.focus_session_json(s.f) order by (s.f).started_at desc, (s.f).id desc), '[]'::jsonb)
    into v_content
    from (
        select f
        from public.focus_session f
        where f.user_id = v_uid
          and (p_status is null or f.status = p_status)
          and (p_project_id is null or f.project_id = p_project_id)
          and (p_task_id is null or f.task_id = p_task_id)
          and (v_from is null or f.started_at >= v_from)
          and (v_to is null or f.started_at < v_to)
        order by f.started_at desc, f.id desc
        limit v_size offset v_page::bigint * v_size
    ) s;

    return app_private.page_json(v_content, v_total, v_page, v_size);
end
$$;

-- p_action: pause (RUNNING) | resume (PAUSED) | finish (RUNNING) | cancel (RUNNING or PAUSED).
create or replace function public.api_focus_transition(p_id bigint, p_action text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_now timestamptz := app_private.clock_now();
    v_row public.focus_session;
    v_allowed text[];
begin
    select * into v_row from public.focus_session where id = p_id and user_id = v_uid for update;
    if not found then
        perform app_private.fail('FOCUS_SESSION_NOT_FOUND');
    end if;

    v_allowed := case p_action
        when 'pause' then array['RUNNING']
        when 'resume' then array['PAUSED']
        when 'finish' then array['RUNNING']
        when 'cancel' then array['RUNNING', 'PAUSED']
    end;
    if v_allowed is null then
        raise exception using errcode = '22023', message = 'unknown focus session action';
    end if;
    if not (v_row.status = any (v_allowed)) then
        perform app_private.fail('INVALID_FOCUS_SESSION_STATE');
    end if;

    case p_action
        when 'pause' then
            update public.focus_session
            set status = 'PAUSED', last_paused_at = v_now, version = version + 1
            where id = p_id and user_id = v_uid returning * into v_row;
        when 'resume' then
            update public.focus_session
            set status = 'RUNNING',
                paused_seconds_accum = paused_seconds_accum + app_private.elapsed_seconds(last_paused_at, v_now),
                last_paused_at = null,
                version = version + 1
            where id = p_id and user_id = v_uid returning * into v_row;
        when 'finish' then
            update public.focus_session
            set status = 'COMPLETED',
                ended_at = v_now,
                actual_focus_seconds = greatest(app_private.elapsed_seconds(started_at, v_now) - paused_seconds_accum, 0),
                version = version + 1
            where id = p_id and user_id = v_uid returning * into v_row;
        else
            update public.focus_session
            set status = 'CANCELLED', ended_at = v_now, version = version + 1
            where id = p_id and user_id = v_uid returning * into v_row;
    end case;
    return app_private.focus_session_json(v_row);
end
$$;

select app_private.secure_api_functions();
