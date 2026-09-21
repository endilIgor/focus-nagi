import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, type TestClient } from "./support/harness";
import { completedSession, completedTask } from "./support/scenario";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterEach(() => h.setNow(null));

const goal = (body: Record<string, unknown> = {}) => ({
  title: "Goal",
  type: "FOCUS_MINUTES",
  targetValue: 60,
  period: "DAILY",
  startDate: "2026-01-01",
  ...body,
});

describe("goal CRUD and transitions", () => {
  let user: TestClient;
  beforeAll(async () => {
    user = await h.newUser();
  });

  it("creates goals and validates input", async () => {
    const res = await user.post("/api/goals", goal({ title: " Read ", description: "d" }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Read",
      description: "d",
      type: "FOCUS_MINUTES",
      targetValue: 60,
      period: "DAILY",
      startDate: "2026-01-01",
      endDate: null,
      status: "ACTIVE",
      projectId: null,
    });

    const invalid = await user.post("/api/goals", { title: "x", targetValue: 0 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("VALIDATION_ERROR");
    expect(invalid.body.message).toContain("type is required");
    expect(invalid.body.message).toContain("targetValue must be at least 1");
    expect(invalid.body.message).toContain("period is required");
    expect(invalid.body.message).toContain("startDate is required");

    const dates = await user.post("/api/goals", goal({ startDate: "2026-02-02", endDate: "2026-02-01" }));
    expect(dates.body.code).toBe("GOAL_INVALID_DATES");
    const project = await user.post("/api/goals", goal({ projectId: 999999 }));
    expect(project.status).toBe(404);
    expect(project.body.code).toBe("PROJECT_NOT_FOUND");
  });

  it("updates with the original end-date semantics", async () => {
    const g = (await user.post("/api/goals", goal({ period: "CUSTOM", endDate: "2026-01-31" }))).body;
    const renamed = await user.patch(`/api/goals/${g.id}`, { title: "New", targetValue: 90 });
    expect(renamed.body).toMatchObject({ title: "New", targetValue: 90, endDate: "2026-01-31" });

    const moved = await user.patch(`/api/goals/${g.id}`, { startDate: "2026-01-05" });
    expect(moved.body).toMatchObject({ startDate: "2026-01-05", endDate: null });

    const withEnd = await user.patch(`/api/goals/${g.id}`, { endDate: "2026-02-10" });
    expect(withEnd.body.endDate).toBe("2026-02-10");

    const invalid = await user.patch(`/api/goals/${g.id}`, { endDate: "2026-01-01" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("GOAL_INVALID_DATES");
    expect((await user.patch("/api/goals/999999", { title: "x" })).body.code).toBe("GOAL_NOT_FOUND");
  });

  it("lists, gets and transitions goals", async () => {
    const client = await h.newUser();
    const g = (await client.post("/api/goals", goal({ title: "Listable" }))).body;
    const list = await client.get("/api/goals");
    expect(list.body.size).toBe(50);
    expect(list.body.content.map((x: { title: string }) => x.title)).toContain("Listable");
    expect((await client.get(`/api/goals/${g.id}`)).body.title).toBe("Listable");
    expect((await client.get("/api/goals/999999")).body.code).toBe("GOAL_NOT_FOUND");

    expect((await client.post(`/api/goals/${g.id}/complete`)).body.status).toBe("COMPLETED");
    const again = await client.post(`/api/goals/${g.id}/complete`);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: "INVALID_GOAL_STATE", message: "Only an active goal can be completed." });
    expect((await client.post(`/api/goals/${g.id}/archive`)).body.status).toBe("ARCHIVED");
    expect((await client.post(`/api/goals/${g.id}/archive`)).body.message).toBe("Goal is already archived.");
    expect((await client.post(`/api/goals/${g.id}/restore`)).body.status).toBe("ACTIVE");
    expect((await client.post(`/api/goals/${g.id}/restore`)).body.message).toBe(
      "Only an archived goal can be restored.",
    );

    const active = await client.get("/api/goals?status=ACTIVE");
    expect(active.body.totalElements).toBe(1);
  });
});

describe("goal progress", () => {
  it("sums focus minutes for today's window (DAILY)", async () => {
    const user = await h.newUser();
    await completedSession(h, user, "2026-05-13T08:00:00Z", 60);
    await completedSession(h, user, "2026-05-12T23:00:00Z", 45); // yesterday: excluded
    const g = (await user.post("/api/goals", goal({ targetValue: 90 }))).body;

    h.setNow("2026-05-13T20:00:00Z");
    const progress = await user.get(`/api/goals/${g.id}/progress`);
    expect(progress.status).toBe(200);
    expect(progress.body).toEqual({
      goalId: g.id,
      type: "FOCUS_MINUTES",
      currentValue: 60,
      targetValue: 90,
      done: false,
      periodStart: "2026-05-13",
      periodEnd: "2026-05-13",
    });

    await completedSession(h, user, "2026-05-13T21:00:00Z", 45);
    const done = await user.get(`/api/goals/${g.id}/progress`);
    expect(done.body).toMatchObject({ currentValue: 105, done: true });
  });

  it("uses ISO weeks (Monday-Sunday) and calendar months", async () => {
    const user = await h.newUser();
    await completedSession(h, user, "2026-05-11T10:00:00Z", 10); // Monday
    await completedSession(h, user, "2026-05-10T10:00:00Z", 10); // previous Sunday
    const weekly = (await user.post("/api/goals", goal({ type: "FOCUS_SESSIONS", period: "WEEKLY", targetValue: 2 })))
      .body;
    const monthly = (await user.post("/api/goals", goal({ type: "FOCUS_SESSIONS", period: "MONTHLY", targetValue: 2 })))
      .body;

    h.setNow("2026-05-17T12:00:00Z"); // Sunday
    const w = await user.get(`/api/goals/${weekly.id}/progress`);
    expect(w.body).toMatchObject({ currentValue: 1, done: false, periodStart: "2026-05-11", periodEnd: "2026-05-17" });
    const m = await user.get(`/api/goals/${monthly.id}/progress`);
    expect(m.body).toMatchObject({ currentValue: 2, done: true, periodStart: "2026-05-01", periodEnd: "2026-05-31" });
  });

  it("counts completed tasks in a CUSTOM window, scoped to the goal project", async () => {
    const user = await h.newUser();
    const project = (await user.post("/api/projects", { title: "P" })).body;
    await completedTask(h, user, "2026-03-05T10:00:00Z", { projectId: project.id });
    await completedTask(h, user, "2026-03-06T10:00:00Z");
    await completedTask(h, user, "2026-03-11T10:00:00Z", { projectId: project.id }); // after window
    const g = (
      await user.post(
        "/api/goals",
        goal({
          type: "TASKS_COMPLETED",
          period: "CUSTOM",
          startDate: "2026-03-01",
          endDate: "2026-03-10",
          projectId: project.id,
          targetValue: 1,
        }),
      )
    ).body;
    const p = await user.get(`/api/goals/${g.id}/progress`);
    expect(p.body).toMatchObject({ currentValue: 1, done: true, periodStart: "2026-03-01", periodEnd: "2026-03-10" });

    const single = (
      await user.post("/api/goals", goal({ type: "TASKS_COMPLETED", period: "CUSTOM", startDate: "2026-03-06" }))
    ).body;
    const sp = await user.get(`/api/goals/${single.id}/progress`);
    expect(sp.body).toMatchObject({ currentValue: 1, periodStart: "2026-03-06", periodEnd: "2026-03-06" });
  });

  it("computes the window in APP_TIME_ZONE", async () => {
    const zoned = await createHarness({ APP_TIME_ZONE: "America/Sao_Paulo" });
    const user = await zoned.newUser();
    await completedSession(zoned, user, "2026-05-14T02:00:00Z", 30); // 23:00 on May 13 local
    const g = (await user.post("/api/goals", goal())).body;
    zoned.setNow("2026-05-14T02:59:00Z"); // still May 13 locally
    const p = await user.get(`/api/goals/${g.id}/progress`);
    expect(p.body).toMatchObject({ currentValue: 30, periodStart: "2026-05-13" });
  });

  it("isolates goals per user", async () => {
    const alice = await h.newUser();
    const bob = await h.newUser();
    const g = (await alice.post("/api/goals", goal())).body;
    expect((await bob.get(`/api/goals/${g.id}/progress`)).status).toBe(404);
    expect((await bob.post(`/api/goals/${g.id}/archive`)).status).toBe(404);
  });
});
