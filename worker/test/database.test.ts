import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, asUser, createAuthUser, createTestDatabase, migrationFiles } from "./support/database";

let db: PGlite;
let alice: string;
let bob: string;

const TABLES = ["project", "task", "subtask", "focus_session", "goal", "note", "journal_entry"];

beforeAll(async () => {
  db = await createTestDatabase();
  alice = randomUUID();
  bob = randomUUID();
  await createAuthUser(db, alice, "alice@example.test");
  await createAuthUser(db, bob, "bob@example.test");
  await asUser(db, alice, (tx) =>
    tx.query("select public.api_project_create('A', null, null, null)"),
  );
  await asUser(db, alice, (tx) =>
    tx.query("select public.api_task_create('T', null, null, null, null, null)"),
  );
});

describe("migrations", () => {
  it("are idempotent (safe to re-run)", async () => {
    for (const file of migrationFiles()) {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    }
    const count = await db.query<{ n: number }>("select count(*)::int as n from public.project");
    expect(count.rows[0]!.n).toBe(1);
  });

  it("enable RLS on every user-data table", async () => {
    const res = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    const tables = Object.fromEntries(res.rows.map((r) => [r.relname, r.relrowsecurity]));
    for (const t of TABLES) expect(tables[t], t).toBe(true);
    expect(Object.keys(tables).sort()).toEqual([...TABLES].sort());
  });

  it("exposes only SECURITY DEFINER API functions with a pinned search_path", async () => {
    const res = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
      `select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'api\\_%'`,
    );
    expect(res.rows.length).toBeGreaterThan(40);
    for (const fn of res.rows) {
      expect(fn.prosecdef, fn.proname).toBe(true);
      expect(fn.proconfig ?? [], fn.proname).toContain('search_path=""');
    }
  });
});

describe("database access boundary", () => {
  it("denies authenticated clients direct access to every user-data table", async () => {
    for (const table of TABLES) {
      await expect(
        asUser(db, alice, (tx) => tx.query(`select * from public.${table} limit 1`)),
        table,
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(db, alice, (tx) => tx.query(`insert into public.${table} default values`)),
        table,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("keeps SECURITY DEFINER RPC results scoped to the caller", async () => {
    const project = await db.query<{ id: number }>("select id from public.project where title = 'A'");
    const id = project.rows[0]!.id;

    await expect(
      asUser(db, bob, (tx) => tx.query("select public.api_project_get($1)", [id])),
    ).rejects.toThrow(/PROJECT_NOT_FOUND/);

    const list = await asUser(db, bob, (tx) =>
      tx.query<{ result: { totalElements: number } }>(
        "select public.api_project_list(null, 0, 20) as result",
      ),
    );
    expect(list.rows[0]!.result.totalElements).toBe(0);
  });

  it("gives the anon role no access to tables or API functions", async () => {
    await expect(asUser(db, null, (tx) => tx.query("select * from public.project"))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, (tx) => tx.query("select public.api_today('UTC')"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("rejects API calls without a user even for the authenticated role", async () => {
    await expect(
      asUser(db, null, (tx) => tx.query("select public.api_project_list(null, 0, 20)"), { role: "authenticated" }),
    ).rejects.toThrow(/UNAUTHENTICATED/);
  });
});

describe("single active focus session invariant", () => {
  it("is enforced by the database per user", async () => {
    const insert = (uid: string, status: string) =>
      db.query(
        `insert into public.focus_session (user_id, started_at, planned_focus_minutes, status, last_paused_at)
         values ($1, now(), 25, $2, now())`,
        [uid, status],
      );
    await insert(alice, "RUNNING");
    await expect(insert(alice, "PAUSED")).rejects.toThrow(/ux_focus_session_single_active/);
    await insert(bob, "RUNNING");
    await insert(alice, "COMPLETED");
  });
});
