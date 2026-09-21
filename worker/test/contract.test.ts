import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, type TestClient } from "./support/harness";

/**
 * Every endpoint exposed by the former Spring Boot API (controllers under com.focusnagi.*).
 * A route that exists answers with anything but the generic NOT_FOUND route miss
 * (missing resources answer with domain codes such as PROJECT_NOT_FOUND instead).
 */
const LEGACY_ENDPOINTS: Array<[string, string]> = [
  ["GET", "/api/auth/me"],
  ["POST", "/api/projects"],
  ["GET", "/api/projects"],
  ["GET", "/api/projects/999"],
  ["PATCH", "/api/projects/999"],
  ["POST", "/api/projects/999/complete"],
  ["POST", "/api/projects/999/archive"],
  ["POST", "/api/projects/999/restore"],
  ["GET", "/api/projects/999/focus"],
  ["GET", "/api/projects/999/tasks"],
  ["POST", "/api/tasks"],
  ["GET", "/api/tasks"],
  ["GET", "/api/tasks/999"],
  ["PATCH", "/api/tasks/999"],
  ["POST", "/api/tasks/999/start"],
  ["POST", "/api/tasks/999/complete"],
  ["POST", "/api/tasks/999/reopen"],
  ["POST", "/api/tasks/999/cancel"],
  ["DELETE", "/api/tasks/999"],
  ["POST", "/api/tasks/999/subtasks"],
  ["POST", "/api/tasks/999/subtasks/1/complete"],
  ["POST", "/api/tasks/999/subtasks/1/reopen"],
  ["DELETE", "/api/tasks/999/subtasks/1"],
  ["POST", "/api/focus-sessions"],
  ["GET", "/api/focus-sessions/current"],
  ["GET", "/api/focus-sessions"],
  ["POST", "/api/focus-sessions/999/pause"],
  ["POST", "/api/focus-sessions/999/resume"],
  ["POST", "/api/focus-sessions/999/finish"],
  ["POST", "/api/focus-sessions/999/cancel"],
  ["POST", "/api/goals"],
  ["GET", "/api/goals"],
  ["GET", "/api/goals/999"],
  ["PATCH", "/api/goals/999"],
  ["POST", "/api/goals/999/complete"],
  ["POST", "/api/goals/999/archive"],
  ["POST", "/api/goals/999/restore"],
  ["GET", "/api/goals/999/progress"],
  ["POST", "/api/notes"],
  ["GET", "/api/notes"],
  ["GET", "/api/notes/999"],
  ["PATCH", "/api/notes/999"],
  ["DELETE", "/api/notes/999"],
  ["POST", "/api/notes/999/pin"],
  ["POST", "/api/notes/999/unpin"],
  ["POST", "/api/journal"],
  ["GET", "/api/journal?date=2026-01-01"],
  ["GET", "/api/journal/range?from=2026-01-01&to=2026-01-02"],
  ["GET", "/api/journal/recent"],
  ["PATCH", "/api/journal/999"],
  ["DELETE", "/api/journal/999"],
  ["GET", "/api/today"],
  ["GET", "/api/analytics/focus/summary"],
  ["GET", "/api/analytics/streaks"],
  ["GET", "/api/analytics/heatmap?from=2026-01-01&to=2026-01-02"],
  ["GET", "/api/analytics/focus/by-day"],
  ["GET", "/api/analytics/focus/by-week"],
  ["GET", "/api/analytics/focus/by-month"],
  ["GET", "/api/analytics/focus/by-hour"],
  ["GET", "/api/analytics/focus/by-project"],
];

/** Cookie/CSRF session endpoints replaced by Supabase Auth in the browser. */
const RETIRED_ENDPOINTS: Array<[string, string]> = [
  ["POST", "/api/auth/login"],
  ["POST", "/api/auth/logout"],
  ["POST", "/api/auth/password"],
  ["GET", "/api/auth/csrf"],
];

let h: Harness;
let user: TestClient;
beforeAll(async () => {
  h = await createHarness();
  user = await h.newUser();
});

function send(method: string, path: string) {
  const body = method === "POST" || method === "PATCH" ? {} : undefined;
  return method === "GET"
    ? user.get(path)
    : method === "DELETE"
      ? user.delete(path)
      : method === "PATCH"
        ? user.patch(path, body)
        : user.post(path, body);
}

describe("legacy API contract", () => {
  it.each(LEGACY_ENDPOINTS)("%s %s is served by the Worker", async (method, path) => {
    const res = await send(method, path);
    expect(res.body?.code, JSON.stringify(res.body)).not.toBe("NOT_FOUND");
    expect(res.status).toBeLessThan(500);
  });

  it.each(RETIRED_ENDPOINTS)("%s %s is retired in favour of Supabase Auth", async (method, path) => {
    const res = await send(method, path);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});
