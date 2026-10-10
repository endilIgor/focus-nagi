import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, asUser, createAuthUser, createTestDatabase } from "./support/database";

const MIGRATION = "20261010121000_training_catalog.sql";

const TABLES = ["public.training_routine", "public.training_exercise"];

const RPCS = [
  "public.api_training_routine_create(text, integer[])",
  "public.api_training_routine_list(integer, integer)",
  "public.api_training_routine_get(bigint)",
  "public.api_training_routine_update(bigint, jsonb)",
  "public.api_training_routine_delete(bigint)",
  "public.api_training_exercise_create(bigint, text, integer, text, integer, integer, text)",
  "public.api_training_exercise_list(bigint, integer, integer)",
  "public.api_training_exercise_get(bigint, bigint)",
  "public.api_training_exercise_update(bigint, bigint, jsonb)",
  "public.api_training_exercise_delete(bigint, bigint)",
];

interface Routine {
  id: number;
  name: string;
  weekdays: number[];
  exerciseCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Exercise {
  id: number;
  routineId: number;
  name: string;
  sets: number;
  mode: "REPETITIONS" | "DURATION";
  repetitions: number | null;
  durationSeconds: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

interface ExerciseInput {
  name: string | null;
  sets: number | null;
  mode: string | null;
  repetitions?: number | null;
  durationSeconds?: number | null;
  notes?: string | null;
}

type CallOptions = { now?: string | null; role?: "authenticated" | "anon" };

let db: PGlite | undefined;
let owner: string;
let peer: string;
let blocked: string;

function sql(): PGlite {
  if (!db) throw new Error("test database not initialised");
  return db;
}

/**
 * Asserts the migration file and every training table/RPC before any seed, so a missing
 * migration fails as an assertion instead of a setup error.
 */
async function expectTrainingSchema(database: PGlite): Promise<void> {
  expect(existsSync(join(MIGRATIONS_DIR, MIGRATION)), `migration ${MIGRATION}`).toBe(true);
  const res = await database.query<{ name: string }>(
    `select t.name from jsonb_array_elements_text($1::jsonb) t(name) where to_regclass(t.name) is null
     union all
     select f.name from jsonb_array_elements_text($2::jsonb) f(name) where to_regprocedure(f.name) is null`,
    [JSON.stringify(TABLES), JSON.stringify(RPCS)],
  );
  expect(res.rows.map((r) => r.name), "missing training objects").toEqual([]);
}

/** Administrative enablement (direct database session; table created by the task 4 migration). */
async function enable(userId: string): Promise<void> {
  await sql().query("insert into app_private.health_access (user_id) values ($1)", [userId]);
}

async function newUser(enabled = true): Promise<string> {
  const id = randomUUID();
  await createAuthUser(sql(), id, `${id}@example.test`);
  if (enabled) await enable(id);
  return id;
}

beforeAll(async () => {
  db = await createTestDatabase();
  owner = randomUUID();
  peer = randomUUID();
  blocked = randomUUID();
  await createAuthUser(db, owner, "owner@example.test");
  await createAuthUser(db, peer, "peer@example.test");
  await createAuthUser(db, blocked, "blocked@example.test");
  await enable(owner);
  await enable(peer);
});

beforeEach(async () => {
  await expectTrainingSchema(sql());
});

async function call<T>(userId: string | null, text: string, params: unknown[], options: CallOptions = {}): Promise<T> {
  return asUser(
    sql(),
    userId,
    async (tx) => (await tx.query<{ result: T }>(text, params)).rows[0]!.result,
    options,
  );
}

const pgArray = (values: readonly (number | null)[] | null | undefined): string | null =>
  values == null ? null : `{${values.map((v) => (v === null ? "NULL" : String(v))).join(",")}}`;

const createRoutine = (uid: string | null, name: string | null, weekdays?: (number | null)[] | null, options?: CallOptions) =>
  call<Routine>(uid, "select public.api_training_routine_create($1, $2::int[]) as result", [name, pgArray(weekdays)], options);

const listRoutines = (uid: string | null, page: number | null = 0, size: number | null = 20) =>
  call<Page<Routine>>(uid, "select public.api_training_routine_list($1, $2) as result", [page, size]);

const getRoutine = (uid: string | null, id: number) =>
  call<Routine>(uid, "select public.api_training_routine_get($1) as result", [id]);

const updateRoutine = (uid: string | null, id: number, patch: unknown, options?: CallOptions) =>
  call<Routine>(
    uid,
    "select public.api_training_routine_update($1, $2::jsonb) as result",
    [id, patch === undefined ? null : JSON.stringify(patch)],
    options,
  );

const deleteRoutine = (uid: string | null, id: number) =>
  call<unknown>(uid, "select public.api_training_routine_delete($1) as result", [id]);

const createExercise = (uid: string | null, routineId: number, input: ExerciseInput, options?: CallOptions) =>
  call<Exercise>(
    uid,
    "select public.api_training_exercise_create($1, $2, $3, $4, $5, $6, $7) as result",
    [
      routineId,
      input.name,
      input.sets,
      input.mode,
      input.repetitions ?? null,
      input.durationSeconds ?? null,
      input.notes ?? null,
    ],
    options,
  );

const listExercises = (uid: string | null, routineId: number, page: number | null = 0, size: number | null = 20) =>
  call<Page<Exercise>>(uid, "select public.api_training_exercise_list($1, $2, $3) as result", [routineId, page, size]);

const getExercise = (uid: string | null, routineId: number, id: number) =>
  call<Exercise>(uid, "select public.api_training_exercise_get($1, $2) as result", [routineId, id]);

const updateExercise = (uid: string | null, routineId: number, id: number, patch: unknown, options?: CallOptions) =>
  call<Exercise>(
    uid,
    "select public.api_training_exercise_update($1, $2, $3::jsonb) as result",
    [routineId, id, patch === undefined ? null : JSON.stringify(patch)],
    options,
  );

const deleteExercise = (uid: string | null, routineId: number, id: number) =>
  call<unknown>(uid, "select public.api_training_exercise_delete($1, $2) as result", [routineId, id]);

const reps = (name = "Flexão", repetitions = 10, sets = 3): ExerciseInput => ({
  name,
  sets,
  mode: "REPETITIONS",
  repetitions,
});

const timed = (name = "Prancha", durationSeconds = 45, sets = 3): ExerciseInput => ({
  name,
  sets,
  mode: "DURATION",
  durationSeconds,
});

async function expectDomainError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code: "P0001", message: code });
}

const expectInvalid = (promise: Promise<unknown>) => expectDomainError(promise, "VALIDATION_ERROR");

async function rowCount(table: string, where: string, params: unknown[]): Promise<number> {
  const res = await sql().query<{ n: number }>(`select count(*)::int as n from public.${table} where ${where}`, params);
  return res.rows[0]!.n;
}

describe("training catalog migration", () => {
  it("ships the migration with both tables and every RPC", async () => {
    await expectTrainingSchema(sql());
  });

  it("exposes exactly the training RPCs to clients", async () => {
    const res = await sql().query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'api\\_training\\_%' order by p.proname`,
    );
    expect(res.rows.map((r) => r.proname)).toEqual([
      "api_training_exercise_create",
      "api_training_exercise_delete",
      "api_training_exercise_get",
      "api_training_exercise_list",
      "api_training_exercise_update",
      "api_training_routine_create",
      "api_training_routine_delete",
      "api_training_routine_get",
      "api_training_routine_list",
      "api_training_routine_update",
    ]);
  });

  it("is idempotent and keeps existing rows", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Idempotente", [1]);
    await createExercise(uid, routine.id, reps());
    await sql().exec(readFileSync(join(MIGRATIONS_DIR, MIGRATION), "utf8"));
    await expect(getRoutine(uid, routine.id)).resolves.toMatchObject({ name: "Idempotente", exerciseCount: 1 });
    const policies = await sql().query<{ n: number }>(
      "select count(*)::int as n from pg_policies where schemaname = 'public' and tablename like 'training\\_%'",
    );
    expect(policies.rows[0]!.n).toBe(8);
  });

  it("inserts no catalog rows by itself", async () => {
    const res = await sql().query<{ n: number }>(
      `select (select count(*) from public.training_routine r
               where not exists (select 1 from app_private.health_access a where a.user_id = r.user_id))::int as n`,
    );
    expect(res.rows[0]!.n).toBe(0);
  });
});

describe("routines CRUD (real SQL)", () => {
  it("creates a routine for the caller with trimmed name and normalized weekdays", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "  Calistenia A  ", [7, 1, 3], { now: "2026-10-10T12:00:00Z" });
    expect(routine).toEqual({
      id: expect.any(Number),
      name: "Calistenia A",
      weekdays: [1, 3, 7],
      exerciseCount: 0,
      createdAt: "2026-10-10T12:00:00.000Z",
      updatedAt: "2026-10-10T12:00:00.000Z",
    });
    const stored = await sql().query<{ user_id: string }>("select user_id from public.training_routine where id = $1", [
      routine.id,
    ]);
    expect(stored.rows).toEqual([{ user_id: uid }]);
  });

  it("treats weekdays as optional: null and empty both store no days", async () => {
    const uid = await newUser();
    await expect(createRoutine(uid, "Sem dias", null)).resolves.toMatchObject({ weekdays: [] });
    await expect(createRoutine(uid, "Vazio", [])).resolves.toMatchObject({ weekdays: [] });
  });

  it("gets, lists, updates and deletes a routine", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Treino", [2], { now: "2026-10-10T08:00:00Z" });
    await expect(getRoutine(uid, routine.id)).resolves.toEqual(routine);

    const list = await listRoutines(uid);
    expect(list.content).toEqual([routine]);

    const updated = await updateRoutine(uid, routine.id, { name: "Treino B", weekdays: [4, 2] }, { now: "2026-10-11T08:00:00Z" });
    expect(updated).toEqual({
      ...routine,
      name: "Treino B",
      weekdays: [2, 4],
      updatedAt: "2026-10-11T08:00:00.000Z",
    });
    await expect(getRoutine(uid, routine.id)).resolves.toEqual(updated);

    await expect(deleteRoutine(uid, routine.id)).resolves.toBeNull();
    await expectDomainError(getRoutine(uid, routine.id), "TRAINING_ROUTINE_NOT_FOUND");
    await expectDomainError(deleteRoutine(uid, routine.id), "TRAINING_ROUTINE_NOT_FOUND");
    expect((await listRoutines(uid)).content).toEqual([]);
  });

  it("returns TRAINING_ROUTINE_NOT_FOUND for unknown ids", async () => {
    const uid = await newUser();
    await expectDomainError(getRoutine(uid, 999_999_999), "TRAINING_ROUTINE_NOT_FOUND");
    await expectDomainError(updateRoutine(uid, 999_999_999, { name: "x" }), "TRAINING_ROUTINE_NOT_FOUND");
    await expectDomainError(deleteRoutine(uid, 999_999_999), "TRAINING_ROUTINE_NOT_FOUND");
  });
});

describe("routine limits (real SQL)", () => {
  it("accepts a 150-character name and rejects 151, blank or null", async () => {
    const uid = await newUser();
    await expect(createRoutine(uid, "a".repeat(150))).resolves.toMatchObject({ name: "a".repeat(150) });
    await expectInvalid(createRoutine(uid, "a".repeat(151)));
    await expectInvalid(createRoutine(uid, "   "));
    await expectInvalid(createRoutine(uid, ""));
    await expectInvalid(createRoutine(uid, null));
  });

  it("accepts every weekday 1..7 and rejects out-of-range, duplicated or null days", async () => {
    const uid = await newUser();
    await expect(createRoutine(uid, "Todos", [1, 2, 3, 4, 5, 6, 7])).resolves.toMatchObject({
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    });
    await expectInvalid(createRoutine(uid, "Zero", [0]));
    await expectInvalid(createRoutine(uid, "Oito", [8]));
    await expectInvalid(createRoutine(uid, "Negativo", [-1]));
    await expectInvalid(createRoutine(uid, "Duplicado", [1, 1]));
    await expectInvalid(createRoutine(uid, "Nulo", [1, null]));
    expect(await rowCount("training_routine", "user_id = $1", [uid])).toBe(1);
  });
});

describe("routine PATCH: omitted versus null (real SQL)", () => {
  it("keeps omitted fields", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Manter", [1, 3]);
    await expect(updateRoutine(uid, routine.id, { name: "Renomeada" })).resolves.toMatchObject({
      name: "Renomeada",
      weekdays: [1, 3],
    });
    await expect(updateRoutine(uid, routine.id, { weekdays: [5] })).resolves.toMatchObject({
      name: "Renomeada",
      weekdays: [5],
    });
    await expect(updateRoutine(uid, routine.id, {})).resolves.toMatchObject({ name: "Renomeada", weekdays: [5] });
  });

  it("clears optional weekdays with null but never the required name", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Limpar", [2, 6]);
    await expect(updateRoutine(uid, routine.id, { weekdays: null })).resolves.toMatchObject({
      name: "Limpar",
      weekdays: [],
    });
    await expectInvalid(updateRoutine(uid, routine.id, { name: null }));
    await expectInvalid(updateRoutine(uid, routine.id, { name: "  " }));
    await expectInvalid(updateRoutine(uid, routine.id, { name: "b".repeat(151) }));
    await expect(getRoutine(uid, routine.id)).resolves.toMatchObject({ name: "Limpar", weekdays: [] });
  });

  it.each([
    ["an unknown key", { userId: "00000000-0000-0000-0000-000000000000" }],
    ["an id key", { id: 1 }],
    ["a string name number", { name: 5 }],
    ["weekdays as a string", { weekdays: "1" }],
    ["a fractional weekday", { weekdays: [1.5] }],
    ["an out-of-range weekday", { weekdays: [8] }],
    ["duplicated weekdays", { weekdays: [3, 3] }],
    ["a null weekday", { weekdays: [null] }],
    ["an array patch", [1]],
    ["a JSON null patch", null],
  ])("rejects %s without changing the row", async (_label, patch) => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Intacta", [1]);
    await expectInvalid(updateRoutine(uid, routine.id, patch));
    await expect(getRoutine(uid, routine.id)).resolves.toEqual(routine);
  });

  it("rejects an SQL null patch", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Nulo SQL");
    await expectInvalid(updateRoutine(uid, routine.id, undefined));
  });
});

describe("exercises CRUD and modes (real SQL)", () => {
  it("creates a repetitions exercise and a duration exercise with coherent targets", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Rotina");
    const pushUp = await createExercise(
      uid,
      routine.id,
      { ...reps("  Flexão  ", 12, 4), notes: "  Cotovelos fechados  " },
      { now: "2026-10-10T09:00:00Z" },
    );
    expect(pushUp).toEqual({
      id: expect.any(Number),
      routineId: routine.id,
      name: "Flexão",
      sets: 4,
      mode: "REPETITIONS",
      repetitions: 12,
      durationSeconds: null,
      notes: "Cotovelos fechados",
      createdAt: "2026-10-10T09:00:00.000Z",
      updatedAt: "2026-10-10T09:00:00.000Z",
    });
    const plank = await createExercise(uid, routine.id, timed("Prancha", 60, 2));
    expect(plank).toMatchObject({ mode: "DURATION", durationSeconds: 60, repetitions: null, notes: null, sets: 2 });

    await expect(getExercise(uid, routine.id, pushUp.id)).resolves.toEqual(pushUp);
    await expect(getRoutine(uid, routine.id)).resolves.toMatchObject({ exerciseCount: 2 });
  });

  it("normalizes blank notes to null", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Notas");
    await expect(createExercise(uid, routine.id, { ...reps(), notes: "   " })).resolves.toMatchObject({ notes: null });
  });

  it("updates and deletes an exercise without touching its siblings or the routine timestamp", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Rotina", null, { now: "2026-10-10T07:00:00Z" });
    const first = await createExercise(uid, routine.id, reps("A"));
    const second = await createExercise(uid, routine.id, reps("B"));

    const updated = await updateExercise(uid, routine.id, first.id, { name: "A2", sets: 5 }, { now: "2026-10-12T07:00:00Z" });
    expect(updated).toEqual({ ...first, name: "A2", sets: 5, updatedAt: "2026-10-12T07:00:00.000Z" });
    await expect(getRoutine(uid, routine.id)).resolves.toMatchObject({ updatedAt: "2026-10-10T07:00:00.000Z" });

    await expect(deleteExercise(uid, routine.id, first.id)).resolves.toBeNull();
    await expectDomainError(getExercise(uid, routine.id, first.id), "TRAINING_EXERCISE_NOT_FOUND");
    await expectDomainError(deleteExercise(uid, routine.id, first.id), "TRAINING_EXERCISE_NOT_FOUND");
    await expect(getExercise(uid, routine.id, second.id)).resolves.toEqual(second);
    await expect(getRoutine(uid, routine.id)).resolves.toMatchObject({ exerciseCount: 1 });
  });

  it("requires a routine owned by the caller", async () => {
    const uid = await newUser();
    await expectDomainError(createExercise(uid, 999_999_999, reps()), "TRAINING_ROUTINE_NOT_FOUND");
    await expectDomainError(listExercises(uid, 999_999_999), "TRAINING_ROUTINE_NOT_FOUND");
    await expectDomainError(getExercise(uid, 999_999_999, 1), "TRAINING_ROUTINE_NOT_FOUND");
  });
});

describe("exercise limits (real SQL)", () => {
  let uid: string;
  let routineId: number;
  beforeEach(async () => {
    uid = await newUser();
    routineId = (await createRoutine(uid, "Limites")).id;
  });

  it("accepts the boundary values", async () => {
    await expect(createExercise(uid, routineId, { ...reps("a".repeat(150), 1, 1), notes: "n".repeat(2000) })).resolves.toMatchObject({
      name: "a".repeat(150),
      sets: 1,
      repetitions: 1,
      notes: "n".repeat(2000),
    });
    await expect(createExercise(uid, routineId, reps("Máximo", 1000, 1000))).resolves.toMatchObject({
      sets: 1000,
      repetitions: 1000,
    });
    await expect(createExercise(uid, routineId, timed("Curto", 1))).resolves.toMatchObject({ durationSeconds: 1 });
    await expect(createExercise(uid, routineId, timed("Longo", 86400))).resolves.toMatchObject({ durationSeconds: 86400 });
  });

  it.each([
    ["a 151-character name", { ...reps(), name: "a".repeat(151) }],
    ["a blank name", { ...reps(), name: "   " }],
    ["a null name", { ...reps(), name: null }],
    ["2001-character notes", { ...reps(), notes: "n".repeat(2001) }],
    ["zero sets", reps("S", 10, 0)],
    ["1001 sets", reps("S", 10, 1001)],
    ["null sets", { ...reps(), sets: null }],
    ["zero repetitions", reps("R", 0)],
    ["1001 repetitions", reps("R", 1001)],
    ["zero seconds", timed("D", 0)],
    ["86401 seconds", timed("D", 86401)],
    ["an unknown mode", { ...reps(), mode: "SECONDS" }],
    ["a lowercase mode", { ...reps(), mode: "repetitions" }],
    ["a null mode", { ...reps(), mode: null }],
    ["repetitions mode without repetitions", { name: "X", sets: 3, mode: "REPETITIONS" }],
    ["duration mode without seconds", { name: "X", sets: 3, mode: "DURATION" }],
    ["repetitions mode with seconds", { ...reps(), durationSeconds: 30 }],
    ["duration mode with repetitions", { ...timed(), repetitions: 10 }],
  ] as [string, ExerciseInput][])("rejects %s", async (_label, input) => {
    await expectInvalid(createExercise(uid, routineId, input));
    expect(await rowCount("training_exercise", "routine_id = $1", [routineId])).toBe(0);
  });
});

describe("exercise PATCH: omitted versus null and mode conversion (real SQL)", () => {
  let uid: string;
  let routineId: number;
  let exercise: Exercise;
  beforeEach(async () => {
    uid = await newUser();
    routineId = (await createRoutine(uid, "Patch")).id;
    exercise = await createExercise(uid, routineId, { ...reps("Barra", 8, 3), notes: "Pegada pronada" });
  });

  const patch = (body: unknown) => updateExercise(uid, routineId, exercise.id, body);

  it("keeps omitted fields", async () => {
    await expect(patch({ name: "Barra fixa" })).resolves.toMatchObject({
      name: "Barra fixa",
      sets: 3,
      mode: "REPETITIONS",
      repetitions: 8,
      durationSeconds: null,
      notes: "Pegada pronada",
    });
    await expect(patch({ sets: 4 })).resolves.toMatchObject({ name: "Barra fixa", sets: 4, repetitions: 8, notes: "Pegada pronada" });
    await expect(patch({})).resolves.toMatchObject({ name: "Barra fixa", sets: 4, repetitions: 8, notes: "Pegada pronada" });
  });

  it("clears optional notes with null or blank text", async () => {
    await expect(patch({ notes: null })).resolves.toMatchObject({ notes: null, name: "Barra" });
    await patch({ notes: "Nova" });
    await expect(patch({ notes: "   " })).resolves.toMatchObject({ notes: null });
  });

  it("updates the target of the current mode", async () => {
    await expect(patch({ repetitions: 15 })).resolves.toMatchObject({ mode: "REPETITIONS", repetitions: 15, durationSeconds: null });
    await expect(patch({ mode: "REPETITIONS" })).resolves.toMatchObject({ mode: "REPETITIONS", repetitions: 15 });
    await expect(patch({ durationSeconds: null })).resolves.toMatchObject({ repetitions: 15, durationSeconds: null });
  });

  it("converts REPETITIONS to DURATION and back, clearing the incompatible target", async () => {
    await expect(patch({ mode: "DURATION", durationSeconds: 45 })).resolves.toMatchObject({
      mode: "DURATION",
      durationSeconds: 45,
      repetitions: null,
      sets: 3,
      notes: "Pegada pronada",
    });
    await expect(patch({ durationSeconds: 90 })).resolves.toMatchObject({ mode: "DURATION", durationSeconds: 90 });
    await expect(patch({ mode: "REPETITIONS", repetitions: 12, durationSeconds: null })).resolves.toMatchObject({
      mode: "REPETITIONS",
      repetitions: 12,
      durationSeconds: null,
    });
    const stored = await sql().query<{ repetitions: number | null; duration_seconds: number | null }>(
      "select repetitions, duration_seconds from public.training_exercise where id = $1",
      [exercise.id],
    );
    expect(stored.rows).toEqual([{ repetitions: 12, duration_seconds: null }]);
  });

  it.each([
    ["switching mode without the new target", { mode: "DURATION" }],
    ["switching mode with a null new target", { mode: "DURATION", durationSeconds: null }],
    ["switching mode while sending the old target", { mode: "DURATION", durationSeconds: 30, repetitions: 5 }],
    ["an incompatible target for the current mode", { durationSeconds: 30 }],
    ["a null target for the current mode", { repetitions: null }],
    ["a null name", { name: null }],
    ["a blank name", { name: " " }],
    ["a 151-character name", { name: "a".repeat(151) }],
    ["null sets", { sets: null }],
    ["zero sets", { sets: 0 }],
    ["1001 sets", { sets: 1001 }],
    ["sets as a string", { sets: "3" }],
    ["fractional sets", { sets: 3.5 }],
    ["boolean sets", { sets: true }],
    ["a huge integer", { sets: 1e12 }],
    ["1001 repetitions", { repetitions: 1001 }],
    ["86401 seconds", { mode: "DURATION", durationSeconds: 86401 }],
    ["a null mode", { mode: null }],
    ["an unknown mode", { mode: "SECONDS" }],
    ["2001-character notes", { notes: "n".repeat(2001) }],
    ["numeric notes", { notes: 5 }],
    ["an unknown key", { weight: 10 }],
    ["moving to another routine", { routineId: 1 }],
    ["an array patch", [1]],
    ["a JSON null patch", null],
  ])("rejects %s without changing the row", async (_label, body) => {
    await expectInvalid(patch(body));
    await expect(getExercise(uid, routineId, exercise.id)).resolves.toEqual(exercise);
  });

  it("rejects an SQL null patch", async () => {
    await expectInvalid(patch(undefined));
  });
});

describe("deterministic order and pagination (real SQL)", () => {
  it("lists routines in creation order with the shared page envelope", async () => {
    const uid = await newUser();
    const a = await createRoutine(uid, "C primeira");
    const b = await createRoutine(uid, "A segunda");
    const c = await createRoutine(uid, "B terceira");
    await updateRoutine(uid, a.id, { name: "Z primeira" });

    const first = await listRoutines(uid, 0, 2);
    expect(first).toEqual({
      content: [expect.objectContaining({ id: a.id, name: "Z primeira" }), expect.objectContaining({ id: b.id })],
      totalElements: 3,
      totalPages: 2,
      size: 2,
      number: 0,
      numberOfElements: 2,
      first: true,
      last: false,
      empty: false,
    });
    const second = await listRoutines(uid, 1, 2);
    expect(second).toMatchObject({ number: 1, numberOfElements: 1, first: false, last: true, empty: false });
    expect(second.content.map((r) => r.id)).toEqual([c.id]);
  });

  it("clamps page and size like the other paginated RPCs", async () => {
    const uid = await newUser();
    await createRoutine(uid, "Única");
    await expect(listRoutines(uid, -3, 500)).resolves.toMatchObject({ number: 0, size: 100, totalElements: 1 });
    await expect(listRoutines(uid, null, null)).resolves.toMatchObject({ number: 0, size: 20 });
    await expect(listRoutines(uid, 0, 0)).resolves.toMatchObject({ size: 1 });
    const empty = await listRoutines(await newUser());
    expect(empty).toMatchObject({ content: [], totalElements: 0, empty: true });
  });

  it("lists exercises in creation order regardless of edits and mode changes", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Ordem");
    const other = await createRoutine(uid, "Outra");
    const a = await createExercise(uid, routine.id, reps("Primeiro"));
    await createExercise(uid, other.id, reps("Em outra rotina"));
    const b = await createExercise(uid, routine.id, timed("Segundo"));
    const c = await createExercise(uid, routine.id, reps("Terceiro"));
    await updateExercise(uid, routine.id, a.id, { mode: "DURATION", durationSeconds: 20, name: "Primeiro editado" });

    const page = await listExercises(uid, routine.id, 0, 20);
    expect(page.content.map((e) => e.id)).toEqual([a.id, b.id, c.id]);
    expect(page.content[0]).toMatchObject({ name: "Primeiro editado", mode: "DURATION" });
    expect(page).toMatchObject({ totalElements: 3, numberOfElements: 3, first: true, last: true });

    const paged = await listExercises(uid, routine.id, 1, 2);
    expect(paged.content.map((e) => e.id)).toEqual([c.id]);
    expect(paged).toMatchObject({ totalElements: 3, totalPages: 2, number: 1 });
  });
});

describe("isolation between enabled accounts (real SQL)", () => {
  let ownerRoutine: Routine;
  let ownerExercise: Exercise;
  let peerRoutine: Routine;
  beforeEach(async () => {
    ownerRoutine = await createRoutine(owner, "Rotina do dono", [1]);
    ownerExercise = await createExercise(owner, ownerRoutine.id, reps("Do dono"));
    peerRoutine = await createRoutine(peer, "Rotina do par");
  });

  it("lists only the caller's routines", async () => {
    const page = await listRoutines(peer, 0, 100);
    expect(page.content.every((r) => r.id !== ownerRoutine.id)).toBe(true);
    expect(page.totalElements).toBe(await rowCount("training_routine", "user_id = $1", [peer]));
  });

  it("does not read, change or delete another account's routine", async () => {
    await expectDomainError(getRoutine(peer, ownerRoutine.id), "TRAINING_ROUTINE_NOT_FOUND");
    await expectDomainError(updateRoutine(peer, ownerRoutine.id, { name: "Invadida" }), "TRAINING_ROUTINE_NOT_FOUND");
    await expectDomainError(deleteRoutine(peer, ownerRoutine.id), "TRAINING_ROUTINE_NOT_FOUND");
    await expect(getRoutine(owner, ownerRoutine.id)).resolves.toEqual({ ...ownerRoutine, exerciseCount: 1 });
  });

  it("does not attach, list or touch exercises through another account's routine", async () => {
    await expectDomainError(createExercise(peer, ownerRoutine.id, reps("Intruso")), "TRAINING_ROUTINE_NOT_FOUND");
    await expectDomainError(listExercises(peer, ownerRoutine.id), "TRAINING_ROUTINE_NOT_FOUND");
    await expectDomainError(getExercise(peer, ownerRoutine.id, ownerExercise.id), "TRAINING_ROUTINE_NOT_FOUND");
    await expectDomainError(
      updateExercise(peer, ownerRoutine.id, ownerExercise.id, { name: "Invadido" }),
      "TRAINING_ROUTINE_NOT_FOUND",
    );
    await expectDomainError(deleteExercise(peer, ownerRoutine.id, ownerExercise.id), "TRAINING_ROUTINE_NOT_FOUND");
    expect(await rowCount("training_exercise", "routine_id = $1", [ownerRoutine.id])).toBe(1);
  });

  it("does not reach another account's exercise through the caller's own routine", async () => {
    await expectDomainError(getExercise(peer, peerRoutine.id, ownerExercise.id), "TRAINING_EXERCISE_NOT_FOUND");
    await expectDomainError(
      updateExercise(peer, peerRoutine.id, ownerExercise.id, { name: "Invadido" }),
      "TRAINING_EXERCISE_NOT_FOUND",
    );
    await expectDomainError(deleteExercise(peer, peerRoutine.id, ownerExercise.id), "TRAINING_EXERCISE_NOT_FOUND");
    await expect(getExercise(owner, ownerRoutine.id, ownerExercise.id)).resolves.toEqual(ownerExercise);
  });

  it("validates the routine/exercise link within the same account", async () => {
    const otherRoutine = await createRoutine(owner, "Outra do dono");
    await expectDomainError(getExercise(owner, otherRoutine.id, ownerExercise.id), "TRAINING_EXERCISE_NOT_FOUND");
    await expectDomainError(
      updateExercise(owner, otherRoutine.id, ownerExercise.id, { name: "Errado" }),
      "TRAINING_EXERCISE_NOT_FOUND",
    );
    await expectDomainError(deleteExercise(owner, otherRoutine.id, ownerExercise.id), "TRAINING_EXERCISE_NOT_FOUND");
    await expect(getExercise(owner, ownerRoutine.id, ownerExercise.id)).resolves.toEqual(ownerExercise);
  });

  it("enforces the owner-coherent link in the schema itself (composite foreign key)", async () => {
    await expect(
      sql().query(
        `insert into public.training_exercise (user_id, routine_id, name, sets, mode, repetitions)
         values ($1, $2, 'Cruzado', 3, 'REPETITIONS', 10)`,
        [peer, ownerRoutine.id],
      ),
    ).rejects.toThrow(/training_exercise_routine_fk/);
  });
});

describe("health enablement gate (real SQL)", () => {
  let ownerRoutine: Routine;
  let ownerExercise: Exercise;
  beforeEach(async () => {
    ownerRoutine = await createRoutine(owner, "Protegida");
    ownerExercise = await createExercise(owner, ownerRoutine.id, reps());
  });

  const everyCall = (uid: string | null, options?: CallOptions): [string, () => Promise<unknown>][] => [
    ["routine_create", () => createRoutine(uid, "x", null, options)],
    ["routine_list", () => call(uid, "select public.api_training_routine_list(0, 20) as result", [], options)],
    ["routine_get", () => call(uid, "select public.api_training_routine_get($1) as result", [ownerRoutine.id], options)],
    [
      "routine_update",
      () => call(uid, "select public.api_training_routine_update($1, '{}'::jsonb) as result", [ownerRoutine.id], options),
    ],
    ["routine_delete", () => call(uid, "select public.api_training_routine_delete($1) as result", [ownerRoutine.id], options)],
    ["exercise_create", () => createExercise(uid, ownerRoutine.id, reps(), options)],
    [
      "exercise_list",
      () => call(uid, "select public.api_training_exercise_list($1, 0, 20) as result", [ownerRoutine.id], options),
    ],
    [
      "exercise_get",
      () => call(uid, "select public.api_training_exercise_get($1, $2) as result", [ownerRoutine.id, ownerExercise.id], options),
    ],
    [
      "exercise_update",
      () =>
        call(
          uid,
          "select public.api_training_exercise_update($1, $2, '{}'::jsonb) as result",
          [ownerRoutine.id, ownerExercise.id],
          options,
        ),
    ],
    [
      "exercise_delete",
      () =>
        call(uid, "select public.api_training_exercise_delete($1, $2) as result", [ownerRoutine.id, ownerExercise.id], options),
    ],
  ];

  it("denies every RPC to an authenticated account that is not enabled, even with valid ids", async () => {
    for (const [name, run] of everyCall(blocked)) {
      await expect(run(), name).rejects.toMatchObject({ code: "P0001", message: "HEALTH_ACCESS_DENIED" });
    }
    expect(await rowCount("training_routine", "user_id = $1", [blocked])).toBe(0);
    await expect(getExercise(owner, ownerRoutine.id, ownerExercise.id)).resolves.toEqual(ownerExercise);
  });

  it("denies every RPC to the anon role", async () => {
    for (const [name, run] of everyCall(null)) {
      await expect(run(), name).rejects.toThrow(/permission denied/);
    }
  });

  it("rejects every RPC for the authenticated role without a user", async () => {
    for (const [name, run] of everyCall(null, { role: "authenticated" })) {
      await expect(run(), name).rejects.toMatchObject({ code: "P0001", message: "UNAUTHENTICATED" });
    }
  });

  it("stops serving a revoked account without deleting its catalog", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Revogada");
    await createExercise(uid, routine.id, reps());
    await sql().query("delete from app_private.health_access where user_id = $1", [uid]);

    await expectDomainError(getRoutine(uid, routine.id), "HEALTH_ACCESS_DENIED");
    await expectDomainError(listRoutines(uid), "HEALTH_ACCESS_DENIED");
    expect(await rowCount("training_exercise", "routine_id = $1", [routine.id])).toBe(1);

    await enable(uid);
    await expect(getRoutine(uid, routine.id)).resolves.toMatchObject({ name: "Revogada", exerciseCount: 1 });
  });
});

describe("grants, RLS and direct access (real SQL)", () => {
  it("grants every training RPC only to authenticated, as SECURITY DEFINER with an empty search_path", async () => {
    for (const signature of RPCS) {
      const res = await sql().query<{ auth: boolean; anon: boolean; pub: boolean; prosecdef: boolean; proconfig: string[] | null }>(
        `select has_function_privilege('authenticated', $1::regprocedure, 'execute') as auth,
                has_function_privilege('anon', $1::regprocedure, 'execute') as anon,
                has_function_privilege('public', $1::regprocedure, 'execute') as pub,
                p.prosecdef, p.proconfig
         from pg_proc p where p.oid = $1::regprocedure`,
        [signature],
      );
      expect(res.rows[0], signature).toMatchObject({ auth: true, anon: false, pub: false, prosecdef: true });
      expect(res.rows[0]!.proconfig ?? [], signature).toContain('search_path=""');
    }
  });

  it("keeps the private training helpers pinned and non-executable by clients", async () => {
    const res = await sql().query<{ proname: string; proconfig: string[] | null; auth: boolean; anon: boolean }>(
      `select p.proname, p.proconfig,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app_private' and p.proname like '%training%'`,
    );
    expect(res.rows.length).toBeGreaterThan(0);
    for (const fn of res.rows) {
      expect(fn.proconfig ?? [], fn.proname).toContain('search_path=""');
      expect(fn.auth, fn.proname).toBe(false);
      expect(fn.anon, fn.proname).toBe(false);
    }
  });

  it("closes both tables and their sequences to every client role, with RLS and owner policies", async () => {
    for (const table of ["training_routine", "training_exercise"]) {
      const res = await sql().query<{ role: string; sel: boolean; ins: boolean; upd: boolean; del: boolean; seq: boolean }>(
        `select r as role,
                has_table_privilege(r, $1::regclass, 'select') as sel,
                has_table_privilege(r, $1::regclass, 'insert') as ins,
                has_table_privilege(r, $1::regclass, 'update') as upd,
                has_table_privilege(r, $1::regclass, 'delete') as del,
                has_sequence_privilege(r, pg_get_serial_sequence($2::text, 'id'), 'usage,select,update') as seq
         from unnest(array['anon', 'authenticated', 'public']) as r`,
        [`public.${table}`, `public.${table}`],
      );
      expect(res.rows).toHaveLength(3);
      for (const row of res.rows) {
        expect(row, `${table}/${row.role}`).toMatchObject({ sel: false, ins: false, upd: false, del: false, seq: false });
      }
      const rls = await sql().query<{ relrowsecurity: boolean }>(
        "select relrowsecurity from pg_class where oid = $1::regclass",
        [`public.${table}`],
      );
      expect(rls.rows, table).toEqual([{ relrowsecurity: true }]);
      const policies = await sql().query<{ policyname: string; roles: string[]; qual: string | null }>(
        "select policyname, roles, coalesce(qual, with_check) as qual from pg_policies where schemaname = 'public' and tablename = $1 order by policyname",
        [table],
      );
      expect(policies.rows.map((p) => p.policyname), table).toEqual(
        ["delete", "insert", "select", "update"].map((op) => `${table}_owner_${op}`),
      );
      for (const policy of policies.rows) {
        expect(policy.roles, policy.policyname).toEqual(["authenticated"]);
        expect(policy.qual, policy.policyname).toMatch(/auth\.uid\(\)/);
      }
    }
  });

  it.each([
    ["select", "select * from public.training_routine"],
    ["insert", "insert into public.training_routine (name) values ('direta')"],
    ["update", "update public.training_routine set name = 'direta'"],
    ["delete", "delete from public.training_routine"],
    ["select", "select * from public.training_exercise"],
    ["insert", "insert into public.training_exercise (routine_id, name, sets, mode, repetitions) values (1, 'x', 1, 'REPETITIONS', 1)"],
    ["update", "update public.training_exercise set name = 'direta'"],
    ["delete", "delete from public.training_exercise"],
  ])("denies direct %s for enabled, blocked and anon callers: %s", async (_op, statement) => {
    for (const uid of [owner, blocked, null]) {
      await expect(asUser(sql(), uid, (tx) => tx.query(statement)), String(uid)).rejects.toThrow(/permission denied/);
    }
  });
});

describe("schema constraints as defense in depth (direct database session)", () => {
  let routineId: number;
  beforeEach(async () => {
    routineId = (await createRoutine(owner, "Constraints")).id;
  });

  const insertExercise = (columns: string, values: string) =>
    sql().query(
      `insert into public.training_exercise (user_id, routine_id, ${columns}) values ($1, $2, ${values})`,
      [owner, routineId],
    );

  it.each([
    ["both targets", "name, sets, mode, repetitions, duration_seconds", "'x', 1, 'REPETITIONS', 1, 1"],
    ["no target", "name, sets, mode", "'x', 1, 'DURATION'"],
    ["a mode mismatch", "name, sets, mode, repetitions", "'x', 1, 'DURATION', 5"],
    ["an unknown mode", "name, sets, mode, repetitions", "'x', 1, 'OTHER', 5"],
    ["zero sets", "name, sets, mode, repetitions", "'x', 0, 'REPETITIONS', 5"],
    ["1001 repetitions", "name, sets, mode, repetitions", "'x', 1, 'REPETITIONS', 1001"],
    ["86401 seconds", "name, sets, mode, duration_seconds", "'x', 1, 'DURATION', 86401"],
    ["a blank name", "name, sets, mode, repetitions", "'  ', 1, 'REPETITIONS', 5"],
    ["blank notes", "name, sets, mode, repetitions, notes", "'x', 1, 'REPETITIONS', 5, '  '"],
    ["2001-character notes", "name, sets, mode, repetitions, notes", "'x', 1, 'REPETITIONS', 5, repeat('n', 2001)"],
  ])("rejects an exercise with %s", async (_label, columns, values) => {
    await expect(insertExercise(columns, values)).rejects.toMatchObject({ code: "23514" });
  });

  it.each([
    ["unsorted days", "'{3,1}'"],
    ["duplicated days", "'{1,1}'"],
    ["day zero", "'{0}'"],
    ["day eight", "'{8}'"],
    ["a null day", "'{1,NULL}'"],
  ])("rejects a routine with %s", async (_label, weekdays) => {
    await expect(
      sql().query(`insert into public.training_routine (user_id, name, weekdays) values ($1, 'x', ${weekdays})`, [owner]),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects a blank routine name", async () => {
    await expect(
      sql().query("insert into public.training_routine (user_id, name) values ($1, '   ')", [owner]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("cascade and transactional atomicity (real SQL)", () => {
  it("deletes a routine together with all of its exercises and nothing else", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Apagar");
    const keep = await createRoutine(uid, "Manter");
    await createExercise(uid, routine.id, reps("1"));
    await createExercise(uid, routine.id, timed("2"));
    const kept = await createExercise(uid, keep.id, reps("3"));

    await deleteRoutine(uid, routine.id);
    expect(await rowCount("training_routine", "id = $1", [routine.id])).toBe(0);
    expect(await rowCount("training_exercise", "routine_id = $1", [routine.id])).toBe(0);
    await expect(getExercise(uid, keep.id, kept.id)).resolves.toEqual(kept);
    await expect(getRoutine(uid, keep.id)).resolves.toMatchObject({ exerciseCount: 1 });
  });

  it("rolls back a routine deletion and its cascade when the surrounding transaction fails", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Atômica");
    await createExercise(uid, routine.id, reps("1"));
    await createExercise(uid, routine.id, reps("2"));

    await expect(
      asUser(sql(), uid, async (tx) => {
        await tx.query("select public.api_training_routine_delete($1)", [routine.id]);
        const inside = await tx.query<{ n: number }>(
          "select (public.api_training_routine_list(0, 100) -> 'totalElements')::int as n",
        );
        expect(inside.rows[0]!.n).toBe(0);
        await tx.query("select public.api_training_exercise_create($1, 'Falha', 0, 'REPETITIONS', 1, null, null)", [routine.id]);
      }),
    ).rejects.toMatchObject({ message: "VALIDATION_ERROR" });

    await expect(getRoutine(uid, routine.id)).resolves.toMatchObject({ name: "Atômica", exerciseCount: 2 });
    expect(await rowCount("training_exercise", "routine_id = $1", [routine.id])).toBe(2);
  });

  it("does not keep earlier writes of a transaction that later fails", async () => {
    const uid = await newUser();
    await expect(
      asUser(sql(), uid, async (tx) => {
        const created = await tx.query<{ id: number }>(
          "select (public.api_training_routine_create('Temporária', null) ->> 'id')::bigint as id",
        );
        await tx.query("select public.api_training_exercise_create($1, 'Ok', 3, 'REPETITIONS', 10, null, null)", [
          created.rows[0]!.id,
        ]);
        await tx.query("select public.api_training_routine_update($1, '{\"name\": null}'::jsonb)", [created.rows[0]!.id]);
      }),
    ).rejects.toMatchObject({ message: "VALIDATION_ERROR" });
    expect(await rowCount("training_routine", "user_id = $1", [uid])).toBe(0);
    expect(await rowCount("training_exercise", "user_id = $1", [uid])).toBe(0);
  });

  it("removes the catalog when the auth user is deleted", async () => {
    const uid = await newUser();
    const routine = await createRoutine(uid, "Usuário removido");
    await createExercise(uid, routine.id, reps());
    await sql().query("delete from auth.users where id = $1", [uid]);
    expect(await rowCount("training_routine", "user_id = $1", [uid])).toBe(0);
    expect(await rowCount("training_exercise", "user_id = $1", [uid])).toBe(0);
  });
});
