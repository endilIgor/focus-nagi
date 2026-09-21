-- Make the SQL RPC surface the only database entry point available to authenticated clients.
--
-- The Worker forwards the caller's Supabase JWT. public.api_* functions validate auth.uid(),
-- explicitly scope every query/write by that id, and use an empty search_path. They execute as
-- their migration owner so callers do not need direct table privileges. This prevents a browser
-- holding a valid JWT from bypassing Worker validation and state-transition rules through the
-- Supabase Data API.
--
-- Idempotent: safe to run more than once.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke usage on schema app_private from anon, authenticated;
revoke all on all functions in schema app_private from anon, authenticated;

-- Keep future objects closed by default when migrations run as the same owner.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema app_private revoke all on functions from anon, authenticated;

do $$
declare
    fn record;
begin
    for fn in
        select p.oid::regprocedure as signature
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'api\_%'
    loop
        execute pg_catalog.format('alter function %s security definer', fn.signature);
        execute pg_catalog.format('revoke all on function %s from public, anon', fn.signature);
        execute pg_catalog.format('grant execute on function %s to authenticated', fn.signature);
    end loop;
end
$$;
