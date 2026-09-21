import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, type TestClient } from "./support/harness";

let h: Harness;
let user: TestClient;
beforeAll(async () => {
  h = await createHarness();
  user = await h.newUser();
});

async function createTask(client: TestClient, body: Record<string, unknown> = {}) {
  const res = await client.post("/api/tasks", { title: "Task", ...body });
  expect(res.status).toBe(201);
  return res.body;
}

describe("tasks", () => {
  it("creates a task summary with defaults", async () => {
    const res = await user.post("/api/tasks", { title: "  Write docs " });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Write docs",
      description: null,
      status: "TODO",
      priority: "MEDIUM",
      estimatedMinutes: null,
      dueDate: null,
      projectId: null,
      completedAt: null,
      subtasks: null,
    });
  });

  it("validates input and project existence", async () => {
    const res = await user.post("/api/tasks", { title: "x", estimatedMinutes: 0, priority: "URGENT" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.message).toContain("estimatedMinutes must be at least 1");
    expect(res.body.message).toContain("priority must be one of LOW, MEDIUM, HIGH");

    const tooLong = await user.post("/api/tasks", { title: "x", estimatedMinutes: 10081 });
    expect(tooLong.body.message).toContain("estimatedMinutes must be at most 10080");

    const missingProject = await user.post("/api/tasks", { title: "x", projectId: 999999 });
    expect(missingProject.status).toBe(404);
    expect(missingProject.body.code).toBe("PROJECT_NOT_FOUND");
  });

  it("gets a task with ordered subtasks and 404s otherwise", async () => {
    const task = await createTask(user);
    await user.post(`/api/tasks/${task.id}/subtasks`, { title: "first" });
    await user.post(`/api/tasks/${task.id}/subtasks`, { title: "second" });
    const res = await user.get(`/api/tasks/${task.id}`);
    expect(res.status).toBe(200);
    expect(res.body.subtasks.map((s: { title: string }) => s.title)).toEqual(["first", "second"]);
    expect((await user.get("/api/tasks/999999")).body.code).toBe("TASK_NOT_FOUND");
  });

  it("updates with the original PATCH semantics (dueDate/projectId always applied)", async () => {
    const project = (await user.post("/api/projects", { title: "P" })).body;
    const task = await createTask(user, {
      description: "keep",
      priority: "HIGH",
      estimatedMinutes: 30,
      dueDate: "2026-05-01",
      projectId: project.id,
    });
    const res = await user.patch(`/api/tasks/${task.id}`, { title: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: "Renamed",
      description: "keep",
      priority: "HIGH",
      estimatedMinutes: 30,
      dueDate: null,
      projectId: null,
      subtasks: [],
    });

    const moved = await user.patch(`/api/tasks/${task.id}`, { projectId: project.id, dueDate: "2026-06-01" });
    expect(moved.body).toMatchObject({ projectId: project.id, dueDate: "2026-06-01" });

    const bad = await user.patch(`/api/tasks/${task.id}`, { projectId: 999999 });
    expect(bad.status).toBe(404);
    expect(bad.body.code).toBe("PROJECT_NOT_FOUND");
  });

  it("enforces task transitions", async () => {
    const task = await createTask(user);
    const started = await user.post(`/api/tasks/${task.id}/start`);
    expect(started.body.status).toBe("IN_PROGRESS");
    const startAgain = await user.post(`/api/tasks/${task.id}/start`);
    expect(startAgain.status).toBe(409);
    expect(startAgain.body).toMatchObject({
      code: "INVALID_TASK_STATE",
      message: "Only a pending task can be started.",
    });

    const completed = await user.post(`/api/tasks/${task.id}/complete`);
    expect(completed.body.status).toBe("COMPLETED");
    expect(completed.body.completedAt).not.toBeNull();

    const cancelCompleted = await user.post(`/api/tasks/${task.id}/cancel`);
    expect(cancelCompleted.status).toBe(409);
    expect(cancelCompleted.body.message).toBe("Only a pending or in-progress task can be cancelled.");

    const reopened = await user.post(`/api/tasks/${task.id}/reopen`);
    expect(reopened.body).toMatchObject({ status: "TODO", completedAt: null });
    const reopenAgain = await user.post(`/api/tasks/${task.id}/reopen`);
    expect(reopenAgain.body.message).toBe("Only a completed task can be reopened.");

    const cancelled = await user.post(`/api/tasks/${task.id}/cancel`);
    expect(cancelled.body.status).toBe("CANCELLED");
    const completeCancelled = await user.post(`/api/tasks/${task.id}/complete`);
    expect(completeCancelled.body.message).toBe("Only a pending or in-progress task can be completed.");
  });

  it("filters and paginates the task list newest first", async () => {
    const client = await h.newUser();
    const project = (await client.post("/api/projects", { title: "P" })).body;
    await createTask(client, { title: "a", priority: "LOW" });
    await createTask(client, { title: "b", priority: "HIGH", projectId: project.id });
    const c = await createTask(client, { title: "c", priority: "HIGH" });
    await client.post(`/api/tasks/${c.id}/complete`);

    const all = await client.get("/api/tasks");
    expect(all.body.totalElements).toBe(3);
    expect(all.body.size).toBe(20);
    expect(all.body.content.map((t: { title: string }) => t.title)).toEqual(["c", "b", "a"]);
    expect(all.body.content[0].subtasks).toBeNull();

    const high = await client.get("/api/tasks?priority=HIGH&status=TODO");
    expect(high.body.content.map((t: { title: string }) => t.title)).toEqual(["b"]);
    const byProject = await client.get(`/api/tasks?projectId=${project.id}`);
    expect(byProject.body.content.map((t: { title: string }) => t.title)).toEqual(["b"]);

    const projectTasks = await client.get(`/api/projects/${project.id}/tasks`);
    expect(projectTasks.status).toBe(200);
    expect(projectTasks.body.size).toBe(50);
    expect(projectTasks.body.content.map((t: { title: string }) => t.title)).toEqual(["b"]);
    expect((await client.get("/api/projects/999999/tasks")).body.code).toBe("PROJECT_NOT_FOUND");

    expect((await client.get("/api/tasks?status=DONE")).body.code).toBe("MALFORMED_REQUEST");
  });

  it("deletes tasks with their subtasks", async () => {
    const task = await createTask(user);
    await user.post(`/api/tasks/${task.id}/subtasks`, { title: "child" });
    const res = await user.delete(`/api/tasks/${task.id}`);
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
    expect((await user.get(`/api/tasks/${task.id}`)).status).toBe(404);
    expect((await user.delete(`/api/tasks/${task.id}`)).status).toBe(404);
  });

  it("refuses to delete a task that has focus sessions", async () => {
    const task = await createTask(user);
    const session = await user.post("/api/focus-sessions", { plannedFocusMinutes: 25, taskId: task.id });
    expect(session.status).toBe(201);
    await user.post(`/api/focus-sessions/${session.body.id}/cancel`);
    const res = await user.delete(`/api/tasks/${task.id}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TASK_HAS_FOCUS_SESSIONS");
  });
});

describe("subtasks", () => {
  it("adds, completes, reopens and deletes subtasks scoped to their task", async () => {
    const task = await createTask(user);
    const other = await createTask(user);
    const created = await user.post(`/api/tasks/${task.id}/subtasks`, { title: "  step " });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: "step", completed: false });
    const sid = created.body.id;

    expect((await user.post(`/api/tasks/${task.id}/subtasks/${sid}/complete`)).body.completed).toBe(true);
    expect((await user.post(`/api/tasks/${task.id}/subtasks/${sid}/reopen`)).body.completed).toBe(false);

    const wrongTask = await user.post(`/api/tasks/${other.id}/subtasks/${sid}/complete`);
    expect(wrongTask.status).toBe(404);
    expect(wrongTask.body.code).toBe("SUBTASK_NOT_FOUND");

    const missingTask = await user.post(`/api/tasks/999999/subtasks`, { title: "x" });
    expect(missingTask.body.code).toBe("TASK_NOT_FOUND");

    const blank = await user.post(`/api/tasks/${task.id}/subtasks`, { title: "" });
    expect(blank.status).toBe(400);

    expect((await user.delete(`/api/tasks/${task.id}/subtasks/${sid}`)).status).toBe(204);
    expect((await user.delete(`/api/tasks/${task.id}/subtasks/${sid}`)).status).toBe(404);
  });
});

describe("task isolation", () => {
  it("prevents cross-user access and cross-user project references", async () => {
    const alice = await h.newUser();
    const bob = await h.newUser();
    const aliceProject = (await alice.post("/api/projects", { title: "A" })).body;
    const aliceTask = await createTask(alice);

    expect((await bob.get(`/api/tasks/${aliceTask.id}`)).status).toBe(404);
    expect((await bob.delete(`/api/tasks/${aliceTask.id}`)).status).toBe(404);
    expect((await bob.post(`/api/tasks/${aliceTask.id}/subtasks`, { title: "x" })).status).toBe(404);
    expect((await bob.post("/api/tasks", { title: "x", projectId: aliceProject.id })).body.code).toBe(
      "PROJECT_NOT_FOUND",
    );
    expect((await bob.get(`/api/projects/${aliceProject.id}/tasks`)).status).toBe(404);
    expect((await alice.get(`/api/tasks/${aliceTask.id}`)).status).toBe(200);
  });
});
