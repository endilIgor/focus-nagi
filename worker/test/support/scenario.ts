import { expect } from "vitest";
import type { Harness, TestClient } from "./harness";

/** Records a COMPLETED focus session that started at `startIso` and lasted `minutes`. */
export async function completedSession(
  h: Harness,
  user: TestClient,
  startIso: string,
  minutes: number,
  body: Record<string, unknown> = {},
): Promise<number> {
  h.setNow(startIso);
  const started = await user.post("/api/focus-sessions", { plannedFocusMinutes: 25, ...body });
  expect(started.status).toBe(201);
  h.setNow(new Date(Date.parse(startIso) + minutes * 60_000).toISOString());
  const finished = await user.post(`/api/focus-sessions/${started.body.id}/finish`);
  expect(finished.status).toBe(200);
  return started.body.id as number;
}

/** Creates a task and completes it at `atIso`. */
export async function completedTask(
  h: Harness,
  user: TestClient,
  atIso: string,
  body: Record<string, unknown> = {},
): Promise<number> {
  h.setNow(atIso);
  const task = await user.post("/api/tasks", { title: "done", ...body });
  expect(task.status).toBe(201);
  expect((await user.post(`/api/tasks/${task.body.id}/complete`)).status).toBe(200);
  return task.body.id as number;
}
