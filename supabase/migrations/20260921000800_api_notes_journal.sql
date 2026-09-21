-- Note and journal API functions. Idempotent.

-- ---------------------------------------------------------------- notes

create or replace function app_private.note_json(n public.note)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'id', n.id,
        'title', n.title,
        'content', n.content,
        'pinned', n.pinned,
        'projectId', n.project_id,
        'createdAt', app_private.iso(n.created_at),
        'updatedAt', app_private.iso(n.updated_at)
    )
$$;

-- Escapes LIKE metacharacters so user search text is always matched literally.
create or replace function app_private.like_escape(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
    select pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(p_text, '\', '\\'), '%', '\%'), '_', '\_')
$$;

create or replace function public.api_note_create(p_title text, p_content text, p_project_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_now timestamptz := app_private.clock_now();
    v_row public.note;
begin
    perform app_private.require_project(v_uid, p_project_id);
    insert into public.note (user_id, title, content, project_id, created_at, updated_at)
    values (v_uid, pg_catalog.btrim(p_title), p_content, p_project_id, v_now, v_now)
    returning * into v_row;
    return app_private.note_json(v_row);
end
$$;

create or replace function public.api_note_list(p_pinned boolean, p_project_id bigint, p_q text, p_page int, p_size int)
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
    v_pattern text := case
        when p_q is null or pg_catalog.btrim(p_q) = '' then null
        else '%' || app_private.like_escape(pg_catalog.lower(pg_catalog.btrim(p_q))) || '%'
    end;
    v_total bigint;
    v_content jsonb;
begin
    select pg_catalog.count(*) into v_total
    from public.note n
    where n.user_id = v_uid
      and (p_pinned is null or n.pinned = p_pinned)
      and (p_project_id is null or n.project_id = p_project_id)
      and (v_pattern is null
           or pg_catalog.lower(n.title) like v_pattern escape '\'
           or pg_catalog.lower(n.content) like v_pattern escape '\');

    select coalesce(pg_catalog.jsonb_agg(app_private.note_json(s.n)
                    order by (s.n).pinned desc, (s.n).updated_at desc, (s.n).id desc), '[]'::jsonb)
    into v_content
    from (
        select n from public.note n
        where n.user_id = v_uid
          and (p_pinned is null or n.pinned = p_pinned)
          and (p_project_id is null or n.project_id = p_project_id)
          and (v_pattern is null
               or pg_catalog.lower(n.title) like v_pattern escape '\'
               or pg_catalog.lower(n.content) like v_pattern escape '\')
        order by n.pinned desc, n.updated_at desc, n.id desc
        limit v_size offset v_page::bigint * v_size
    ) s;

    return app_private.page_json(v_content, v_total, v_page, v_size);
end
$$;

create or replace function public.api_note_get(p_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.note;
begin
    select * into v_row from public.note where id = p_id and user_id = v_uid;
    if not found then
        perform app_private.fail('NOTE_NOT_FOUND');
    end if;
    return app_private.note_json(v_row);
end
$$;

-- title: null keeps the stored value; content and projectId are always applied (null clears them).
create or replace function public.api_note_update(p_id bigint, p_title text, p_content text, p_project_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.note;
begin
    perform app_private.require_project(v_uid, p_project_id);
    update public.note
    set title = coalesce(pg_catalog.btrim(p_title), title),
        content = p_content,
        project_id = p_project_id,
        updated_at = app_private.clock_now()
    where id = p_id and user_id = v_uid
    returning * into v_row;
    if not found then
        perform app_private.fail('NOTE_NOT_FOUND');
    end if;
    return app_private.note_json(v_row);
end
$$;

create or replace function public.api_note_delete(p_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
begin
    delete from public.note where id = p_id and user_id = v_uid;
    if not found then
        perform app_private.fail('NOTE_NOT_FOUND');
    end if;
end
$$;

-- Pinning does not change updated_at (the original API behaves the same way).
create or replace function public.api_note_set_pinned(p_id bigint, p_pinned boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.note;
begin
    update public.note set pinned = p_pinned
    where id = p_id and user_id = v_uid
    returning * into v_row;
    if not found then
        perform app_private.fail('NOTE_NOT_FOUND');
    end if;
    return app_private.note_json(v_row);
end
$$;

-- ---------------------------------------------------------------- journal

create or replace function app_private.journal_json(j public.journal_entry)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'id', j.id,
        'entryDate', j.entry_date,
        'content', j.content,
        'createdAt', app_private.iso(j.created_at),
        'updatedAt', app_private.iso(j.updated_at)
    )
$$;

create or replace function app_private.reject_future_entry(p_date date, p_tz text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
    if p_date > app_private.local_today(p_tz) then
        perform app_private.fail('JOURNAL_FUTURE_DATE');
    end if;
end
$$;

create or replace function public.api_journal_create(p_entry_date date, p_content text, p_tz text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_now timestamptz := app_private.clock_now();
    v_row public.journal_entry;
begin
    perform app_private.reject_future_entry(p_entry_date, p_tz);
    insert into public.journal_entry (user_id, entry_date, content, created_at, updated_at)
    values (v_uid, p_entry_date, pg_catalog.btrim(p_content), v_now, v_now)
    returning * into v_row;
    return app_private.journal_json(v_row);
end
$$;

create or replace function public.api_journal_by_date(p_date date)
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
        select coalesce(pg_catalog.jsonb_agg(app_private.journal_json(j) order by j.created_at, j.id), '[]'::jsonb)
        from public.journal_entry j
        where j.user_id = v_uid and j.entry_date = p_date
    );
end
$$;

create or replace function public.api_journal_range(p_from date, p_to date, p_page int, p_size int)
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
    if p_from is null or p_to is null or p_to < p_from then
        perform app_private.fail('JOURNAL_INVALID_RANGE');
    end if;

    select pg_catalog.count(*) into v_total
    from public.journal_entry j
    where j.user_id = v_uid and j.entry_date between p_from and p_to;

    select coalesce(pg_catalog.jsonb_agg(app_private.journal_json(s.j)
                    order by (s.j).entry_date, (s.j).created_at, (s.j).id), '[]'::jsonb)
    into v_content
    from (
        select j from public.journal_entry j
        where j.user_id = v_uid and j.entry_date between p_from and p_to
        order by j.entry_date, j.created_at, j.id
        limit v_size offset v_page::bigint * v_size
    ) s;

    return app_private.page_json(v_content, v_total, v_page, v_size);
end
$$;

create or replace function public.api_journal_recent(p_page int, p_size int)
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
    select pg_catalog.count(*) into v_total from public.journal_entry j where j.user_id = v_uid;

    select coalesce(pg_catalog.jsonb_agg(app_private.journal_json(s.j)
                    order by (s.j).entry_date desc, (s.j).created_at desc, (s.j).id desc), '[]'::jsonb)
    into v_content
    from (
        select j from public.journal_entry j
        where j.user_id = v_uid
        order by j.entry_date desc, j.created_at desc, j.id desc
        limit v_size offset v_page::bigint * v_size
    ) s;

    return app_private.page_json(v_content, v_total, v_page, v_size);
end
$$;

-- entryDate/content: null keeps the stored value.
create or replace function public.api_journal_update(p_id bigint, p_entry_date date, p_content text, p_tz text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
    v_row public.journal_entry;
begin
    select * into v_row from public.journal_entry where id = p_id and user_id = v_uid for update;
    if not found then
        perform app_private.fail('JOURNAL_ENTRY_NOT_FOUND');
    end if;
    if p_entry_date is not null then
        perform app_private.reject_future_entry(p_entry_date, p_tz);
    end if;
    update public.journal_entry
    set entry_date = coalesce(p_entry_date, entry_date),
        content = coalesce(p_content, content),
        updated_at = app_private.clock_now()
    where id = p_id and user_id = v_uid
    returning * into v_row;
    return app_private.journal_json(v_row);
end
$$;

create or replace function public.api_journal_delete(p_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
begin
    delete from public.journal_entry where id = p_id and user_id = v_uid;
    if not found then
        perform app_private.fail('JOURNAL_ENTRY_NOT_FOUND');
    end if;
end
$$;

select app_private.secure_api_functions();
