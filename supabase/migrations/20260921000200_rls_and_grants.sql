-- Row Level Security: every user-data table is scoped to its owner as defense in depth.
-- Authenticated clients receive no direct table/sequence privileges. The final RPC hardening
-- migration exposes only public.api_* functions, preventing Data API bypass of Worker rules.
--
-- Least privilege:
--   * anon (unauthenticated) has no table access at all;
--   * authenticated has no direct table access; ownership policies remain enabled as a backstop;
--   * service_role is never used by the app (frontend or Worker).
--
-- Idempotent: policies are dropped and recreated.

do $$
declare
    t text;
begin
    foreach t in array array['project', 'task', 'subtask', 'focus_session', 'goal', 'note', 'journal_entry']
    loop
        execute format('alter table public.%I enable row level security', t);

        execute format('revoke all on table public.%I from public, anon, authenticated', t);

        execute format('drop policy if exists %I on public.%I', t || '_owner_select', t);
        execute format('drop policy if exists %I on public.%I', t || '_owner_insert', t);
        execute format('drop policy if exists %I on public.%I', t || '_owner_update', t);
        execute format('drop policy if exists %I on public.%I', t || '_owner_delete', t);

        execute format(
            'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
            t || '_owner_select', t);
        execute format(
            'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
            t || '_owner_insert', t);
        execute format(
            'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
            t || '_owner_update', t);
        execute format(
            'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
            t || '_owner_delete', t);
    end loop;
end
$$;

-- Identity sequences backing the bigint ids.
do $$
declare
    seq record;
begin
    for seq in
        select s.relname
        from pg_class s
        join pg_depend d on d.objid = s.oid and d.deptype = 'i'
        join pg_class t on t.oid = d.refobjid
        join pg_namespace n on n.oid = t.relnamespace
        where s.relkind = 'S'
          and n.nspname = 'public'
          and t.relname in ('project', 'task', 'subtask', 'focus_session', 'goal', 'note', 'journal_entry')
    loop
        execute format('revoke all on sequence public.%I from public, anon, authenticated', seq.relname);
    end loop;
end
$$;

-- Internal helpers are reachable only from SECURITY DEFINER API functions.
revoke usage on schema app_private from public, anon, authenticated;
