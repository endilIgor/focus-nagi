import type { Hono } from "hono";
import type { AppEnv } from "../context";

/**
 * Sign-in, sign-out, token refresh and password changes are handled by Supabase Auth directly
 * from the browser. The API only exposes the identity behind the verified bearer token.
 */
export function registerAuthRoutes(app: Hono<AppEnv>): void {
  app.get("/api/auth/me", (c) => {
    const { id, email } = c.var.user;
    return c.json({ id, email });
  });
}
