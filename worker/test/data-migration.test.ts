import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createAuthUser, createTestDatabase } from "./support/database";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "../../scripts/migrate-data");
const staging = readFileSync(join(SCRIPTS, "staging.sql"), "utf8");
const transform = readFileSync(join(SCRIPTS, "transform.sql"), "utf8");

let db: PGlite;
let owner: string;

/** Loads a small but relationally complete legacy dataset into the staging tables. */
async function loadLegacyData() {
  await db.exec(staging);
  await db.exec(`
    insert into pg_temp.legacy_project values
      (3, 'Legacy project', 'd', 'ACTIVE', '2026-01-01', '2026-02-01', null, '2026-01-01T10:00:00Z', '2026-01-02T10:00:00Z'),
      (9, 'Archived', null, 'ARCHIVED', null, null, '2026-03-01T00:00:00Z', '2026-01-05T10:00:00Z', '2026-03-01T00:00:00Z');
    insert into pg_temp.legacy_task values
      (11, 3, 'Task A', null, 'COMPLETED', 'HIGH', 30, '2026-01-10', '2026-01-09T12:00:00Z', '2026-01-02T10:00:00Z', '2026-01-09T12:00:00Z'),
      (12, null, 'Task B', 'x', 'TODO', 'MEDIUM', null, null, null, '2026-01-03T10:00:00Z', '2026-01-03T10:00:00Z');
    insert into pg_temp.legacy_subtask values (21, 11, 'step', true, '2026-01-02T11:00:00Z');
    insert into pg_temp.legacy_focus_session values
      (31, 11, 3, '2026-01-09T10:00:00Z', '2026-01-09T10:25:00Z', 25, 5, 0, null, 1500, 'COMPLETED', null, '2026-01-09T10:00:00Z', 3),
      (32, null, null, '2026-01-10T10:00:00Z', null, 25, null, 60, '2026-01-10T10:05:00Z', null, 'PAUSED', null, '2026-01-10T10:00:00Z', 1);
    insert into pg_temp.legacy_goal values
      (41, 'Goal', null, 'FOCUS_MINUTES', 60, 'DAILY', '2026-01-01', null, 'ACTIVE', 3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    insert into pg_temp.legacy_note values (51, 'Note', 'body', true, 3, '2026-01-01T00:00:00Z', '2026-01-04T00:00:00Z');
    insert into pg_temp.legacy_journal_entry values (61, '2026-01-01', 'entry', '2026-01-01T20:00:00Z', '2026-01-01T20:00:00Z');
  `);
}

async function runTransform(ownerId: string) {
  await db.transaction(async (tx) => {
    await tx.query("select set_config('migration.owner_id', $1, true)", [ownerId]);
    await tx.exec(transform);
  });
}

beforeEach(async () => {
  db = await createTestDatabase();
  owner = randomUUID();
  await createAuthUser(db, owner, "owner@example.test");
});

describe("legacy data migration", () => {
  it("imports every table preserving ids, relationships and timestamps under the owner", async () => {
    await loadLegacyData();
    await runTransform(owner);

    const projects = await db.query<{ id: number; user_id: string; status: string }>(
      "select id, user_id, status from public.project order by id",
    );
    expect(projects.rows).toEqual([
      { id: 3, user_id: owner, status: "ACTIVE" },
      { id: 9, user_id: owner, status: "ARCHIVED" },
    ]);
    const task = await db.query<{ project_id: number; completed_at: Date }>(
      "select project_id, completed_at from public.task where id = 11",
    );
    expect(task.rows[0]!.project_id).toBe(3);
    expect(task.rows[0]!.completed_at.toISOString()).toBe("2026-01-09T12:00:00.000Z");
    const counts = await db.query<Record<string, number>>(`
      select (select count(*)::int from public.subtask where user_id = '${owner}') as subtask,
             (select count(*)::int from public.focus_session where user_id = '${owner}') as focus_session,
             (select count(*)::int from public.goal where user_id = '${owner}') as goal,
             (select count(*)::int from public.note where user_id = '${owner}') as note,
             (select count(*)::int from public.journal_entry where user_id = '${owner}') as journal_entry`);
    expect(counts.rows[0]).toEqual({ subtask: 1, focus_session: 2, goal: 1, note: 1, journal_entry: 1 });

    // The migrated data is served through the normal API as the owner (RLS + functions).
    const view = await asUser(
      db,
      owner,
      (tx) => tx.query<{ r: { id: number; status: string } }>("select public.api_focus_current() as r"),
      { now: "2026-01-10T10:10:00Z" },
    );
    expect(view.rows[0]!.r).toMatchObject({ id: 32, status: "PAUSED" });
  });

  it("advances identity sequences past the imported ids", async () => {
    await loadLegacyData();
    await runTransform(owner);
    const created = await asUser(db, owner, (tx) =>
      tx.query<{ r: { id: number } }>("select public.api_project_create('New', null, null, null) as r"),
    );
    expect(created.rows[0]!.r.id).toBeGreaterThan(9);
    const task = await asUser(db, owner, (tx) =>
      tx.query<{ r: { id: number } }>("select public.api_task_create('New', null, null, null, null, null) as r"),
    );
    expect(task.rows[0]!.r.id).toBeGreaterThan(12);
  });

  it("refuses to run twice or for an unknown owner, leaving data untouched", async () => {
    await loadLegacyData();
    await expect(runTransform(randomUUID())).rejects.toThrow(/does not exist in auth.users/);
    await runTransform(owner);
    await expect(runTransform(owner)).rejects.toThrow(/already contains/);
    const n = await db.query<{ n: number }>("select count(*)::int as n from public.project");
    expect(n.rows[0]!.n).toBe(2);
  });

  it("requires the owner id setting", async () => {
    await loadLegacyData();
    await expect(runTransform("")).rejects.toThrow(/migration.owner_id/);
  });
});
