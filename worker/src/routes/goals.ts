import type { Hono } from "hono";
import { z } from "zod";
import { callRpc, type AppEnv } from "../context";
import { GOAL_PERIODS, GOAL_STATUSES, GOAL_TYPES } from "../domain";
import {
  boundedInt,
  enumOf,
  enumQuery,
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
  title: requiredText(150),
  description: optionalText(2000),
  type: enumOf(GOAL_TYPES),
  targetValue: boundedInt(1, 1_000_000),
  period: enumOf(GOAL_PERIODS),
  startDate: isoDate(),
  endDate: isoDate().nullish(),
  projectId: optionalId(),
});

const updateSchema = z.object({
  title: optionalTitle(150),
  description: optionalText(2000),
  targetValue: boundedInt(1, 1_000_000).nullish(),
  startDate: isoDate().nullish(),
  endDate: isoDate().nullish(),
});

export function registerGoalRoutes(app: Hono<AppEnv>): void {
  app.post("/api/goals", async (c) => {
    const body = await parseBody(c, createSchema);
    const goal = await callRpc(c, "api_goal_create", {
      p_title: body.title,
      p_description: orNull(body.description),
      p_type: body.type,
      p_target_value: body.targetValue,
      p_period: body.period,
      p_start_date: body.startDate,
      p_end_date: orNull(body.endDate),
      p_project_id: orNull(body.projectId),
    });
    return c.json(goal, 201);
  });

  app.get("/api/goals", async (c) => {
    const status = enumQuery(c, "status", GOAL_STATUSES);
    return c.json(await callRpc(c, "api_goal_list", { p_status: status, ...pageQuery(c, 50) }));
  });

  app.get("/api/goals/:id", async (c) => c.json(await callRpc(c, "api_goal_get", { p_id: pathId(c) })));

  app.patch("/api/goals/:id", async (c) => {
    const id = pathId(c);
    const body = await parseBody(c, updateSchema);
    const goal = await callRpc(c, "api_goal_update", {
      p_id: id,
      p_title: orNull(body.title),
      p_description: orNull(body.description),
      p_target_value: orNull(body.targetValue),
      p_start_date: orNull(body.startDate),
      p_end_date: orNull(body.endDate),
    });
    return c.json(goal);
  });

  for (const action of ["complete", "archive", "restore"] as const) {
    app.post(`/api/goals/:id/${action}`, async (c) =>
      c.json(await callRpc(c, "api_goal_transition", { p_id: pathId(c), p_action: action })),
    );
  }

  app.get("/api/goals/:id/progress", async (c) =>
    c.json(await callRpc(c, "api_goal_progress", { p_id: pathId(c), p_tz: c.var.timeZone })),
  );
}
