import type { Hono } from "hono";
import { callRpc, type AppContext, type AppEnv } from "../context";
import { ANALYTICS_PERIODS } from "../domain";
import { dateQuery, enumQuery } from "../validation";

const range = (c: AppContext, required: boolean) => ({
  p_from: dateQuery(c, "from", required),
  p_to: dateQuery(c, "to", required),
  p_tz: c.var.timeZone,
});

export function registerAnalyticsRoutes(app: Hono<AppEnv>): void {
  app.get("/api/analytics/focus/summary", async (c) => {
    const period = enumQuery(c, "period", ANALYTICS_PERIODS) ?? "TODAY";
    return c.json(await callRpc(c, "api_analytics_summary", { p_period: period, p_tz: c.var.timeZone }));
  });

  app.get("/api/analytics/streaks", async (c) =>
    c.json(await callRpc(c, "api_analytics_streaks", { p_tz: c.var.timeZone })),
  );

  app.get("/api/analytics/heatmap", async (c) => c.json(await callRpc(c, "api_analytics_by_day", range(c, true))));

  app.get("/api/analytics/focus/by-day", async (c) =>
    c.json(await callRpc(c, "api_analytics_by_day", range(c, false))),
  );

  app.get("/api/analytics/focus/by-week", async (c) =>
    c.json(await callRpc(c, "api_analytics_by_week", range(c, false))),
  );

  app.get("/api/analytics/focus/by-month", async (c) =>
    c.json(await callRpc(c, "api_analytics_by_month", range(c, false))),
  );

  app.get("/api/analytics/focus/by-hour", async (c) =>
    c.json(await callRpc(c, "api_analytics_by_hour", range(c, false))),
  );

  app.get("/api/analytics/focus/by-project", async (c) => c.json(await callRpc(c, "api_analytics_by_project")));
}
