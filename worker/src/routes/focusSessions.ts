import type { Hono } from "hono";
import { z } from "zod";
import { callRpc, type AppEnv } from "../context";
import { FOCUS_SESSION_STATUSES } from "../domain";
import {
  boundedInt,
  dateQuery,
  enumQuery,
  idQuery,
  optionalId,
  optionalText,
  orNull,
  pageQuery,
  parseBody,
  pathId,
} from "../validation";

const startSchema = z.object({
  plannedFocusMinutes: boundedInt(1, 1440),
  plannedBreakMinutes: boundedInt(0, 1440).nullish(),
  taskId: optionalId(),
  projectId: optionalId(),
  notes: optionalText(2000),
});

export function registerFocusSessionRoutes(app: Hono<AppEnv>): void {
  app.post("/api/focus-sessions", async (c) => {
    const body = await parseBody(c, startSchema);
    const session = await callRpc(c, "api_focus_start", {
      p_planned_focus_minutes: body.plannedFocusMinutes,
      p_planned_break_minutes: orNull(body.plannedBreakMinutes),
      p_task_id: orNull(body.taskId),
      p_project_id: orNull(body.projectId),
      p_notes: orNull(body.notes),
    });
    return c.json(session, 201);
  });

  app.get("/api/focus-sessions/current", async (c) => {
    const current = await callRpc<unknown>(c, "api_focus_current");
    return current === null || current === undefined ? c.body(null, 204) : c.json(current);
  });

  app.get("/api/focus-sessions", async (c) => {
    const args = {
      p_status: enumQuery(c, "status", FOCUS_SESSION_STATUSES),
      p_project_id: idQuery(c, "projectId"),
      p_task_id: idQuery(c, "taskId"),
      p_from: dateQuery(c, "from"),
      p_to: dateQuery(c, "to"),
      p_tz: c.var.timeZone,
      ...pageQuery(c, 20),
    };
    return c.json(await callRpc(c, "api_focus_history", args));
  });

  for (const action of ["pause", "resume", "finish", "cancel"] as const) {
    app.post(`/api/focus-sessions/:id/${action}`, async (c) =>
      c.json(await callRpc(c, "api_focus_transition", { p_id: pathId(c), p_action: action })),
    );
  }
}
