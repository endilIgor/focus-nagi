import type { Hono } from "hono";
import { z } from "zod";
import { callRpc, type AppEnv } from "../context";
import { PROJECT_STATUSES } from "../domain";
import { enumQuery, isoDate, optionalText, optionalTitle, orNull, pageQuery, parseBody, pathId, requiredText } from "../validation";

const createSchema = z.object({
  title: requiredText(120),
  description: optionalText(2000),
  startDate: isoDate().nullish(),
  dueDate: isoDate().nullish(),
});

const updateSchema = z.object({
  title: optionalTitle(120),
  description: optionalText(2000),
  startDate: isoDate().nullish(),
  dueDate: isoDate().nullish(),
});

export function registerProjectRoutes(app: Hono<AppEnv>): void {
  app.post("/api/projects", async (c) => {
    const body = await parseBody(c, createSchema);
    const project = await callRpc(c, "api_project_create", {
      p_title: body.title,
      p_description: orNull(body.description),
      p_start_date: orNull(body.startDate),
      p_due_date: orNull(body.dueDate),
    });
    return c.json(project, 201);
  });

  app.get("/api/projects", async (c) => {
    const status = enumQuery(c, "status", PROJECT_STATUSES);
    return c.json(await callRpc(c, "api_project_list", { p_status: status, ...pageQuery(c, 20) }));
  });

  app.get("/api/projects/:id", async (c) =>
    c.json(await callRpc(c, "api_project_get", { p_id: pathId(c) })),
  );

  app.patch("/api/projects/:id", async (c) => {
    const id = pathId(c);
    const body = await parseBody(c, updateSchema);
    const project = await callRpc(c, "api_project_update", {
      p_id: id,
      p_title: orNull(body.title),
      p_description: orNull(body.description),
      p_start_date: orNull(body.startDate),
      p_due_date: orNull(body.dueDate),
    });
    return c.json(project);
  });

  for (const action of ["complete", "archive", "restore"] as const) {
    app.post(`/api/projects/:id/${action}`, async (c) =>
      c.json(await callRpc(c, "api_project_transition", { p_id: pathId(c), p_action: action })),
    );
  }

  app.get("/api/projects/:id/focus", async (c) =>
    c.json(await callRpc(c, "api_project_focus", { p_id: pathId(c) })),
  );
}
