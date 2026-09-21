import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, type TestClient } from "./support/harness";
import { completedSession, completedTask } from "./support/scenario";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterEach(() => h.setNow(null));

const NOW = "2026-09-16T15:00:00Z"; // Wednesday

describe("focus summary", () => {
  it("summarizes TODAY by default, and WEEK/MONTH windows", async () => {
    const user = await h.newUser();
    await completedSession(h, user, "2026-09-16T08:00:00Z", 45);
    await completedSession(h, user, "2026-09-16T10:00:00Z", 30);
    await completedSession(h, user, "2026-09-14T10:00:00Z", 20); // Monday
    await completedSession(h, user, "2026-09-13T10:00:00Z", 10); // Sunday, previous week
    await completedSession(h, user, "2026-08-31T10:00:00Z", 5); // previous month
    await completedTask(h, user, "2026-09-16T09:00:00Z");

    h.setNow(NOW);
    const today = await user.get("/api/analytics/focus/summary");
    expect(today.body).toEqual({
      period: "TODAY",
      dateStart: "2026-09-16",
      dateEnd: "2026-09-16",
      focusedMinutes: 75,
      sessionCount: 2,
      tasksCompleted: 1,
    });

    const week = await user.get("/api/analytics/focus/summary?period=WEEK");
    expect(week.body).toMatchObject({ dateStart: "2026-09-14", dateEnd: "2026-09-20", focusedMinutes: 95 });

    const month = await user.get("/api/analytics/focus/summary?period=MONTH");
    expect(month.body).toMatchObject({ dateStart: "2026-09-01", dateEnd: "2026-09-30", focusedMinutes: 105 });

    expect((await user.get("/api/analytics/focus/summary?period=YEAR")).body.code).toBe("MALFORMED_REQUEST");
  });

  it("ignores cancelled and still-running sessions", async () => {
    const user = await h.newUser();
    h.setNow("2026-09-16T08:00:00Z");
    const s = (await user.post("/api/focus-sessions", { plannedFocusMinutes: 25 })).body;
    h.setNow("2026-09-16T09:00:00Z");
    await user.post(`/api/focus-sessions/${s.id}/cancel`);
    await user.post("/api/focus-sessions", { plannedFocusMinutes: 25 });
    h.setNow(NOW);
    const res = await user.get("/api/analytics/focus/summary");
    expect(res.body).toMatchObject({ focusedMinutes: 0, sessionCount: 0 });
  });
});

describe("streaks", () => {
  it("computes current and longest streaks", async () => {
    const user = await h.newUser();
    for (const day of ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-14", "2026-09-15", "2026-09-16"]) {
      await completedSession(h, user, `${day}T10:00:00Z`, 5);
    }
    h.setNow(NOW);
    const res = await user.get("/api/analytics/streaks");
    expect(res.body).toEqual({ currentStreak: 3, longestStreak: 4 });
  });

  it("does not break the current streak when today has no focus yet", async () => {
    const user = await h.newUser();
    await completedSession(h, user, "2026-09-14T10:00:00Z", 5);
    await completedSession(h, user, "2026-09-15T10:00:00Z", 5);
    h.setNow(NOW);
    expect((await user.get("/api/analytics/streaks")).body).toEqual({ currentStreak: 2, longestStreak: 2 });
  });

  it("is zero without focus and ignores zero-second sessions", async () => {
    const user = await h.newUser();
    h.setNow("2026-09-16T10:00:00Z");
    const s = (await user.post("/api/focus-sessions", { plannedFocusMinutes: 25 })).body;
    await user.post(`/api/focus-sessions/${s.id}/finish`);
    h.setNow(NOW);
    expect((await user.get("/api/analytics/streaks")).body).toEqual({ currentStreak: 0, longestStreak: 0 });
  });
});

describe("heatmap and by-day", () => {
  let user: TestClient;
  beforeAll(async () => {
    user = await h.newUser();
    await completedSession(h, user, "2026-09-16T08:00:00Z", 40);
    await completedSession(h, user, "2026-09-13T23:59:00Z", 20); // outside range below
    await completedSession(h, user, "2026-09-17T00:00:00Z", 20); // after range
  });

  it("returns every day in the range including zeros", async () => {
    h.setNow(NOW);
    const res = await user.get("/api/analytics/heatmap?from=2026-09-14&to=2026-09-16");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { date: "2026-09-14", focusedMinutes: 0 },
      { date: "2026-09-15", focusedMinutes: 0 },
      { date: "2026-09-16", focusedMinutes: 40 },
    ]);
  });

  it("validates heatmap ranges", async () => {
    expect((await user.get("/api/analytics/heatmap?from=2025-01-01&to=2026-01-02")).body.code).toBe(
      "ANALYTICS_RANGE_TOO_LARGE",
    );
    expect((await user.get("/api/analytics/heatmap?from=2026-01-02&to=2026-01-01")).body.code).toBe(
      "ANALYTICS_INVALID_RANGE",
    );
    const missing = await user.get("/api/analytics/heatmap?from=2026-01-01");
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("VALIDATION_ERROR");
    expect((await user.get("/api/analytics/heatmap?from=2025-01-01&to=2025-12-31")).status).toBe(200);
  });

  it("defaults by-day to the last 30 days ending today", async () => {
    h.setNow(NOW);
    const res = await user.get("/api/analytics/focus/by-day");
    expect(res.body).toHaveLength(30);
    expect(res.body[0].date).toBe("2026-08-18");
    expect(res.body[29]).toEqual({ date: "2026-09-16", focusedMinutes: 40 });
  });
});

describe("by-week, by-month, by-hour, by-project", () => {
  it("buckets completed focus by ISO week and month within the range", async () => {
    const user = await h.newUser();
    await completedSession(h, user, "2026-09-15T10:00:00Z", 60);
    await completedSession(h, user, "2026-09-16T10:00:00Z", 30);
    await completedSession(h, user, "2026-08-03T10:00:00Z", 10);
    h.setNow(NOW);

    const weeks = await user.get("/api/analytics/focus/by-week?from=2026-09-01&to=2026-09-30");
    expect(weeks.body).toEqual([{ weekStart: "2026-09-14", focusedMinutes: 90 }]);

    const defaultsWeeks = await user.get("/api/analytics/focus/by-week");
    expect(defaultsWeeks.body).toEqual([
      { weekStart: "2026-08-03", focusedMinutes: 10 },
      { weekStart: "2026-09-14", focusedMinutes: 90 },
    ]);

    const months = await user.get("/api/analytics/focus/by-month");
    expect(months.body).toEqual([
      { month: "2026-08", focusedMinutes: 10 },
      { month: "2026-09", focusedMinutes: 90 },
    ]);
    expect((await user.get("/api/analytics/focus/by-week?from=2025-01-01&to=2026-01-31")).body.code).toBe(
      "ANALYTICS_RANGE_TOO_LARGE",
    );
  });

  it("buckets focus by local hour of the session start", async () => {
    const zoned = await createHarness({ APP_TIME_ZONE: "America/Sao_Paulo" });
    const user = await zoned.newUser();
    await completedSession(zoned, user, "2026-09-15T17:10:00Z", 30); // 14:10 local
    await completedSession(zoned, user, "2026-09-16T17:40:00Z", 15); // 14:40 local
    await completedSession(zoned, user, "2026-09-16T12:00:00Z", 5); // 09:00 local
    zoned.setNow("2026-09-16T23:00:00Z"); // without `to`, the window ends at the current instant
    const res = await user.get("/api/analytics/focus/by-hour");
    expect(res.body).toEqual([
      { hour: 9, focusedMinutes: 5 },
      { hour: 14, focusedMinutes: 45 },
    ]);
    const ranged = await user.get("/api/analytics/focus/by-hour?from=2026-09-16&to=2026-09-16");
    expect(ranged.body).toEqual([
      { hour: 9, focusedMinutes: 5 },
      { hour: 14, focusedMinutes: 15 },
    ]);
  });

  it("breaks focus down by project, largest first, including unassigned time", async () => {
    const user = await h.newUser();
    const a = (await user.post("/api/projects", { title: "Analytics A" })).body;
    const b = (await user.post("/api/projects", { title: "Analytics B" })).body;
    await completedSession(h, user, "2026-09-10T10:00:00Z", 30, { projectId: a.id });
    await completedSession(h, user, "2026-09-11T10:00:00Z", 10, { projectId: b.id });
    await completedSession(h, user, "2026-09-12T10:00:00Z", 20);
    const res = await user.get("/api/analytics/focus/by-project");
    expect(res.body).toEqual([
      { projectId: a.id, title: "Analytics A", focusedMinutes: 30 },
      { projectId: null, title: null, focusedMinutes: 20 },
      { projectId: b.id, title: "Analytics B", focusedMinutes: 10 },
    ]);
  });

  it("never mixes another user's sessions into analytics", async () => {
    const alice = await h.newUser();
    const bob = await h.newUser();
    await completedSession(h, alice, "2026-09-16T08:00:00Z", 50);
    h.setNow(NOW);
    expect((await bob.get("/api/analytics/focus/summary")).body.focusedMinutes).toBe(0);
    expect((await bob.get("/api/analytics/focus/by-project")).body).toEqual([]);
    expect((await bob.get("/api/analytics/streaks")).body.currentStreak).toBe(0);
  });
});
