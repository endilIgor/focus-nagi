-- Internal helpers shared by the SQL API functions (schema app_private is not exposed over REST).
-- Idempotent.

-- Server clock for every business timestamp. `app.now` can only be set by a direct database
-- session (tests, maintenance); PostgREST clients cannot set arbitrary settings.
create or replace function app_private.clock_now()
returns timestamptz
language sql
stable
set search_path = ''
as $$
    select coalesce(nullif(pg_catalog.current_setting('app.now', true), '')::timestamptz, pg_catalog.now())
$$;

-- Calendar date "today" in the given IANA time zone.
create or replace function app_private.local_today(p_tz text)
returns date
language sql
stable
set search_path = ''
as $$
    select (app_private.clock_now() at time zone p_tz)::date
$$;

-- Instant at which the given local calendar day starts in p_tz.
create or replace function app_private.day_start(p_day date, p_tz text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
    select (p_day::timestamp at time zone p_tz)
$$;

-- Raises a domain error; the API maps `message` (the code) to an HTTP status.
create or replace function app_private.fail(p_code text, p_message text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
    raise exception using errcode = 'P0001', message = p_code, detail = coalesce(p_message, '');
end
$$;

-- The signed-in user; rejects anonymous callers.
create or replace function app_private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        perform app_private.fail('UNAUTHENTICATED');
    end if;
    return v_uid;
end
$$;

-- ISO-8601 UTC instant with millisecond precision, e.g. 2026-09-21T14:03:05.123Z.
create or replace function app_private.iso(p_ts timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
    select pg_catalog.to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- Spring Data style page envelope used by every paginated endpoint.
create or replace function app_private.page_json(p_content jsonb, p_total bigint, p_page int, p_size int)
returns jsonb
language sql
immutable
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'content', p_content,
        'totalElements', p_total,
        'totalPages', pg_catalog.ceil(p_total::numeric / p_size)::bigint,
        'size', p_size,
        'number', p_page,
        'numberOfElements', pg_catalog.jsonb_array_length(p_content),
        'first', p_page = 0,
        'last', (p_page + 1) >= pg_catalog.ceil(p_total::numeric / p_size),
        'empty', pg_catalog.jsonb_array_length(p_content) = 0
    )
$$;

create or replace function app_private.clamp_page(p_page int)
returns int
language sql
immutable
set search_path = ''
as $$
    select greatest(coalesce(p_page, 0), 0)
$$;

create or replace function app_private.clamp_size(p_size int, p_default int)
returns int
language sql
immutable
set search_path = ''
as $$
    select least(greatest(coalesce(p_size, p_default), 1), 100)
$$;

-- Locks down every public.api_* function: callable only by signed-in users.
-- Re-run at the end of every migration that adds API functions.
create or replace function app_private.secure_api_functions()
returns void
language plpgsql
set search_path = ''
as $$
declare
    fn record;
begin
    for fn in
        select p.oid::regprocedure as signature
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'api\_%'
    loop
        execute pg_catalog.format('revoke all on function %s from public, anon', fn.signature);
        execute pg_catalog.format('grant execute on function %s to authenticated', fn.signature);
    end loop;

    for fn in
        select p.oid::regprocedure as signature
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app_private' and p.proname <> 'secure_api_functions'
    loop
        execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', fn.signature);
    end loop;
end
$$;

revoke all on function app_private.secure_api_functions() from public, anon, authenticated;

select app_private.secure_api_functions();
