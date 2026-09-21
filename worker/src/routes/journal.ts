import type { Hono } from "hono";
import { z } from "zod";
import { callRpc, type AppEnv } from "../context";
import { dateQuery, isoDate, optionalText, orNull, pageQuery, parseBody, pathId, requiredText } from "../validation";

const createSchema = z.object({
  entryDate: isoDate(),
  content: requiredText(50000),
});

const updateSchema = z.object({
  entryDate: isoDate().nullish(),
  content: optionalText(50000),
});

export function registerJournalRoutes(app: Hono<AppEnv>): void {
  app.post("/api/journal", async (c) => {
    const body = await parseBody(c, createSchema);
    const entry = await callRpc(c, "api_journal_create", {
      p_entry_date: body.entryDate,
      p_content: body.content,
      p_tz: c.var.timeZone,
    });
    return c.json(entry, 201);
  });

  app.get("/api/journal", async (c) =>
    c.json(await callRpc(c, "api_journal_by_date", { p_date: dateQuery(c, "date", true) })),
  );

  app.get("/api/journal/range", async (c) => {
    const args = { p_from: dateQuery(c, "from", true), p_to: dateQuery(c, "to", true), ...pageQuery(c, 20) };
    return c.json(await callRpc(c, "api_journal_range", args));
  });

  app.get("/api/journal/recent", async (c) => c.json(await callRpc(c, "api_journal_recent", pageQuery(c, 20))));

  app.patch("/api/journal/:id", async (c) => {
    const id = pathId(c);
    const body = await parseBody(c, updateSchema);
    const entry = await callRpc(c, "api_journal_update", {
      p_id: id,
      p_entry_date: orNull(body.entryDate),
      p_content: orNull(body.content),
      p_tz: c.var.timeZone,
    });
    return c.json(entry);
  });

  app.delete("/api/journal/:id", async (c) => {
    await callRpc(c, "api_journal_delete", { p_id: pathId(c) });
    return c.body(null, 204);
  });
}
