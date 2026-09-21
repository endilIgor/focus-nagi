import type { Hono } from "hono";
import { z } from "zod";
import { callRpc, type AppEnv } from "../context";
import { TASK_PRIORITIES, TASK_STATUSES } from "../domain";
import {
  boundedInt,
  enumOf,
  enumQuery,
  idQuery,
  isoDate,
  optionalId,
  optionalText,
  optionalTitle,
  orNull,
  pageQuery,
  parseBody,
  pathId,
  requiredText,
} from "../validation";

const createSchema = z.object({
  title: requiredText(200),
  description: optionalText(5000),
  priority: enumOf(TASK_PRIORITIES).nullish(),
  estimatedMinutes: boundedInt(1, 10080).nullish(),
  dueDate: isoDate().nullish(),
  projectId: optionalId(),
});

const updateSchema = z.object({
  title: optionalTitle(200),
  description: optionalText(5000),
  priority: enumOf(TASK_PRIORITIES).nullish(),
  estimatedMinutes: boundedInt(1, 10080).nullish(),
  dueDate: isoDate().nullish(),
  projectId: optionalId(),
});

const subtaskSchema = z.object({ title: requiredText(200) });

export function registerTaskRoutes(app: Hono<AppEnv>): void {
  app.post("/api/tasks", async (c) => {
    const body = await parseBody(c, createSchema);
    const task = await callRpc(c, "api_task_create", {
      p_title: body.title,
      p_description: orNull(body.description),
      p_priority: orNull(body.priority),
      p_estimated_minutes: orNull(body.estimatedMinutes),
      p_due_date: orNull(body.dueDate),
      p_project_id: orNull(body.projectId),
    });
    return c.json(task, 201);
  });

  app.get("/api/tasks", async (c) => {
    const args = {
      p_status: enumQuery(c, "status", TASK_STATUSES),
      p_project_id: idQuery(c, "projectId"),
      p_priority: enumQuery(c, "priority", TASK_PRIORITIES),
      ...pageQuery(c, 20),
    };
    return c.json(await callRpc(c, "api_task_list", args));
  });

  app.get("/api/projects/:projectId/tasks", async (c) =>
    c.json(
      await callRpc(c, "api_project_task_list", { p_project_id: pathId(c, "projectId"), ...pageQuery(c, 50) }),
    ),
  );

  app.get("/api/tasks/:id", async (c) => c.json(await callRpc(c, "api_task_get", { p_id: pathId(c) })));

  app.patch("/api/tasks/:id", async (c) => {
    const id = pathId(c);
    const body = await parseBody(c, updateSchema);
    const task = await callRpc(c, "api_task_update", {
      p_id: id,
      p_title: orNull(body.title),
      p_description: orNull(body.description),
      p_priority: orNull(body.priority),
      p_estimated_minutes: orNull(body.estimatedMinutes),
      p_due_date: orNull(body.dueDate),
      p_project_id: orNull(body.projectId),
    });
    return c.json(task);
  });

  for (const action of ["start", "complete", "reopen", "cancel"] as const) {
    app.post(`/api/tasks/:id/${action}`, async (c) =>
      c.json(await callRpc(c, "api_task_transition", { p_id: pathId(c), p_action: action })),
    );
  }

  app.delete("/api/tasks/:id", async (c) => {
    await callRpc(c, "api_task_delete", { p_id: pathId(c) });
    return c.body(null, 204);
  });

  app.post("/api/tasks/:id/subtasks", async (c) => {
    const taskId = pathId(c);
    const body = await parseBody(c, subtaskSchema);
    return c.json(await callRpc(c, "api_subtask_create", { p_task_id: taskId, p_title: body.title }), 201);
  });

  for (const [action, completed] of [
    ["complete", true],
    ["reopen", false],
  ] as const) {
    app.post(`/api/tasks/:id/subtasks/:subtaskId/${action}`, async (c) =>
      c.json(
        await callRpc(c, "api_subtask_set_completed", {
          p_task_id: pathId(c),
          p_subtask_id: pathId(c, "subtaskId"),
          p_completed: completed,
        }),
      ),
    );
  }

  app.delete("/api/tasks/:id/subtasks/:subtaskId", async (c) => {
    await callRpc(c, "api_subtask_delete", { p_task_id: pathId(c), p_subtask_id: pathId(c, "subtaskId") });
    return c.body(null, 204);
  });
}
