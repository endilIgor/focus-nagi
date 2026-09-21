-- Project API functions. Each call runs in a single transaction as the signed-in user (RLS applies).
-- Idempotent.

create or replace function app_private.project_json(p public.project)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'description', p.description,
        'status', p.status,
        'startDate', p.start_date,
        'dueDate', p.due_date,
        'archivedAt', app_private.iso(p.archived_at),
        'createdAt', app_private.iso(p.created_at),
        'updatedAt', app_private.iso(p.updated_at)
    )
$$;

-- Fails with PROJECT_NOT_FOUND unless the project exists and belongs to the caller.
create or replace function app_private.require_project(p_uid uuid, p_project_id bigint)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
    if p_project_id is not null
       and not exists (select 1 from public.project where id = p_project_id and user_id = p_uid) then
        perform app_private.fail('PROJECT_NOT_FOUND');
    end if;
end
$$;

create or replace function public.api_project_create(
    p_title text, p_description text, p_start_date date, p_due_date date)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_now timestamptz := app_private.clock_now();
    v_row public.project;
begin
    if p_start_date is not null and p_due_date is not null and p_due_date < p_start_date then
        perform app_private.fail('PROJECT_INVALID_DATES');
    end if;
    insert into public.project (user_id, title, description, start_date, due_date, created_at, updated_at)
    values (v_uid, pg_catalog.btrim(p_title), p_description, p_start_date, p_due_date, v_now, v_now)
    returning * into v_row;
    return app_private.project_json(v_row);
end
$$;

create or replace function public.api_project_list(p_status text, p_page int, p_size int)
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
    from public.project p
    where p.user_id = v_uid and (p_status is null or p.status = p_status);

    select coalesce(pg_catalog.jsonb_agg(app_private.project_json(s.p) order by (s.p).created_at desc, (s.p).id desc), '[]'::jsonb)
    into v_content
    from (
        select p
        from public.project p
        where p.user_id = v_uid and (p_status is null or p.status = p_status)
        order by p.created_at desc, p.id desc
        limit v_size offset v_page::bigint * v_size
    ) s;

    return app_private.page_json(v_content, v_total, v_page, v_size);
end
$$;

create or replace function public.api_project_get(p_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.project;
begin
    select * into v_row from public.project where id = p_id and user_id = v_uid;
    if not found then
        perform app_private.fail('PROJECT_NOT_FOUND');
    end if;
    return app_private.project_json(v_row);
end
$$;

-- Partial update: null arguments keep the stored value.
create or replace function public.api_project_update(
    p_id bigint, p_title text, p_description text, p_start_date date, p_due_date date)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.project;
begin
    select * into v_row from public.project where id = p_id and user_id = v_uid for update;
    if not found then
        perform app_private.fail('PROJECT_NOT_FOUND');
    end if;

    v_row.title := coalesce(pg_catalog.btrim(p_title), v_row.title);
    v_row.description := coalesce(p_description, v_row.description);
    v_row.start_date := coalesce(p_start_date, v_row.start_date);
    v_row.due_date := coalesce(p_due_date, v_row.due_date);
    if v_row.start_date is not null and v_row.due_date is not null and v_row.due_date < v_row.start_date then
        perform app_private.fail('PROJECT_INVALID_DATES');
    end if;

    update public.project
    set title = v_row.title,
        description = v_row.description,
        start_date = v_row.start_date,
        due_date = v_row.due_date,
        updated_at = app_private.clock_now()
    where id = p_id and user_id = v_uid
    returning * into v_row;
    return app_private.project_json(v_row);
end
$$;

-- p_action: complete | archive | restore.
create or replace function public.api_project_transition(p_id bigint, p_action text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_now timestamptz := app_private.clock_now();
    v_row public.project;
begin
    select * into v_row from public.project where id = p_id and user_id = v_uid for update;
    if not found then
        perform app_private.fail('PROJECT_NOT_FOUND');
    end if;

    case p_action
        when 'complete' then
            if v_row.status <> 'ACTIVE' then
                perform app_private.fail('INVALID_PROJECT_STATE', 'Only an active project can be completed.');
            end if;
            update public.project set status = 'COMPLETED', updated_at = v_now
            where id = p_id and user_id = v_uid returning * into v_row;
        when 'archive' then
            if v_row.status = 'ARCHIVED' then
                perform app_private.fail('INVALID_PROJECT_STATE', 'Project is already archived.');
            end if;
            update public.project set status = 'ARCHIVED', archived_at = v_now, updated_at = v_now
            where id = p_id and user_id = v_uid returning * into v_row;
        when 'restore' then
            if v_row.status <> 'ARCHIVED' then
                perform app_private.fail('INVALID_PROJECT_STATE', 'Only an archived project can be restored.');
            end if;
            update public.project set status = 'ACTIVE', archived_at = null, updated_at = v_now
            where id = p_id and user_id = v_uid returning * into v_row;
        else
            raise exception using errcode = '22023', message = 'unknown project action';
    end case;
    return app_private.project_json(v_row);
end
$$;

create or replace function public.api_project_focus(p_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_seconds bigint;
begin
    perform app_private.require_project(v_uid, p_id);
    select coalesce(pg_catalog.sum(f.actual_focus_seconds), 0) into v_seconds
    from public.focus_session f
    where f.user_id = v_uid and f.project_id = p_id and f.status = 'COMPLETED';
    return pg_catalog.jsonb_build_object('projectId', p_id, 'totalFocusSeconds', v_seconds);
end
$$;

select app_private.secure_api_functions();
