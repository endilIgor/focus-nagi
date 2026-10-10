import type { Hono } from "hono";
import { callRpc, type AppContext, type AppEnv } from "../context";

/** Health capability from the database; any failure or non-boolean result denies access. */
async function healthAccess(c: AppContext): Promise<boolean> {
  try {
    return (await callRpc<unknown>(c, "api_health_access")) === true;
  } catch (err) {
    console.error("health access check failed", err instanceof Error ? err.name : typeof err);
    return false;
  }
}

/**
 * Sign-in, sign-out, token refresh and password changes are handled by Supabase Auth directly
 * from the browser. The API only exposes the identity behind the verified bearer token.
 */
export function registerAuthRoutes(app: Hono<AppEnv>): void {
  app.get("/api/auth/me", async (c) => {
    const { id, email } = c.var.user;
    return c.json({ id, email, healthAccess: await healthAccess(c) });
  });
}
