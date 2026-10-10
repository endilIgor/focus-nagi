import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import type { Rpc } from "../src/db";
import { mapDatabaseError } from "../src/db";
import { ApiError } from "../src/errors";
import { MIGRATIONS_DIR, asUser, createAuthUser, createTestDatabase } from "./support/database";
import { TEST_ENV, createHarness, type Harness } from "./support/harness";

const MIGRATION = "20261010120000_personal_health_access.sql";

let db: PGlite | undefined;
let owner: string;
let other: string;
let ownerEnabled = false;

/**
 * Asserts that the migration file exists and created every health object. Runs before any seed,
 * so a missing migration fails as an assertion instead of a setup error.
 */
async function expectHealthSchema(database: PGlite): Promise<void> {
  expect(existsSync(join(MIGRATIONS_DIR, MIGRATION)), `migration ${MIGRATION}`).toBe(true);
  const res = await database.query<Record<string, boolean>>(
    `select to_regclass('app_private.health_access') is not null as "table",
            to_regprocedure('public.api_health_access()') is not null as api,
            to_regprocedure('app_private.has_health_access(uuid)') is not null as has,
            to_regprocedure('app_private.require_health_access()') is not null as require`,
  );
  expect(res.rows[0]).toEqual({ table: true, api: true, has: true, require: true });
}

/** Administrative enablement: a direct database session, never a client role. */
async function enable(database: PGlite, userId: string): Promise<void> {
  await expectHealthSchema(database);
  await database.query("insert into app_private.health_access (user_id) values ($1)", [userId]);
}

/**
 * Shared real-SQL setup for the database suites. `beforeAll` only touches pre-existing objects;
 * every test first asserts the health schema, then the owner is enabled once.
 */
function useHealthDatabase(): void {
  beforeAll(async () => {
    if (db) return;
    db = await createTestDatabase();
    owner = randomUUID();
    other = randomUUID();
    await createAuthUser(db, owner, "owner@example.test");
    await createAuthUser(db, other, "other@example.test");
  });
  beforeEach(async () => {
    await expectHealthSchema(sql());
    if (!ownerEnabled) {
      await enable(sql(), owner);
      ownerEnabled = true;
    }
  });
}

function sql(): PGlite {
  if (!db) throw new Error("test database not initialised");
  return db;
}

async function healthAccessAs(userId: string | null, role?: "authenticated" | "anon"): Promise<unknown> {
  return asUser(
    sql(),
    userId,
    async (tx) => (await tx.query<{ result: unknown }>("select public.api_health_access() as result")).rows[0]!.result,
    role ? { role } : {},
  );
}

/** Runs the shared helper as the migration owner (as a SECURITY DEFINER RPC would) under JWT claims. */
async function requireHealthAccessAs(userId: string | null): Promise<unknown> {
  return sql().transaction(async (tx) => {
    const claims = userId ? { sub: userId, role: "authenticated" } : { role: "authenticated" };
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const res = await tx.query<{ uid: unknown }>("select app_private.require_health_access() as uid");
    return res.rows[0]!.uid;
  });
}

describe("health access migration (real SQL)", () => {
  useHealthDatabase();

  it("ships the migration with the private table, the RPC and both helpers", async () => {
    await expectHealthSchema(sql());
  });
});

describe("api_health_access (real SQL)", () => {
  useHealthDatabase();

  it("returns true for an enabled account", async () => {
    await expect(healthAccessAs(owner)).resolves.toBe(true);
  });

  it("returns false for an authenticated account that is not enabled", async () => {
    await expect(healthAccessAs(other)).resolves.toBe(false);
  });

  it("does not leak enablement between accounts", async () => {
    const fresh = randomUUID();
    await createAuthUser(sql(), fresh, "fresh@example.test");
    await expect(healthAccessAs(fresh)).resolves.toBe(false);
    await enable(sql(), fresh);
    await expect(healthAccessAs(fresh)).resolves.toBe(true);
    await expect(healthAccessAs(other)).resolves.toBe(false);
  });

  it("denies the anon role", async () => {
    await expect(healthAccessAs(null)).rejects.toThrow(/permission denied/);
  });

  it("rejects the authenticated role without a user", async () => {
    await expect(healthAccessAs(null, "authenticated")).rejects.toThrow(/UNAUTHENTICATED/);
  });

  it("takes no arguments, so a caller cannot ask about another account", async () => {
    const res = await sql().query<{ n: number }>(
      `select p.pronargs::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'api_health_access'`,
    );
    expect(res.rows).toEqual([{ n: 0 }]);
  });

  it("drops enablement when the auth user is deleted", async () => {
    const gone = randomUUID();
    await createAuthUser(sql(), gone, "gone@example.test");
    await enable(sql(), gone);
    await sql().query("delete from auth.users where id = $1", [gone]);
    const res = await sql().query<{ n: number }>(
      "select count(*)::int as n from app_private.health_access where user_id = $1",
      [gone],
    );
    expect(res.rows[0]!.n).toBe(0);
  });
});

describe("self-enablement and direct access", () => {
  useHealthDatabase();

  it.each([
    ["insert", (uid: string) => `insert into app_private.health_access (user_id) values ('${uid}')`],
    ["select", () => "select * from app_private.health_access"],
    ["update", (uid: string) => `update app_private.health_access set user_id = '${uid}'`],
    ["delete", () => "delete from app_private.health_access"],
  ])("denies an authenticated client to %s the private table", async (_op, statement) => {
    await expect(asUser(sql(), other, (tx) => tx.query(statement(other)))).rejects.toThrow(/permission denied/);
    await expect(healthAccessAs(other)).resolves.toBe(false);
  });

  it("denies the anon role direct access to the private table", async () => {
    await expect(
      asUser(sql(), null, (tx) => tx.query(`insert into app_private.health_access (user_id) values ('${other}')`)),
    ).rejects.toThrow(/permission denied/);
  });

  it.each(["app_private.require_health_access()", `app_private.has_health_access('${randomUUID()}')`])(
    "denies clients direct execution of %s",
    async (call) => {
      await expect(asUser(sql(), other, (tx) => tx.query(`select ${call}`))).rejects.toThrow(/permission denied/);
      await expect(asUser(sql(), null, (tx) => tx.query(`select ${call}`))).rejects.toThrow(/permission denied/);
    },
  );

  it("exposes no client function that writes the enablement table", async () => {
    const res = await sql().query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'api\\_%health%'`,
    );
    expect(res.rows.map((r) => r.proname)).toEqual(["api_health_access"]);
  });
});

describe("grants and hardening", () => {
  useHealthDatabase();

  it("keeps the private table closed to every client role, with RLS and no policies", async () => {
    const res = await sql().query<{ role: string; sel: boolean; ins: boolean; upd: boolean; del: boolean }>(
      `select r as role,
              has_table_privilege(r, 'app_private.health_access', 'select') as sel,
              has_table_privilege(r, 'app_private.health_access', 'insert') as ins,
              has_table_privilege(r, 'app_private.health_access', 'update') as upd,
              has_table_privilege(r, 'app_private.health_access', 'delete') as del
       from unnest(array['anon', 'authenticated', 'public']) as r`,
    );
    for (const row of res.rows) {
      expect(row, row.role).toMatchObject({ sel: false, ins: false, upd: false, del: false });
    }
    const schema = await sql().query<{ anon: boolean; auth: boolean }>(
      `select has_schema_privilege('anon', 'app_private', 'usage') as anon,
              has_schema_privilege('authenticated', 'app_private', 'usage') as auth`,
    );
    expect(schema.rows[0]).toEqual({ anon: false, auth: false });

    const rls = await sql().query<{ relrowsecurity: boolean }>(
      `select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'app_private' and c.relname = 'health_access'`,
    );
    expect(rls.rows).toEqual([{ relrowsecurity: true }]);
    const policies = await sql().query<{ n: number }>(
      "select count(*)::int as n from pg_policies where schemaname = 'app_private' and tablename = 'health_access'",
    );
    expect(policies.rows[0]!.n).toBe(0);
  });

  it("grants api_health_access only to authenticated, as SECURITY DEFINER with an empty search_path", async () => {
    const res = await sql().query<{ auth: boolean; anon: boolean; pub: boolean; prosecdef: boolean; proconfig: string[] | null }>(
      `select has_function_privilege('authenticated', 'public.api_health_access()', 'execute') as auth,
              has_function_privilege('anon', 'public.api_health_access()', 'execute') as anon,
              has_function_privilege('public', 'public.api_health_access()', 'execute') as pub,
              p.prosecdef, p.proconfig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'api_health_access'`,
    );
    expect(res.rows[0]).toMatchObject({ auth: true, anon: false, pub: false, prosecdef: true });
    expect(res.rows[0]!.proconfig ?? []).toContain('search_path=""');
  });

  it("pins search_path on the private helpers and keeps them non-executable by clients", async () => {
    const res = await sql().query<{ proname: string; proconfig: string[] | null; auth: boolean; anon: boolean }>(
      `select p.proname, p.proconfig,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app_private' and p.proname in ('has_health_access', 'require_health_access')
       order by p.proname`,
    );
    expect(res.rows.map((r) => r.proname)).toEqual(["has_health_access", "require_health_access"]);
    for (const fn of res.rows) {
      expect(fn.proconfig ?? [], fn.proname).toContain('search_path=""');
      expect(fn.auth, fn.proname).toBe(false);
      expect(fn.anon, fn.proname).toBe(false);
    }
  });

  it("is idempotent and never enables accounts by itself", async () => {
    const before = await sql().query<{ user_id: string }>("select user_id from app_private.health_access order by user_id");
    await sql().exec(readFileSync(join(MIGRATIONS_DIR, MIGRATION), "utf8"));
    const after = await sql().query<{ user_id: string }>("select user_id from app_private.health_access order by user_id");
    expect(after.rows).toEqual(before.rows);

    const pristine = await createTestDatabase();
    await expectHealthSchema(pristine);
    const rows = await pristine.query<{ n: number }>("select count(*)::int as n from app_private.health_access");
    expect(rows.rows[0]!.n).toBe(0);
    await pristine.close();
  });
});

describe("shared require_health_access helper", () => {
  useHealthDatabase();

  it("returns the caller id for an enabled account", async () => {
    await expect(requireHealthAccessAs(owner)).resolves.toBe(owner);
  });

  it("raises HEALTH_ACCESS_DENIED for an account that is not enabled", async () => {
    await expect(requireHealthAccessAs(other)).rejects.toThrow(/HEALTH_ACCESS_DENIED/);
  });

  it("raises UNAUTHENTICATED without a user", async () => {
    await expect(requireHealthAccessAs(null)).rejects.toThrow(/UNAUTHENTICATED/);
  });
});

describe("HEALTH_ACCESS_DENIED error mapping", () => {
  it("maps HEALTH_ACCESS_DENIED to a 403 API error", () => {
    const err = mapDatabaseError({ code: "P0001", message: "HEALTH_ACCESS_DENIED", details: "" });
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: "HEALTH_ACCESS_DENIED" });
  });
});

describe("GET /api/auth/me healthAccess (HTTP + real database)", () => {
  let h: Harness;
  beforeAll(async () => {
    // The harness applies only the migrations on disk; the health schema is asserted inside `enable`.
    h = await createHarness();
  });

  it("reports true for an enabled owner, preserving id and email", async () => {
    const user = await h.newUser("enabled@example.test");
    await enable(h.db, user.userId);
    const res = await user.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: user.userId, email: "enabled@example.test", healthAccess: true });
  });

  it("reports false for an account that is not enabled", async () => {
    const user = await h.newUser("plain@example.test");
    const res = await user.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: user.userId, email: "plain@example.test", healthAccess: false });
  });

  it("keeps focus features working for an account without health access", async () => {
    const enabled = await h.newUser();
    await enable(h.db, enabled.userId);
    const b = await h.newUser();
    const project = await b.post("/api/projects", { title: "B project" });
    expect(project.status).toBe(201);
    const session = await b.post("/api/focus-sessions", { plannedFocusMinutes: 25 });
    expect(session.status).toBe(201);
    const current = await b.get("/api/focus-sessions/current");
    expect(current.status).toBe(200);
    expect((await b.get("/api/auth/me")).body.healthAccess).toBe(false);
  });
});

describe("GET /api/auth/me fails closed (fake RPC, no database)", () => {
  afterEach(() => vi.restoreAllMocks());

  async function meWith(call: () => Promise<unknown>) {
    const app = createApp({
      rpc: () => ({ call: call as Rpc["call"] }),
      verifyToken: async (token) => ({ id: "5c1e7a9b-0d2f-4c3a-8b1e-2f3a4b5c6d7e", email: "x@example.test", token }),
    });
    const res = await app.request("http://localhost/api/auth/me", { headers: { Authorization: "Bearer t" } }, TEST_ENV);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it("asks the database through api_health_access with no client-supplied arguments", async () => {
    const call = vi.fn(async () => true);
    const res = await meWith(call);
    expect(call).toHaveBeenCalledWith("api_health_access", {});
    expect(res.body.healthAccess).toBe(true);
  });

  it.each([
    ["an API error", () => Promise.reject(new ApiError(403, "ACCESS_DENIED", "Access denied."))],
    ["an upstream outage", () => Promise.reject(new ApiError(502, "UPSTREAM_UNAVAILABLE", "Database service unavailable."))],
    ["an unexpected exception", () => Promise.reject(new TypeError("boom"))],
    ["a string 'true'", () => Promise.resolve("true")],
    ["the number 1", () => Promise.resolve(1)],
    ["an object", () => Promise.resolve({ healthAccess: true })],
    ["null", () => Promise.resolve(null)],
  ])("returns healthAccess false on %s", async (_label, call) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await meWith(call);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "5c1e7a9b-0d2f-4c3a-8b1e-2f3a4b5c6d7e", email: "x@example.test", healthAccess: false });
  });
});
