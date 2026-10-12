import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tokens = vi.hoisted(() => ({
  getAccessToken: vi.fn<() => Promise<string | null>>(),
  refreshAccessToken: vi.fn<() => Promise<string | null>>(),
}));
vi.mock("./supabase", () => tokens);

import { ApiRequestError, setUnauthorizedHandler } from "./client";
import { trainingApi } from "./training";
import type { Page, TrainingExerciseResponse, TrainingRoutineResponse } from "./types";

type Reply = { status: number; body?: unknown };

function stubFetch(...replies: Reply[]) {
  const queue = [...replies];
  const fetchMock = vi.fn((_url: string, _init: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected fetch call");
    return Promise.resolve({
      status: next.status,
      ok: next.status >= 200 && next.status < 300,
      text: () => Promise.resolve(next.body === undefined ? "" : JSON.stringify(next.body)),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function call(fetchMock: ReturnType<typeof stubFetch>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index] as unknown as [string, RequestInit];
  return { url, init, headers: (init.headers ?? {}) as Record<string, string> };
}

function page<T>(content: T[], number: number, totalElements: number, size: number): Page<T> {
  const totalPages = Math.ceil(totalElements / size);
  return {
    content,
    totalElements,
    totalPages,
    size,
    number,
    numberOfElements: content.length,
    first: number === 0,
    last: number + 1 >= totalPages,
    empty: content.length === 0,
  };
}

function routine(id: number, overrides: Partial<TrainingRoutineResponse> = {}): TrainingRoutineResponse {
  return {
    id,
    name: `Rotina ${id}`,
    weekdays: [],
    exerciseCount: 0,
    createdAt: "2026-10-12T10:00:00Z",
    updatedAt: "2026-10-12T10:00:00Z",
    ...overrides,
  };
}

const repsExercise: TrainingExerciseResponse = {
  id: 9,
  routineId: 4,
  name: "Agachamento",
  sets: 4,
  mode: "REPETITIONS",
  repetitions: 12,
  durationSeconds: null,
  notes: null,
  createdAt: "2026-10-12T10:00:00Z",
  updatedAt: "2026-10-12T10:00:00Z",
};

const durationExercise: TrainingExerciseResponse = {
  id: 10,
  routineId: 4,
  name: "Prancha",
  sets: 3,
  mode: "DURATION",
  repetitions: null,
  durationSeconds: 60,
  notes: "Manter a lombar neutra",
  createdAt: "2026-10-12T10:01:00Z",
  updatedAt: "2026-10-12T10:01:00Z",
};

const errorBody = (code: string, message: string) => ({ code, message, timestamp: "2026-10-12T10:00:00Z" });

beforeEach(() => {
  tokens.getAccessToken.mockResolvedValue("access-1");
  tokens.refreshAccessToken.mockResolvedValue("access-2");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe("trainingApi routines", () => {
  it("lists a routine page with the Worker default size and the Bearer token", async () => {
    const body = page([routine(1, { weekdays: [1, 3, 5], exerciseCount: 2 }), routine(2)], 0, 2, 20);
    const fetchMock = stubFetch({ status: 200, body });

    await expect(trainingApi.listRoutines()).resolves.toEqual(body);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = call(fetchMock);
    expect(url).toBe("/api/training/routines?page=0&size=20");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("omit");
    expect(headers.Authorization).toBe("Bearer access-1");
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("forwards explicit page and size", async () => {
    const fetchMock = stubFetch({ status: 200, body: page([], 3, 0, 50) });

    await expect(trainingApi.listRoutines(3, 50)).resolves.toMatchObject({ number: 3, size: 50 });

    expect(call(fetchMock).url).toBe("/api/training/routines?page=3&size=50");
  });

  it("loads every routine page in order with the maximum page size", async () => {
    const first = Array.from({ length: 100 }, (_, i) => routine(i + 1));
    const fetchMock = stubFetch(
      { status: 200, body: page(first, 0, 101, 100) },
      { status: 200, body: page([routine(101, { weekdays: [7] })], 1, 101, 100) },
    );

    const result = trainingApi.allRoutines();
    await expect(result).resolves.toHaveLength(101);
    const all = await result;


    expect(all.map((r) => r.id)).toEqual(Array.from({ length: 101 }, (_, i) => i + 1));
    expect(all[100].weekdays).toEqual([7]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(call(fetchMock, 0).url).toBe("/api/training/routines?page=0&size=100");
    expect(call(fetchMock, 1).url).toBe("/api/training/routines?page=1&size=100");
  });

  it("rejects the full routine listing when a later page fails instead of returning a partial list", async () => {
    const fetchMock = stubFetch(
      { status: 200, body: page([routine(1)], 0, 101, 100) },
      { status: 500, body: errorBody("INTERNAL_ERROR", "Unexpected error.") },
    );

    const error = await trainingApi.allRoutines().then(
      (value) => ({ resolved: value }),
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gets one routine by id", async () => {
    const body = routine(7, { weekdays: [2, 4] });
    const fetchMock = stubFetch({ status: 200, body });

    await expect(trainingApi.getRoutine(7)).resolves.toEqual(body);

    const { url, init } = call(fetchMock);
    expect(url).toBe("/api/training/routines/7");
    expect(init.method).toBe("GET");
  });

  it("creates a routine with weekdays as JSON", async () => {
    const created = routine(8, { name: "Força", weekdays: [1, 3, 5] });
    const fetchMock = stubFetch({ status: 201, body: created });

    await expect(trainingApi.createRoutine({ name: "Força", weekdays: [1, 3, 5] })).resolves.toEqual(created);

    const { url, init, headers } = call(fetchMock);
    expect(url).toBe("/api/training/routines");
    expect(init.method).toBe("POST");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe("Bearer access-1");
    expect(init.body).toBe('{"name":"Força","weekdays":[1,3,5]}');
  });

  it("creates a routine without days by omitting the optional key", async () => {
    const fetchMock = stubFetch({ status: 201, body: routine(9) });

    await expect(trainingApi.createRoutine({ name: "Mobilidade" })).resolves.toEqual(routine(9));

    expect(call(fetchMock).init.body).toBe('{"name":"Mobilidade"}');
  });

  it("patches a routine sending explicit null and omitting undefined keys", async () => {
    const fetchMock = stubFetch(
      { status: 200, body: routine(7, { name: "Força", weekdays: [] }) },
      { status: 200, body: routine(7, { name: "Força B", weekdays: [] }) },
    );

    await expect(trainingApi.updateRoutine(7, { weekdays: null })).resolves.toMatchObject({ weekdays: [] });
    await expect(trainingApi.updateRoutine(7, { name: "Força B", weekdays: undefined })).resolves.toMatchObject({
      name: "Força B",
    });

    expect(call(fetchMock, 0).url).toBe("/api/training/routines/7");
    expect(call(fetchMock, 0).init.method).toBe("PATCH");
    expect(call(fetchMock, 0).init.body).toBe('{"weekdays":null}');
    expect(call(fetchMock, 1).init.body).toBe('{"name":"Força B"}');
  });

  it("removes a routine and resolves undefined on 204", async () => {
    const fetchMock = stubFetch({ status: 204 });

    await expect(trainingApi.removeRoutine(7)).resolves.toBeUndefined();

    const { url, init } = call(fetchMock);
    expect(url).toBe("/api/training/routines/7");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("propagates the health access denial envelope", async () => {
    stubFetch({ status: 403, body: errorBody("HEALTH_ACCESS_DENIED", "Health access is not enabled for this account.") });

    const error = await trainingApi.listRoutines().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      status: 403,
      code: "HEALTH_ACCESS_DENIED",
      message: "Health access is not enabled for this account.",
    });
  });

  it("retries once with a refreshed token after a 401", async () => {
    const body = routine(7);
    const fetchMock = stubFetch(
      { status: 401, body: errorBody("UNAUTHORIZED", "Authentication required.") },
      { status: 200, body },
    );

    await expect(trainingApi.getRoutine(7)).resolves.toEqual(body);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(call(fetchMock, 0).headers.Authorization).toBe("Bearer access-1");
    expect(call(fetchMock, 1).headers.Authorization).toBe("Bearer access-2");
    expect(call(fetchMock, 1).url).toBe("/api/training/routines/7");
  });
});

describe("trainingApi exercises", () => {
  it("lists exercises nested under the routine id with nullable targets", async () => {
    const body = page([repsExercise, durationExercise], 0, 2, 20);
    const fetchMock = stubFetch({ status: 200, body });

    const pending = trainingApi.listExercises(4);
    await expect(pending).resolves.toEqual(body);
    const result = await pending;

    expect(result.content[0]).toMatchObject({ mode: "REPETITIONS", repetitions: 12, durationSeconds: null, notes: null });
    expect(result.content[1]).toMatchObject({ mode: "DURATION", repetitions: null, durationSeconds: 60 });
    const { url, init, headers } = call(fetchMock);
    expect(url).toBe("/api/training/routines/4/exercises?page=0&size=20");
    expect(init.method).toBe("GET");
    expect(headers.Authorization).toBe("Bearer access-1");
  });

  it("forwards explicit exercise page and size", async () => {
    const fetchMock = stubFetch({ status: 200, body: page([], 1, 0, 10) });

    await expect(trainingApi.listExercises(4, 1, 10)).resolves.toMatchObject({ number: 1, size: 10 });

    expect(call(fetchMock).url).toBe("/api/training/routines/4/exercises?page=1&size=10");
  });

  it("loads every exercise page of one routine", async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({ ...repsExercise, id: i + 1 }));
    const fetchMock = stubFetch(
      { status: 200, body: page(first, 0, 101, 100) },
      { status: 200, body: page([{ ...durationExercise, id: 101 }], 1, 101, 100) },
    );

    const result = trainingApi.allExercises(4);
    await expect(result).resolves.toHaveLength(101);
    const all = await result;

    expect(all[100]).toMatchObject({ id: 101, mode: "DURATION", durationSeconds: 60 });
    expect(call(fetchMock, 0).url).toBe("/api/training/routines/4/exercises?page=0&size=100");
    expect(call(fetchMock, 1).url).toBe("/api/training/routines/4/exercises?page=1&size=100");
  });

  it("rejects the full exercise listing when a later page fails", async () => {
    const fetchMock = stubFetch(
      { status: 200, body: page([repsExercise], 0, 101, 100) },
      { status: 404, body: errorBody("TRAINING_ROUTINE_NOT_FOUND", "Training routine not found.") },
    );

    const error = await trainingApi.allExercises(4).then(
      (value) => ({ resolved: value }),
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 404, code: "TRAINING_ROUTINE_NOT_FOUND" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gets one exercise by routine and exercise id", async () => {
    const fetchMock = stubFetch({ status: 200, body: durationExercise });

    await expect(trainingApi.getExercise(4, 10)).resolves.toEqual(durationExercise);

    expect(call(fetchMock).url).toBe("/api/training/routines/4/exercises/10");
    expect(call(fetchMock).init.method).toBe("GET");
  });

  it("propagates exercise not found", async () => {
    stubFetch({ status: 404, body: errorBody("TRAINING_EXERCISE_NOT_FOUND", "Training exercise not found.") });

    const error = await trainingApi.getExercise(4, 999).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 404, code: "TRAINING_EXERCISE_NOT_FOUND" });
  });

  it("creates repetition and duration exercises with mode-specific payloads", async () => {
    const fetchMock = stubFetch({ status: 201, body: repsExercise }, { status: 201, body: durationExercise });

    await expect(
      trainingApi.createExercise(4, { name: "Agachamento", sets: 4, mode: "REPETITIONS", repetitions: 12 }),
    ).resolves.toEqual(repsExercise);
    await expect(
      trainingApi.createExercise(4, {
        name: "Prancha",
        sets: 3,
        mode: "DURATION",
        durationSeconds: 60,
        notes: null,
      }),
    ).resolves.toEqual(durationExercise);

    expect(call(fetchMock, 0).url).toBe("/api/training/routines/4/exercises");
    expect(call(fetchMock, 0).init.method).toBe("POST");
    expect(call(fetchMock, 0).headers["Content-Type"]).toBe("application/json");
    expect(call(fetchMock, 0).init.body).toBe('{"name":"Agachamento","sets":4,"mode":"REPETITIONS","repetitions":12}');
    expect(call(fetchMock, 1).init.body).toBe(
      '{"name":"Prancha","sets":3,"mode":"DURATION","durationSeconds":60,"notes":null}',
    );
  });

  it("patches an exercise switching mode with explicit null and omitting undefined keys", async () => {
    const switched = { ...repsExercise, mode: "DURATION", repetitions: null, durationSeconds: 45 } as const;
    const fetchMock = stubFetch({ status: 200, body: switched });

    await expect(
      trainingApi.updateExercise(4, 9, { mode: "DURATION", durationSeconds: 45, repetitions: null, notes: undefined }),
    ).resolves.toEqual(switched);

    const { url, init } = call(fetchMock);
    expect(url).toBe("/api/training/routines/4/exercises/9");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe('{"mode":"DURATION","durationSeconds":45,"repetitions":null}');
  });

  it("removes an exercise by routine and exercise id and resolves undefined on 204", async () => {
    const fetchMock = stubFetch({ status: 204 });

    await expect(trainingApi.removeExercise(4, 9)).resolves.toBeUndefined();

    const { url, init } = call(fetchMock);
    expect(url).toBe("/api/training/routines/4/exercises/9");
    expect(init.method).toBe("DELETE");
  });
});
