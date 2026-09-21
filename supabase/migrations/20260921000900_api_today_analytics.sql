-- Today projection and analytics read models. All calendar boundaries use the requested IANA time
-- zone; focused minutes are whole minutes (seconds / 60, floored) per bucket; only COMPLETED
-- focus sessions count. Idempotent.

create or replace function app_private.require_range(p_from date, p_to date, p_max_days int)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
    if p_from is null or p_to is null or p_to < p_from then
        perform app_private.fail('ANALYTICS_INVALID_RANGE');
    end if;
    if (p_to - p_from) >= p_max_days then
        perform app_private.fail('ANALYTICS_RANGE_TOO_LARGE');
    end if;
end
$$;

create or replace function public.api_today(p_tz text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_today date := app_private.local_today(p_tz);
    v_from timestamptz := app_private.day_start(v_today, p_tz);
    v_to timestamptz := app_private.day_start(v_today + 1, p_tz);
    v_current public.focus_session;
begin
    select * into v_current from public.focus_session
    where user_id = v_uid and status in ('RUNNING', 'PAUSED')
    limit 1;

    return pg_catalog.jsonb_build_object(
        'date', v_today,
        'currentSession', case when v_current.id is null then null else app_private.focus_session_json(v_current) end,
        'focusedMinutesToday', app_private.focus_seconds_between(v_uid, v_from, v_to, null) / 60,
        'sessionsToday', app_private.focus_sessions_between(v_uid, v_from, v_to, null),
        'tasksCompletedToday', app_private.tasks_completed_between(v_uid, v_from, v_to, null),
        'tasksDueToday', (
            select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                       'id', t.id, 'title', t.title, 'dueDate', t.due_date, 'priority', t.priority,
                       'projectId', t.project_id) order by t.due_date, t.id), '[]'::jsonb)
            from public.task t
            where t.user_id = v_uid and t.status in ('TODO', 'IN_PROGRESS') and t.due_date = v_today),
        'overdueTasks', (
            select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                       'id', t.id, 'title', t.title, 'dueDate', t.due_date, 'priority', t.priority,
                       'projectId', t.project_id) order by t.due_date, t.id), '[]'::jsonb)
            from public.task t
            where t.user_id = v_uid and t.status in ('TODO', 'IN_PROGRESS') and t.due_date < v_today),
        'activeProjects', (
            select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', p.id, 'title', p.title)
                       order by p.id), '[]'::jsonb)
            from public.project p
            where p.user_id = v_uid and p.status = 'ACTIVE'),
        'goals', (
            select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                       'id', g.id, 'title', g.title, 'type', g.type,
                       'currentValue', progress.value -> 'currentValue',
                       'targetValue', g.target_value,
                       'done', progress.value -> 'done') order by g.id), '[]'::jsonb)
            from public.goal g
            cross join lateral (select app_private.goal_progress(g, p_tz) as value) progress
            where g.user_id = v_uid and g.status = 'ACTIVE')
    );
end
$$;

-- p_period: TODAY | WEEK | MONTH.
create or replace function public.api_analytics_summary(p_period text, p_tz text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_today date := app_private.local_today(p_tz);
    v_period text := coalesce(p_period, 'TODAY');
    v_start date;
    v_end date;
    v_from timestamptz;
    v_to timestamptz;
begin
    case v_period
        when 'TODAY' then
            v_start := v_today;
            v_end := v_today;
        when 'WEEK' then
            v_start := pg_catalog.date_trunc('week', v_today::timestamp)::date;
            v_end := v_start + 6;
        when 'MONTH' then
            v_start := pg_catalog.date_trunc('month', v_today::timestamp)::date;
            v_end := (v_start + interval '1 month' - interval '1 day')::date;
        else
            raise exception using errcode = '22023', message = 'unknown analytics period';
    end case;
    v_from := app_private.day_start(v_start, p_tz);
    v_to := app_private.day_start(v_end + 1, p_tz);

    return pg_catalog.jsonb_build_object(
        'period', v_period,
        'dateStart', v_start,
        'dateEnd', v_end,
        'focusedMinutes', app_private.focus_seconds_between(v_uid, v_from, v_to, null) / 60,
        'sessionCount', app_private.focus_sessions_between(v_uid, v_from, v_to, null),
        'tasksCompleted', app_private.tasks_completed_between(v_uid, v_from, v_to, null)
    );
end
$$;

-- A day counts when it has at least one COMPLETED session with focus time. The current streak is
-- the run ending today, or ending yesterday while today has no focus yet.
create or replace function public.api_analytics_streaks(p_tz text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_today date := app_private.local_today(p_tz);
    v_current bigint;
    v_longest bigint;
begin
    with days as (
        select distinct (f.started_at at time zone p_tz)::date as day
        from public.focus_session f
        where f.user_id = v_uid and f.status = 'COMPLETED' and f.actual_focus_seconds > 0
    ),
    runs as (
        -- consecutive days share the same (day - row_number) anchor
        select day, day - (row_number() over (order by day))::int as anchor from days
    ),
    cursor_day as (
        select case when exists (select 1 from days where day = v_today) then v_today else v_today - 1 end as day
    )
    select
        (select pg_catalog.count(*)
         from runs r, cursor_day c
         where r.day <= c.day
           and r.anchor = (select r2.anchor from runs r2 where r2.day = c.day)),
        (select coalesce(pg_catalog.max(n), 0) from (select pg_catalog.count(*) as n from runs group by anchor) lengths)
    into v_current, v_longest;

    return pg_catalog.jsonb_build_object('currentStreak', v_current, 'longestStreak', v_longest);
end
$$;

-- Daily buckets for every day in [p_from, p_to], zeros included. Null bounds default to the
-- 30 days ending today (focus/by-day); the heatmap always sends both bounds.
create or replace function public.api_analytics_by_day(p_from date, p_to date, p_tz text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_end date := coalesce(p_to, app_private.local_today(p_tz));
    v_start date := coalesce(p_from, v_end - 29);
begin
    perform app_private.require_range(v_start, v_end, 366);
    return (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                   'date', days.day, 'focusedMinutes', coalesce(totals.seconds, 0) / 60) order by days.day), '[]'::jsonb)
        from (
            select g::date as day
            from pg_catalog.generate_series(v_start::timestamp, v_end::timestamp, interval '1 day') g
        ) days
        left join (
            select (f.started_at at time zone p_tz)::date as day, pg_catalog.sum(f.actual_focus_seconds)::bigint as seconds
            from public.focus_session f
            where f.user_id = v_uid and f.status = 'COMPLETED'
              and f.started_at >= app_private.day_start(v_start, p_tz)
              and f.started_at < app_private.day_start(v_end + 1, p_tz)
            group by 1
        ) totals on totals.day = days.day
    );
end
$$;

-- ISO-week buckets (weeks with focus only). Defaults to the 12 weeks ending today.
create or replace function public.api_analytics_by_week(p_from date, p_to date, p_tz text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_end date := coalesce(p_to, app_private.local_today(p_tz));
    v_start date := coalesce(p_from, v_end - 83);
begin
    perform app_private.require_range(v_start, v_end, 372);
    return (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                   'weekStart', w.week_start, 'focusedMinutes', w.seconds / 60) order by w.week_start), '[]'::jsonb)
        from (
            select pg_catalog.date_trunc('week', f.started_at at time zone p_tz)::date as week_start,
                   pg_catalog.sum(f.actual_focus_seconds)::bigint as seconds
            from public.focus_session f
            where f.user_id = v_uid and f.status = 'COMPLETED'
              and f.started_at >= app_private.day_start(v_start, p_tz)
              and f.started_at < app_private.day_start(v_end + 1, p_tz)
            group by 1
        ) w
    );
end
$$;

-- Calendar-month buckets (months with focus only). Defaults to the 12 months ending today.
create or replace function public.api_analytics_by_month(p_from date, p_to date, p_tz text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_end date := coalesce(p_to, app_private.local_today(p_tz));
    v_start date := coalesce(p_from, (v_end - interval '12 months')::date);
begin
    perform app_private.require_range(v_start, v_end, 366 * 5);
    return (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                   'month', m.month, 'focusedMinutes', m.seconds / 60) order by m.month), '[]'::jsonb)
        from (
            select pg_catalog.to_char(pg_catalog.date_trunc('month', f.started_at at time zone p_tz), 'YYYY-MM') as month,
                   pg_catalog.sum(f.actual_focus_seconds)::bigint as seconds
            from public.focus_session f
            where f.user_id = v_uid and f.status = 'COMPLETED'
              and f.started_at >= app_private.day_start(v_start, p_tz)
              and f.started_at < app_private.day_start(v_end + 1, p_tz)
            group by 1
        ) m
    );
end
$$;

-- Local hour-of-day buckets. Without bounds: from the beginning of time until now.
create or replace function public.api_analytics_by_hour(p_from date, p_to date, p_tz text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_from timestamptz := case when p_from is null then '-infinity'::timestamptz else app_private.day_start(p_from, p_tz) end;
    v_to timestamptz := case when p_to is null then app_private.clock_now() else app_private.day_start(p_to + 1, p_tz) end;
begin
    return (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                   'hour', h.hour, 'focusedMinutes', h.seconds / 60) order by h.hour), '[]'::jsonb)
        from (
            select extract(hour from f.started_at at time zone p_tz)::int as hour,
                   pg_catalog.sum(f.actual_focus_seconds)::bigint as seconds
            from public.focus_session f
            where f.user_id = v_uid and f.status = 'COMPLETED'
              and f.started_at >= v_from and f.started_at < v_to
            group by 1
        ) h
    );
end
$$;

create or replace function public.api_analytics_by_project()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
begin
    return (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                   'projectId', r.project_id, 'title', r.title, 'focusedMinutes', r.seconds / 60)
                   order by r.seconds desc, r.project_id nulls last), '[]'::jsonb)
        from (
            select f.project_id, p.title, pg_catalog.sum(f.actual_focus_seconds)::bigint as seconds
            from public.focus_session f
            left join public.project p on p.id = f.project_id and p.user_id = f.user_id
            where f.user_id = v_uid and f.status = 'COMPLETED'
            group by f.project_id, p.title
        ) r
    );
end
$$;

select app_private.secure_api_functions();
