import type { Hono } from "hono";
import { z } from "zod";
import { callRpc, type AppEnv } from "../context";
import { dateQuery, isoDate, parseBody, pathId, requiredText } from "../validation";

const createSchema = z.object({ title: requiredText(200), date: isoDate() });
const updateSchema = z.object({ completed: z.boolean() });

export function registerChecklistRoutes(app: Hono<AppEnv>): void {
  app.get("/api/checklist", async (c) =>
    c.json(await callRpc(c, "api_checklist_list", { p_date: dateQuery(c, "date", true) })),
  );

  app.post("/api/checklist", async (c) => {
    const body = await parseBody(c, createSchema);
    return c.json(await callRpc(c, "api_checklist_create", { p_title: body.title, p_date: body.date }), 201);
  });

  app.patch("/api/checklist/:id", async (c) => {
    const id = pathId(c);
    const body = await parseBody(c, updateSchema);
    return c.json(await callRpc(c, "api_checklist_set_completed", { p_id: id, p_completed: body.completed }));
  });

  app.delete("/api/checklist/:id", async (c) => {
    await callRpc(c, "api_checklist_delete", { p_id: pathId(c) });
    return c.body(null, 204);
  });
}
