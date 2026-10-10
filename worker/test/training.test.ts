import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mapDatabaseError } from "../src/db";
import { ApiError } from "../src/errors";
import { MIGRATIONS_DIR, asUser } from "./support/database";
import { createHarness, type Harness, type TestClient, type TestResponse } from "./support/harness";

const MIGRATION = "20261010121000_training_catalog.sql";

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

const ROUTINES = "/api/training/routines";
const NOW = "2026-10-10T12:00:00Z";
const NOW_ISO = "2026-10-10T12:00:00.000Z";
const LATER = "2026-10-11T08:30:00Z";
const LATER_ISO = "2026-10-11T08:30:00.000Z";

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

let h: Harness;
let owner: TestClient;
let peer: TestClient;
let blocked: TestClient;

/** Administrative enablement: a direct database session (task 4 table), never a client role. */
async function enable(client: TestClient): Promise<void> {
  await h.db.query("insert into app_private.health_access (user_id) values ($1)", [client.userId]);
}

async function revoke(client: TestClient): Promise<void> {
  await h.db.query("delete from app_private.health_access where user_id = $1", [client.userId]);
}

async function enabledUser(): Promise<TestClient> {
  const client = await h.newUser();
  await enable(client);
  return client;
}

/** Asserts the task 5 schema before any training request, so a missing migration fails as an assertion. */
async function expectTrainingRpcs(): Promise<void> {
  expect(existsSync(join(MIGRATIONS_DIR, MIGRATION)), `migration ${MIGRATION}`).toBe(true);
  const res = await h.db.query<{ name: string }>(
    "select f.name from jsonb_array_elements_text($1::jsonb) f(name) where to_regprocedure(f.name) is null",
    [JSON.stringify(RPCS)],
  );
  expect(res.rows.map((r) => r.name), "missing training RPCs").toEqual([]);
}

beforeAll(async () => {
  h = await createHarness();
  owner = await h.newUser("owner@example.test");
  peer = await h.newUser("peer@example.test");
  blocked = await h.newUser("blocked@example.test");
  await enable(owner);
  await enable(peer);
});

beforeEach(async () => {
  await expectTrainingRpcs();
});

afterEach(() => h.setNow(null));

async function createRoutine(client: TestClient, body: unknown = { name: "Rotina" }): Promise<Routine> {
  const res = await client.post(ROUTINES, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as Routine;
}

const exercisesOf = (routineId: number) => `${ROUTINES}/${routineId}/exercises`;

async function createExercise(client: TestClient, routineId: number, body: unknown): Promise<Exercise> {
  const res = await client.post(exercisesOf(routineId), body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as Exercise;
}

const pushUps = { name: "Flexão", sets: 3, mode: "REPETITIONS", repetitions: 12 };
const plank = { name: "Prancha", sets: 3, mode: "DURATION", durationSeconds: 60 };

function expectError(res: TestResponse, status: number, code: string): void {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  expect(res.body).toMatchObject({ code, message: expect.any(String), timestamp: expect.any(String) });
}

async function exerciseRows(routineId: number): Promise<number> {
  const res = await h.db.query<{ n: number }>(
    "select count(*)::int as n from public.training_exercise where routine_id = $1",
    [routineId],
  );
  return res.rows[0]!.n;
}

describe("training routines (HTTP + real SQL)", () => {
  it("creates a routine with 201, trimmed name, sorted weekdays and the routine envelope", async () => {
    h.setNow(NOW);
    const res = await owner.post(ROUTINES, { name: "  Calistenia A  ", weekdays: [5, 1, 3] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      name: "Calistenia A",
      weekdays: [1, 3, 5],
      exerciseCount: 0,
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    });
    expect((await owner.get(`${ROUTINES}/${res.body.id}`)).body).toEqual(res.body);
  });

  it("treats omitted or null weekdays as no days", async () => {
    expect((await createRoutine(owner, { name: "Sem dias" })).weekdays).toEqual([]);
    expect((await createRoutine(owner, { name: "Nulo", weekdays: null })).weekdays).toEqual([]);
    expect((await createRoutine(owner, { name: "Vazio", weekdays: [] })).weekdays).toEqual([]);
  });

  it("accepts the boundary values for name and weekdays", async () => {
    const name = "n".repeat(150);
    const routine = await createRoutine(owner, { name, weekdays: [7, 6, 5, 4, 3, 2, 1] });
    expect(routine).toMatchObject({ name, weekdays: [1, 2, 3, 4, 5, 6, 7] });
  });

  it.each([
    ["missing name", {}],
    ["null name", { name: null }],
    ["blank name", { name: "   " }],
    ["name over 150 characters", { name: "x".repeat(151) }],
    ["numeric name", { name: 42 }],
    ["weekday 0", { name: "A", weekdays: [0] }],
    ["weekday 8", { name: "A", weekdays: [8] }],
    ["duplicate weekdays", { name: "A", weekdays: [1, 3, 1] }],
    ["fractional weekday", { name: "A", weekdays: [1.5] }],
    ["string weekday", { name: "A", weekdays: ["1"] }],
    ["null inside weekdays", { name: "A", weekdays: [1, null] }],
    ["weekdays not an array", { name: "A", weekdays: "1,2" }],
  ])("rejects a routine with %s as 400 VALIDATION_ERROR without persisting", async (_label, body) => {
    const client = await enabledUser();
    expectError(await client.post(ROUTINES, body), 400, "VALIDATION_ERROR");
    expect((await client.get(ROUTINES)).body.totalElements).toBe(0);
  });

  it("names the invalid field in the validation message", async () => {
    const res = await owner.post(ROUTINES, { name: "", weekdays: [9] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("name");
    expect(res.body.message).toContain("weekdays");
  });

  it.each([
    ["a JSON array", "[]"],
    ["invalid JSON", "{"],
    ["a JSON string", '"name"'],
  ])("rejects %s as the body with 400 MALFORMED_REQUEST", async (_label, raw) => {
    expectError(await owner.post(ROUTINES, raw), 400, "MALFORMED_REQUEST");
  });

  it("never takes the owner from the payload", async () => {
    const routine = await createRoutine(owner, { name: "Minha", userId: peer.userId, user_id: peer.userId });
    expect((await owner.get(`${ROUTINES}/${routine.id}`)).status).toBe(200);
    expectError(await peer.get(`${ROUTINES}/${routine.id}`), 404, "TRAINING_ROUTINE_NOT_FOUND");
  });

  it("lists routines in creation order inside the paginated envelope", async () => {
    const client = await enabledUser();
    const empty = await client.get(ROUTINES);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({
      content: [],
      totalElements: 0,
      totalPages: 0,
      size: 20,
      number: 0,
      numberOfElements: 0,
      first: true,
      last: true,
      empty: true,
    });

    const a = await createRoutine(client, { name: "B primeiro" });
    const b = await createRoutine(client, { name: "A segundo" });
    const c = await createRoutine(client, { name: "C terceiro" });

    const first = await client.get(`${ROUTINES}?page=0&size=2`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      content: [a, b],
      totalElements: 3,
      totalPages: 2,
      size: 2,
      number: 0,
      numberOfElements: 2,
      first: true,
      last: false,
      empty: false,
    });
    const second = await client.get(`${ROUTINES}?page=1&size=2`);
    expect(second.body).toMatchObject({ content: [c], number: 1, numberOfElements: 1, first: false, last: true });

    const all = await client.get(ROUTINES);
    expect(all.body.content.map((r: Routine) => r.id)).toEqual([a.id, b.id, c.id]);
    expect(all.body.size).toBe(20);
    expect((await client.get(`${ROUTINES}?size=500`)).body.size).toBe(100);
  });

  it("rejects malformed pagination with 400 MALFORMED_REQUEST", async () => {
    expectError(await owner.get(`${ROUTINES}?page=abc`), 400, "MALFORMED_REQUEST");
    expectError(await owner.get(`${ROUTINES}?size=1.5`), 400, "MALFORMED_REQUEST");
  });

  it("PATCH keeps omitted fields, clears weekdays with null and rejects a null name", async () => {
    h.setNow(NOW);
    const routine = await createRoutine(owner, { name: "Push", weekdays: [1, 3] });
    const url = `${ROUTINES}/${routine.id}`;

    h.setNow(LATER);
    const renamed = await owner.patch(url, { name: "  Push day " });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toEqual({ ...routine, name: "Push day", updatedAt: LATER_ISO });

    const days = await owner.patch(url, { weekdays: [7, 2] });
    expect(days.body).toMatchObject({ name: "Push day", weekdays: [2, 7], createdAt: NOW_ISO });

    const cleared = await owner.patch(url, { weekdays: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ name: "Push day", weekdays: [] });

    for (const body of [{ name: null }, { name: " " }, { name: "x".repeat(151) }, { weekdays: [1, 1] }, { weekdays: [0] }]) {
      expectError(await owner.patch(url, body), 400, "VALIDATION_ERROR");
    }
    expect((await owner.get(url)).body).toEqual(cleared.body);
  });

  it("PATCH with {} or only unknown keys succeeds without changing fields", async () => {
    h.setNow(NOW);
    const routine = await createRoutine(owner, { name: "Pull", weekdays: [2] });
    h.setNow(LATER);
    const res = await owner.patch(`${ROUTINES}/${routine.id}`, {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...routine, updatedAt: LATER_ISO });
    const unknown = await owner.patch(`${ROUTINES}/${routine.id}`, { color: "red", userId: peer.userId });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ ...routine, updatedAt: LATER_ISO });
  });

  it("DELETE returns 204 without body and removes the routine with all its exercises", async () => {
    const routine = await createRoutine(owner, { name: "Descartável" });
    await createExercise(owner, routine.id, pushUps);
    await createExercise(owner, routine.id, plank);
    expect((await owner.get(`${ROUTINES}/${routine.id}`)).body.exerciseCount).toBe(2);
    expect(await exerciseRows(routine.id)).toBe(2);

    const res = await owner.delete(`${ROUTINES}/${routine.id}`);
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
    expect(await exerciseRows(routine.id)).toBe(0);
    expectError(await owner.get(`${ROUTINES}/${routine.id}`), 404, "TRAINING_ROUTINE_NOT_FOUND");
    expectError(await owner.get(exercisesOf(routine.id)), 404, "TRAINING_ROUTINE_NOT_FOUND");
    expectError(await owner.delete(`${ROUTINES}/${routine.id}`), 404, "TRAINING_ROUTINE_NOT_FOUND");
  });

  it("answers 404 TRAINING_ROUTINE_NOT_FOUND with its message on every route of an unknown routine", async () => {
    const missing = `${ROUTINES}/999999999`;
    const responses = [
      await owner.get(missing),
      await owner.patch(missing, { name: "x" }),
      await owner.delete(missing),
      await owner.get(`${missing}/exercises`),
      await owner.post(`${missing}/exercises`, pushUps),
      await owner.get(`${missing}/exercises/1`),
      await owner.patch(`${missing}/exercises/1`, { sets: 2 }),
      await owner.delete(`${missing}/exercises/1`),
    ];
    for (const res of responses) {
      expectError(res, 404, "TRAINING_ROUTINE_NOT_FOUND");
      expect(res.body.message).toBe("Training routine not found.");
    }
  });

  it.each([`${ROUTINES}/abc`, `${ROUTINES}/1.5`, `${ROUTINES}/-1`, `${ROUTINES}/1/exercises/abc`, `${ROUTINES}/x/exercises`])(
    "rejects the malformed id in %s with 400 MALFORMED_REQUEST",
    async (path) => {
      expectError(await owner.get(path), 400, "MALFORMED_REQUEST");
    },
  );
});

describe("training exercises (HTTP + real SQL)", () => {
  it("creates a REPETITIONS exercise with 201, trimmed text and a null duration", async () => {
    h.setNow(NOW);
    const routine = await createRoutine(owner, { name: "Rotina A" });
    const res = await owner.post(exercisesOf(routine.id), {
      ...pushUps,
      name: "  Flexão  ",
      notes: "  Mãos na largura dos ombros ",
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      routineId: routine.id,
      name: "Flexão",
      sets: 3,
      mode: "REPETITIONS",
      repetitions: 12,
      durationSeconds: null,
      notes: "Mãos na largura dos ombros",
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    });
    expect((await owner.get(`${exercisesOf(routine.id)}/${res.body.id}`)).body).toEqual(res.body);
    expect((await owner.get(`${ROUTINES}/${routine.id}`)).body.exerciseCount).toBe(1);
  });

  it("creates a DURATION exercise with null repetitions and blank notes stored as null", async () => {
    const routine = await createRoutine(owner);
    const exercise = await createExercise(owner, routine.id, { ...plank, repetitions: null, notes: "   " });
    expect(exercise).toMatchObject({ mode: "DURATION", durationSeconds: 60, repetitions: null, notes: null });
  });

  it("accepts the boundary values of every limit", async () => {
    const routine = await createRoutine(owner);
    const reps = await createExercise(owner, routine.id, {
      name: "n".repeat(150),
      sets: 1000,
      mode: "REPETITIONS",
      repetitions: 1000,
      notes: "o".repeat(2000),
    });
    expect(reps).toMatchObject({ sets: 1000, repetitions: 1000 });
    expect(reps.notes).toHaveLength(2000);
    const minimal = await createExercise(owner, routine.id, { name: "m", sets: 1, mode: "DURATION", durationSeconds: 1 });
    expect(minimal).toMatchObject({ sets: 1, durationSeconds: 1 });
    const longest = await createExercise(owner, routine.id, { ...plank, durationSeconds: 86400 });
    expect(longest.durationSeconds).toBe(86400);
  });

  it.each([
    ["missing name", { sets: 3, mode: "REPETITIONS", repetitions: 10 }],
    ["blank name", { ...pushUps, name: "  " }],
    ["name over 150 characters", { ...pushUps, name: "x".repeat(151) }],
    ["missing sets", { name: "A", mode: "REPETITIONS", repetitions: 10 }],
    ["zero sets", { ...pushUps, sets: 0 }],
    ["1001 sets", { ...pushUps, sets: 1001 }],
    ["fractional sets", { ...pushUps, sets: 2.5 }],
    ["string sets", { ...pushUps, sets: "3" }],
    ["missing mode", { name: "A", sets: 3, repetitions: 10 }],
    ["unknown mode", { ...pushUps, mode: "REPS" }],
    ["REPETITIONS without repetitions", { name: "A", sets: 3, mode: "REPETITIONS" }],
    ["REPETITIONS with null repetitions", { ...pushUps, repetitions: null }],
    ["zero repetitions", { ...pushUps, repetitions: 0 }],
    ["1001 repetitions", { ...pushUps, repetitions: 1001 }],
    ["REPETITIONS with a duration too", { ...pushUps, durationSeconds: 30 }],
    ["DURATION without durationSeconds", { name: "A", sets: 3, mode: "DURATION" }],
    ["zero durationSeconds", { ...plank, durationSeconds: 0 }],
    ["86401 durationSeconds", { ...plank, durationSeconds: 86401 }],
    ["DURATION with repetitions too", { ...plank, repetitions: 10 }],
    ["notes over 2000 characters", { ...pushUps, notes: "x".repeat(2001) }],
    ["numeric notes", { ...pushUps, notes: 5 }],
  ])("rejects an exercise with %s as 400 VALIDATION_ERROR without persisting", async (_label, body) => {
    const routine = await createRoutine(owner);
    expectError(await owner.post(exercisesOf(routine.id), body), 400, "VALIDATION_ERROR");
    expect(await exerciseRows(routine.id)).toBe(0);
  });

  it("lists only the routine's exercises in creation order inside the paginated envelope", async () => {
    const routine = await createRoutine(owner);
    const other = await createRoutine(owner);
    const a = await createExercise(owner, routine.id, { ...pushUps, name: "Z primeiro" });
    await createExercise(owner, other.id, plank);
    const b = await createExercise(owner, routine.id, { ...plank, name: "A segundo" });
    const c = await createExercise(owner, routine.id, { ...pushUps, name: "M terceiro" });

    const first = await owner.get(`${exercisesOf(routine.id)}?size=2`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      content: [a, b],
      totalElements: 3,
      totalPages: 2,
      size: 2,
      number: 0,
      numberOfElements: 2,
      first: true,
      last: false,
      empty: false,
    });
    expect((await owner.get(`${exercisesOf(routine.id)}?page=1&size=2`)).body).toMatchObject({ content: [c], last: true });
    const all = await owner.get(exercisesOf(routine.id));
    expect(all.body.content.map((e: Exercise) => e.id)).toEqual([a.id, b.id, c.id]);
    expect(all.body.size).toBe(20);
    expectError(await owner.get(`${exercisesOf(routine.id)}?page=x`), 400, "MALFORMED_REQUEST");
  });

  it("PATCH keeps omitted fields, clears notes with null and rejects null required fields", async () => {
    h.setNow(NOW);
    const routine = await createRoutine(owner);
    const exercise = await createExercise(owner, routine.id, { ...pushUps, notes: "Devagar" });
    const url = `${exercisesOf(routine.id)}/${exercise.id}`;

    h.setNow(LATER);
    const sets = await owner.patch(url, { sets: 4 });
    expect(sets.status).toBe(200);
    expect(sets.body).toEqual({ ...exercise, sets: 4, updatedAt: LATER_ISO });

    const reps = await owner.patch(url, { repetitions: 15, name: " Flexão fechada " });
    expect(reps.body).toEqual({ ...exercise, sets: 4, repetitions: 15, name: "Flexão fechada", updatedAt: LATER_ISO });

    const noNotes = await owner.patch(url, { notes: null });
    expect(noNotes.status).toBe(200);
    expect(noNotes.body).toEqual({ ...reps.body, notes: null });

    for (const body of [
      { name: null },
      { sets: null },
      { mode: null },
      { repetitions: null },
      { name: "x".repeat(151) },
      { sets: 1001 },
      { sets: 2.5 },
      { sets: "4" },
      { repetitions: 0 },
      { notes: "x".repeat(2001) },
      { mode: "REPS" },
    ]) {
      expectError(await owner.patch(url, body), 400, "VALIDATION_ERROR");
    }
    expect((await owner.get(url)).body).toEqual(noNotes.body);
  });

  it("PATCH switches mode only with the new target and clears the incompatible one", async () => {
    const routine = await createRoutine(owner);
    const exercise = await createExercise(owner, routine.id, pushUps);
    const url = `${exercisesOf(routine.id)}/${exercise.id}`;

    expectError(await owner.patch(url, { mode: "DURATION" }), 400, "VALIDATION_ERROR");
    expectError(await owner.patch(url, { mode: "DURATION", durationSeconds: null }), 400, "VALIDATION_ERROR");
    expectError(await owner.patch(url, { mode: "DURATION", durationSeconds: 45, repetitions: 10 }), 400, "VALIDATION_ERROR");
    expectError(await owner.patch(url, { durationSeconds: 45 }), 400, "VALIDATION_ERROR");
    expect((await owner.get(url)).body).toEqual(exercise);

    const duration = await owner.patch(url, { mode: "DURATION", durationSeconds: 45 });
    expect(duration.status).toBe(200);
    expect(duration.body).toMatchObject({ mode: "DURATION", durationSeconds: 45, repetitions: null, sets: 3, name: "Flexão" });

    const noop = await owner.patch(url, { repetitions: null });
    expect(noop.status).toBe(200);
    expect(noop.body).toMatchObject({ mode: "DURATION", durationSeconds: 45, repetitions: null });
    expectError(await owner.patch(url, { durationSeconds: null }), 400, "VALIDATION_ERROR");
    expectError(await owner.patch(url, { repetitions: 10 }), 400, "VALIDATION_ERROR");
    expectError(await owner.patch(url, { durationSeconds: 86401 }), 400, "VALIDATION_ERROR");

    const back = await owner.patch(url, { mode: "REPETITIONS", repetitions: 8, durationSeconds: null });
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ mode: "REPETITIONS", repetitions: 8, durationSeconds: null });
  });

  it("PATCH never moves an exercise or changes its owner through body fields", async () => {
    const routine = await createRoutine(owner);
    const target = await createRoutine(owner);
    const exercise = await createExercise(owner, routine.id, { ...pushUps, routineId: target.id, userId: peer.userId });
    expect(exercise.routineId).toBe(routine.id);
    const res = await owner.patch(`${exercisesOf(routine.id)}/${exercise.id}`, { routineId: target.id, sets: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ routineId: routine.id, sets: 5 });
    expect((await owner.get(exercisesOf(target.id))).body.totalElements).toBe(0);
  });

  it("DELETE returns 204 and removes only that exercise", async () => {
    const routine = await createRoutine(owner);
    const gone = await createExercise(owner, routine.id, pushUps);
    const kept = await createExercise(owner, routine.id, plank);
    const url = `${exercisesOf(routine.id)}/${gone.id}`;

    const res = await owner.delete(url);
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
    expectError(await owner.get(url), 404, "TRAINING_EXERCISE_NOT_FOUND");
    expectError(await owner.delete(url), 404, "TRAINING_EXERCISE_NOT_FOUND");
    expect((await owner.get(exercisesOf(routine.id))).body.content).toEqual([kept]);
    expect((await owner.get(`${ROUTINES}/${routine.id}`)).body.exerciseCount).toBe(1);
  });

  it("addresses an exercise only through its own routine", async () => {
    const r1 = await createRoutine(owner);
    const r2 = await createRoutine(owner);
    const exercise = await createExercise(owner, r1.id, pushUps);
    const wrong = `${exercisesOf(r2.id)}/${exercise.id}`;

    for (const res of [
      await owner.get(wrong),
      await owner.patch(wrong, { sets: 9 }),
      await owner.delete(wrong),
      await owner.get(`${exercisesOf(r1.id)}/999999999`),
    ]) {
      expectError(res, 404, "TRAINING_EXERCISE_NOT_FOUND");
      expect(res.body.message).toBe("Training exercise not found.");
    }
    expect((await owner.get(`${exercisesOf(r1.id)}/${exercise.id}`)).body).toEqual(exercise);
  });
});

describe("training isolation between enabled accounts", () => {
  it("never exposes or changes another account's routines and exercises", async () => {
    const routine = await createRoutine(owner, { name: "Privada", weekdays: [1] });
    const exercise = await createExercise(owner, routine.id, pushUps);
    const routineUrl = `${ROUTINES}/${routine.id}`;
    const exerciseUrl = `${exercisesOf(routine.id)}/${exercise.id}`;

    for (const res of [
      await peer.get(routineUrl),
      await peer.patch(routineUrl, { name: "Roubada" }),
      await peer.delete(routineUrl),
      await peer.get(exercisesOf(routine.id)),
      await peer.post(exercisesOf(routine.id), plank),
      await peer.get(exerciseUrl),
      await peer.patch(exerciseUrl, { sets: 9 }),
      await peer.delete(exerciseUrl),
    ]) {
      expectError(res, 404, "TRAINING_ROUTINE_NOT_FOUND");
    }

    const own = await createRoutine(peer, { name: "Do peer" });
    const crossed = `${exercisesOf(own.id)}/${exercise.id}`;
    expectError(await peer.get(crossed), 404, "TRAINING_EXERCISE_NOT_FOUND");
    expectError(await peer.patch(crossed, { sets: 9 }), 404, "TRAINING_EXERCISE_NOT_FOUND");
    expectError(await peer.delete(crossed), 404, "TRAINING_EXERCISE_NOT_FOUND");

    const peerList = (await peer.get(ROUTINES)).body.content.map((r: Routine) => r.id);
    expect(peerList).not.toContain(routine.id);
    expect((await owner.get(routineUrl)).body).toEqual({ ...routine, exerciseCount: 1 });
    expect((await owner.get(exercisesOf(routine.id))).body.content).toEqual([exercise]);
  });
});

/** One valid request per training route, addressed at the owner's real records. */
async function everyRoute(): Promise<Array<[string, (client: TestClient) => Promise<TestResponse>]>> {
  const routine = await createRoutine(owner, { name: "Alvo" });
  const exercise = await createExercise(owner, routine.id, pushUps);
  const r = `${ROUTINES}/${routine.id}`;
  const e = `${exercisesOf(routine.id)}/${exercise.id}`;
  return [
    ["POST routines", (c) => c.post(ROUTINES, { name: "Nova" })],
    ["GET routines", (c) => c.get(ROUTINES)],
    ["GET routine", (c) => c.get(r)],
    ["PATCH routine", (c) => c.patch(r, { name: "Outra" })],
    ["DELETE routine", (c) => c.delete(r)],
    ["POST exercises", (c) => c.post(exercisesOf(routine.id), plank)],
    ["GET exercises", (c) => c.get(exercisesOf(routine.id))],
    ["GET exercise", (c) => c.get(e)],
    ["PATCH exercise", (c) => c.patch(e, { sets: 2 })],
    ["DELETE exercise", (c) => c.delete(e)],
  ];
}

function anonymous(): TestClient {
  const send = (method: string, path: string, body?: unknown) =>
    h.request(path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return {
    userId: "",
    token: "",
    get: (path) => send("GET", path),
    post: (path, body) => send("POST", path, body),
    patch: (path, body) => send("PATCH", path, body),
    delete: (path) => send("DELETE", path),
  };
}

describe("training capability", () => {
  it("answers 403 HEALTH_ACCESS_DENIED on all ten routes for an account that is not enabled", async () => {
    const routes = await everyRoute();
    expect(routes).toHaveLength(10);
    for (const [label, send] of routes) {
      const res = await send(blocked);
      expect(res.status, `${label}: ${JSON.stringify(res.body)}`).toBe(403);
      expect(res.body, label).toMatchObject({
        code: "HEALTH_ACCESS_DENIED",
        message: "Health access is not enabled for this account.",
      });
    }
    const rows = await h.db.query<{ n: number }>(
      "select count(*)::int as n from public.training_routine where user_id = $1",
      [blocked.userId],
    );
    expect(rows.rows[0]!.n).toBe(0);
  });

  it("answers 401 UNAUTHENTICATED on all ten routes without a token", async () => {
    const anon = anonymous();
    for (const [label, send] of await everyRoute()) {
      const res = await send(anon);
      expect(res.status, label).toBe(401);
      expect(res.body.code, label).toBe("UNAUTHENTICATED");
    }
  });

  it("closes the API as soon as enablement is revoked and keeps the data for re-enablement", async () => {
    const client = await enabledUser();
    const routine = await createRoutine(client, { name: "Persistente" });
    await revoke(client);
    expectError(await client.get(`${ROUTINES}/${routine.id}`), 403, "HEALTH_ACCESS_DENIED");
    expectError(await client.get(ROUTINES), 403, "HEALTH_ACCESS_DENIED");
    await enable(client);
    expect((await client.get(`${ROUTINES}/${routine.id}`)).body).toEqual(routine);
  });
});

describe("training RPCs called directly (real SQL, regression guards)", () => {
  const directCalls: Array<[string, string, unknown[]]> = [
    ["routine_create", "select public.api_training_routine_create($1, $2::int[])", ["", "{0,0}"]],
    ["routine_list", "select public.api_training_routine_list($1, $2)", [-1, 0]],
    ["routine_get", "select public.api_training_routine_get($1)", [1]],
    ["routine_update", "select public.api_training_routine_update($1, $2::jsonb)", [1, '"not an object"']],
    ["routine_delete", "select public.api_training_routine_delete($1)", [1]],
    [
      "exercise_create",
      "select public.api_training_exercise_create($1, $2, $3, $4, $5, $6, $7)",
      [1, "", 0, "BAD", 0, 0, "x".repeat(2001)],
    ],
    ["exercise_list", "select public.api_training_exercise_list($1, $2, $3)", [1, -1, 0]],
    ["exercise_get", "select public.api_training_exercise_get($1, $2)", [1, 1]],
    ["exercise_update", "select public.api_training_exercise_update($1, $2, $3::jsonb)", [1, 1, '{"bogus": true}']],
    ["exercise_delete", "select public.api_training_exercise_delete($1, $2)", [1, 1]],
  ];

  it.each(directCalls)(
    "%s denies an account that is not enabled before validating its payload",
    async (_name, statement, params) => {
      await expect(asUser(h.db, blocked.userId, (tx) => tx.query(statement, params))).rejects.toThrow(
        /HEALTH_ACCESS_DENIED/,
      );
    },
  );

  it.each(directCalls)("%s is not executable by the anon role", async (_name, statement, params) => {
    await expect(asUser(h.db, null, (tx) => tx.query(statement, params))).rejects.toThrow(/permission denied/);
  });
});

describe("training error mapping", () => {
  it.each([
    ["TRAINING_ROUTINE_NOT_FOUND", "Training routine not found."],
    ["TRAINING_EXERCISE_NOT_FOUND", "Training exercise not found."],
  ])("maps %s to 404 with its default message", (code, message) => {
    const err = mapDatabaseError({ code: "P0001", message: code, details: "" });
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code, message });
  });
});
