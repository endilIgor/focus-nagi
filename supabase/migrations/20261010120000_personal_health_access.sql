-- Personal health module enablement, protected in the database.
--
-- app_private.health_access lists the auth users allowed to use health features. It lives in the
-- unexposed app_private schema, has RLS enabled with no policies, and grants nothing to client
-- roles: accounts are enabled only by an administrative database session, never by a client.
-- This migration creates structure only and enables no account.
--
-- public.api_health_access() reports the caller's capability; app_private.require_health_access()
-- is the shared guard for health RPCs (UNAUTHENTICATED without a user, HEALTH_ACCESS_DENIED when
-- the caller is not enabled).
--
-- Idempotent.

create table if not exists app_private.health_access (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table app_private.health_access enable row level security;
revoke all on table app_private.health_access from public, anon, authenticated;

create or replace function app_private.has_health_access(p_uid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
    select p_uid is not null
       and exists (select 1 from app_private.health_access a where a.user_id = p_uid)
$$;

-- The signed-in, health-enabled user; every health RPC scopes its rows by the returned id.
create or replace function app_private.require_health_access()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
    v_uid uuid := app_private.require_uid();
begin
    if not app_private.has_health_access(v_uid) then
        perform app_private.fail('HEALTH_ACCESS_DENIED');
    end if;
    return v_uid;
end
$$;

create or replace function public.api_health_access()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    return app_private.has_health_access(app_private.require_uid());
end
$$;

select app_private.secure_api_functions();
