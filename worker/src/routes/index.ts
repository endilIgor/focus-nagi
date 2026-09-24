import type { Hono } from "hono";
import type { AppEnv } from "../context";
import { registerAnalyticsRoutes } from "./analytics";
import { registerAuthRoutes } from "./auth";
import { registerChecklistRoutes } from "./checklist";
import { registerFocusSessionRoutes } from "./focusSessions";
import { registerGoalRoutes } from "./goals";
import { registerJournalRoutes } from "./journal";
import { registerNoteRoutes } from "./notes";
import { registerProjectRoutes } from "./projects";
import { registerTaskRoutes } from "./tasks";
import { registerTodayRoutes } from "./today";

export function registerRoutes(app: Hono<AppEnv>): void {
  registerAuthRoutes(app);
  registerChecklistRoutes(app);
  registerProjectRoutes(app);
  registerTaskRoutes(app);
  registerFocusSessionRoutes(app);
  registerGoalRoutes(app);
  registerNoteRoutes(app);
  registerJournalRoutes(app);
  registerTodayRoutes(app);
  registerAnalyticsRoutes(app);
}
