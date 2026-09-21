import type { Hono } from "hono";
import { callRpc, type AppEnv } from "../context";

export function registerTodayRoutes(app: Hono<AppEnv>): void {
  app.get("/api/today", async (c) => c.json(await callRpc(c, "api_today", { p_tz: c.var.timeZone })));
}
