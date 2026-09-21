import type { Hono } from "hono";
import { z } from "zod";
import { callRpc, type AppEnv } from "../context";
import {
  boolQuery,
  idQuery,
  optionalId,
  optionalText,
  optionalTitle,
  orNull,
  pageQuery,
  parseBody,
  pathId,
  requiredText,
  textQuery,
} from "../validation";

const createSchema = z.object({
  title: requiredText(150),
  content: optionalText(20000),
  projectId: optionalId(),
});

const updateSchema = z.object({
  title: optionalTitle(150),
  content: optionalText(20000),
  projectId: optionalId(),
});

export function registerNoteRoutes(app: Hono<AppEnv>): void {
  app.post("/api/notes", async (c) => {
    const body = await parseBody(c, createSchema);
    const note = await callRpc(c, "api_note_create", {
      p_title: body.title,
      p_content: orNull(body.content),
      p_project_id: orNull(body.projectId),
    });
    return c.json(note, 201);
  });

  app.get("/api/notes", async (c) => {
    const args = {
      p_pinned: boolQuery(c, "pinned"),
      p_project_id: idQuery(c, "projectId"),
      p_q: textQuery(c, "q", 200),
      ...pageQuery(c, 20),
    };
    return c.json(await callRpc(c, "api_note_list", args));
  });

  app.get("/api/notes/:id", async (c) => c.json(await callRpc(c, "api_note_get", { p_id: pathId(c) })));

  app.patch("/api/notes/:id", async (c) => {
    const id = pathId(c);
    const body = await parseBody(c, updateSchema);
    const note = await callRpc(c, "api_note_update", {
      p_id: id,
      p_title: orNull(body.title),
      p_content: orNull(body.content),
      p_project_id: orNull(body.projectId),
    });
    return c.json(note);
  });

  app.delete("/api/notes/:id", async (c) => {
    await callRpc(c, "api_note_delete", { p_id: pathId(c) });
    return c.body(null, 204);
  });

  for (const [action, pinned] of [
    ["pin", true],
    ["unpin", false],
  ] as const) {
    app.post(`/api/notes/:id/${action}`, async (c) =>
      c.json(await callRpc(c, "api_note_set_pinned", { p_id: pathId(c), p_pinned: pinned })),
    );
  }
}
