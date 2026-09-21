import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./support/harness";
import { completedSession, completedTask } from "./support/scenario";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterEach(() => h.setNow(null));

describe("today projection", () => {
  it("returns an empty projection without data", async () => {
    const user = await h.newUser();
    h.setNow("2026-08-20T12:00:00Z");
    const res = await user.get("/api/today");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      date: "2026-08-20",
      currentSession: null,
      focusedMinutesToday: 0,
      sessionsToday: 0,
      tasksCompletedToday: 0,
      tasksDueToday: [],
      overdueTasks: [],
      activeProjects: [],
      goals: [],
    });
  });

  it("aggregates today's focus, tasks, projects and goals", async () => {
    const user = await h.newUser();
    const active = (await user.post("/api/projects", { title: "Active today" })).body;
    const archived = (await user.post("/api/projects", { title: "Old" })).body;
    await user.post(`/api/projects/${archived.id}/archive`);

    await completedSession(h, user, "2026-08-20T08:00:00Z", 30, { projectId: active.id });
    await completedSession(h, user, "2026-08-20T09:00:00Z", 15);
    await completedSession(h, user, "2026-08-19T09:00:00Z", 50); // yesterday
    await completedTask(h, user, "2026-08-20T10:00:00Z");
    await completedTask(h, user, "2026-08-19T10:00:00Z");

    h.setNow("2026-08-20T11:00:00Z");
    const due = (await user.post("/api/tasks", { title: "due", dueDate: "2026-08-20", priority: "HIGH" })).body;
    const overdue1 = (await user.post("/api/tasks", { title: "late1", dueDate: "2026-08-18" })).body;
    const overdue2 = (await user.post("/api/tasks", { title: "late2", dueDate: "2026-08-10", projectId: active.id }))
      .body;
    const cancelled = (await user.post("/api/tasks", { title: "gone", dueDate: "2026-08-10" })).body;
    await user.post(`/api/tasks/${cancelled.id}/cancel`);
    await user.post("/api/tasks", { title: "later", dueDate: "2026-08-25" });

    const goal = (
      await user.post("/api/goals", {
        title: "Daily",
        type: "FOCUS_MINUTES",
        targetValue: 60,
        period: "DAILY",
        startDate: "2026-08-01",
      })
    ).body;
    const doneGoal = (
      await user.post("/api/goals", { title: "x", type: "TASKS_COMPLETED", targetValue: 1, period: "DAILY", startDate: "2026-08-01" })
    ).body;
    await user.post(`/api/goals/${doneGoal.id}/complete`);

    const running = (await user.post("/api/focus-sessions", { plannedFocusMinutes: 25 })).body;

    h.setNow("2026-08-20T12:00:00Z");
    const res = await user.get("/api/today");
    expect(res.status).toBe(200);
    expect(res.body.date).toBe("2026-08-20");
    expect(res.body.currentSession).toMatchObject({ id: running.id, status: "RUNNING" });
    expect(res.body.focusedMinutesToday).toBe(45);
    expect(res.body.sessionsToday).toBe(2);
    expect(res.body.tasksCompletedToday).toBe(1);
    expect(res.body.tasksDueToday).toEqual([
      { id: due.id, title: "due", dueDate: "2026-08-20", priority: "HIGH", projectId: null },
    ]);
    expect(res.body.overdueTasks.map((t: { id: number }) => t.id)).toEqual([overdue2.id, overdue1.id]);
    expect(res.body.activeProjects).toEqual([{ id: active.id, title: "Active today" }]);
    expect(res.body.goals).toEqual([
      { id: goal.id, title: "Daily", type: "FOCUS_MINUTES", currentValue: 45, targetValue: 60, done: false },
    ]);
  });

  it("uses APP_TIME_ZONE for the day boundary", async () => {
    const zoned = await createHarness({ APP_TIME_ZONE: "America/Sao_Paulo" });
    const user = await zoned.newUser();
    await completedSession(zoned, user, "2026-08-21T01:00:00Z", 20); // 22:00 Aug 20 local
    zoned.setNow("2026-08-21T02:30:00Z"); // 23:30 Aug 20 local
    const res = await user.get("/api/today");
    expect(res.body).toMatchObject({ date: "2026-08-20", focusedMinutesToday: 20, sessionsToday: 1 });
  });
});
