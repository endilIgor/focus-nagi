import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, type TestClient } from "./support/harness";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterEach(() => h.setNow(null));

const at = (iso: string) => h.setNow(iso);

describe("focus session lifecycle", () => {
  it("starts, reports current, pauses, resumes and finishes with server-computed focus time", async () => {
    const user = await h.newUser();
    expect((await user.get("/api/focus-sessions/current")).status).toBe(204);

    at("2026-03-10T10:00:00Z");
    const started = await user.post("/api/focus-sessions", {
      plannedFocusMinutes: 25,
      plannedBreakMinutes: 5,
      notes: "deep work",
    });
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({
      status: "RUNNING",
      startedAt: "2026-03-10T10:00:00.000Z",
      endedAt: null,
      plannedFocusMinutes: 25,
      plannedBreakMinutes: 5,
      pausedSecondsAccum: 0,
      lastPausedAt: null,
      actualFocusSeconds: null,
      taskId: null,
      projectId: null,
      notes: "deep work",
    });
    const id = started.body.id;

    const current = await user.get("/api/focus-sessions/current");
    expect(current.status).toBe(200);
    expect(current.body.id).toBe(id);

    at("2026-03-10T10:10:00Z");
    const paused = await user.post(`/api/focus-sessions/${id}/pause`);
    expect(paused.body).toMatchObject({ status: "PAUSED", lastPausedAt: "2026-03-10T10:10:00.000Z" });

    const pauseAgain = await user.post(`/api/focus-sessions/${id}/pause`);
    expect(pauseAgain.status).toBe(409);
    expect(pauseAgain.body).toMatchObject({
      code: "INVALID_FOCUS_SESSION_STATE",
      message: "Illegal focus session state transition.",
    });
    const finishPaused = await user.post(`/api/focus-sessions/${id}/finish`);
    expect(finishPaused.status).toBe(409);

    at("2026-03-10T10:15:30Z");
    const resumed = await user.post(`/api/focus-sessions/${id}/resume`);
    expect(resumed.body).toMatchObject({ status: "RUNNING", pausedSecondsAccum: 330, lastPausedAt: null });

    at("2026-03-10T10:30:00Z");
    const finished = await user.post(`/api/focus-sessions/${id}/finish`);
    expect(finished.body).toMatchObject({
      status: "COMPLETED",
      endedAt: "2026-03-10T10:30:00.000Z",
      actualFocusSeconds: 1800 - 330,
    });

    expect((await user.get("/api/focus-sessions/current")).status).toBe(204);
    expect((await user.post(`/api/focus-sessions/${id}/cancel`)).status).toBe(409);
    expect((await user.post(`/api/focus-sessions/${id}/resume`)).status).toBe(409);
  });

  it("allows only one active session per user and frees the slot after cancel", async () => {
    const user = await h.newUser();
    const first = await user.post("/api/focus-sessions", { plannedFocusMinutes: 25 });
    expect(first.status).toBe(201);
    const second = await user.post("/api/focus-sessions", { plannedFocusMinutes: 25 });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("FOCUS_SESSION_ALREADY_RUNNING");

    await user.post(`/api/focus-sessions/${first.body.id}/pause`);
    expect((await user.post("/api/focus-sessions", { plannedFocusMinutes: 25 })).status).toBe(409);

    const cancelled = await user.post(`/api/focus-sessions/${first.body.id}/cancel`);
    expect(cancelled.body.status).toBe("CANCELLED");
    expect(cancelled.body.endedAt).not.toBeNull();
    expect((await user.post("/api/focus-sessions", { plannedFocusMinutes: 25 })).status).toBe(201);
  });

  it("lets different users run sessions at the same time", async () => {
    const a = await h.newUser();
    const b = await h.newUser();
    expect((await a.post("/api/focus-sessions", { plannedFocusMinutes: 10 })).status).toBe(201);
    expect((await b.post("/api/focus-sessions", { plannedFocusMinutes: 10 })).status).toBe(201);
  });

  it("validates planned minutes", async () => {
    const user = await h.newUser();
    const missing = await user.post("/api/focus-sessions", {});
    expect(missing.status).toBe(400);
    expect(missing.body.message).toContain("plannedFocusMinutes is required");
    const big = await user.post("/api/focus-sessions", { plannedFocusMinutes: 1441, plannedBreakMinutes: -1 });
    expect(big.body.message).toContain("plannedFocusMinutes must be at most 1440");
    expect(big.body.message).toContain("plannedBreakMinutes must be at least 0");
  });
});

describe("focus session task/project resolution", () => {
  let user: TestClient;
  beforeAll(async () => {
    user = await h.newUser();
  });

  it("inherits the project of the linked task", async () => {
    const project = (await user.post("/api/projects", { title: "P" })).body;
    const task = (await user.post("/api/tasks", { title: "T", projectId: project.id })).body;
    const res = await user.post("/api/focus-sessions", { plannedFocusMinutes: 5, taskId: task.id });
    expect(res.body).toMatchObject({ taskId: task.id, projectId: project.id });
    await user.post(`/api/focus-sessions/${res.body.id}/cancel`);

    const other = (await user.post("/api/projects", { title: "Other" })).body;
    const mismatch = await user.post("/api/focus-sessions", {
      plannedFocusMinutes: 5,
      taskId: task.id,
      projectId: other.id,
    });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.code).toBe("FOCUS_SESSION_PROJECT_MISMATCH");
  });

  it("uses the given project for tasks without a project and validates references", async () => {
    const project = (await user.post("/api/projects", { title: "P2" })).body;
    const loose = (await user.post("/api/tasks", { title: "loose" })).body;
    const res = await user.post("/api/focus-sessions", {
      plannedFocusMinutes: 5,
      taskId: loose.id,
      projectId: project.id,
    });
    expect(res.body).toMatchObject({ taskId: loose.id, projectId: project.id });
    await user.post(`/api/focus-sessions/${res.body.id}/cancel`);

    expect((await user.post("/api/focus-sessions", { plannedFocusMinutes: 5, taskId: 999999 })).body.code).toBe(
      "TASK_NOT_FOUND",
    );
    expect((await user.post("/api/focus-sessions", { plannedFocusMinutes: 5, projectId: 999999 })).body.code).toBe(
      "PROJECT_NOT_FOUND",
    );
    expect((await user.post("/api/focus-sessions/999999/pause")).body.code).toBe("FOCUS_SESSION_NOT_FOUND");
  });
});

describe("focus session history", () => {
  it("filters by status, project, task and local date range, newest first", async () => {
    const user = await h.newUser();
    const project = (await user.post("/api/projects", { title: "P" })).body;
    const run = async (iso: string, body: Record<string, unknown>, finish: boolean) => {
      at(iso);
      const s = (await user.post("/api/focus-sessions", { plannedFocusMinutes: 25, ...body })).body;
      at(new Date(Date.parse(iso) + 60_000).toISOString());
      await user.post(`/api/focus-sessions/${s.id}/${finish ? "finish" : "cancel"}`);
      return s.id as number;
    };
    const s1 = await run("2026-04-01T09:00:00Z", {}, true);
    const s2 = await run("2026-04-02T09:00:00Z", { projectId: project.id }, true);
    const s3 = await run("2026-04-03T09:00:00Z", {}, false);

    const all = await user.get("/api/focus-sessions");
    expect(all.body.content.map((s: { id: number }) => s.id)).toEqual([s3, s2, s1]);
    expect(all.body.size).toBe(20);

    const completed = await user.get("/api/focus-sessions?status=COMPLETED");
    expect(completed.body.content.map((s: { id: number }) => s.id)).toEqual([s2, s1]);

    const byProject = await user.get(`/api/focus-sessions?projectId=${project.id}`);
    expect(byProject.body.content.map((s: { id: number }) => s.id)).toEqual([s2]);

    const range = await user.get("/api/focus-sessions?from=2026-04-02&to=2026-04-02");
    expect(range.body.content.map((s: { id: number }) => s.id)).toEqual([s2]);

    const paged = await user.get("/api/focus-sessions?size=1&page=1");
    expect(paged.body).toMatchObject({ totalElements: 3, totalPages: 3, number: 1, first: false, last: false });

    expect((await user.get("/api/focus-sessions?from=2026-13-01")).body.code).toBe("MALFORMED_REQUEST");
  });

  it("applies APP_TIME_ZONE to history date boundaries", async () => {
    const zoned = await createHarness({ APP_TIME_ZONE: "America/Sao_Paulo" });
    const user = await zoned.newUser();
    // 2026-04-02T01:30Z is still April 1st in São Paulo (UTC-3).
    zoned.setNow("2026-04-02T01:30:00Z");
    const s = (await user.post("/api/focus-sessions", { plannedFocusMinutes: 25 })).body;
    const april1 = await user.get("/api/focus-sessions?from=2026-04-01&to=2026-04-01");
    expect(april1.body.content.map((x: { id: number }) => x.id)).toEqual([s.id]);
    const april2 = await user.get("/api/focus-sessions?from=2026-04-02&to=2026-04-02");
    expect(april2.body.totalElements).toBe(0);
  });

  it("isolates sessions per user", async () => {
    const alice = await h.newUser();
    const bob = await h.newUser();
    const s = (await alice.post("/api/focus-sessions", { plannedFocusMinutes: 25 })).body;
    expect((await bob.post(`/api/focus-sessions/${s.id}/cancel`)).status).toBe(404);
    expect((await bob.get("/api/focus-sessions/current")).status).toBe(204);
    expect((await bob.get("/api/focus-sessions")).body.totalElements).toBe(0);
    expect((await alice.get("/api/focus-sessions/current")).body.id).toBe(s.id);
  });
});
