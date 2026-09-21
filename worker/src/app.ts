import { Hono } from "hono";
import { bearerToken, type AuthUser, type TokenVerifier } from "./auth";
import type { AppEnv } from "./context";
import type { Rpc } from "./db";
import { isValidTimeZone, splitList, type Env } from "./env";
import { accessDenied, ApiError, errorBody, internalError, unauthenticated } from "./errors";
import { registerRoutes } from "./routes";
import { cors, securityHeaders } from "./security";

export interface AppDependencies {
  rpc: (env: Env, user: AuthUser) => Rpc;
  verifyToken: TokenVerifier;
}

function configurationError(reason: string): ApiError {
  console.error(`Worker misconfiguration: ${reason}`);
  return internalError();
}

export function createApp(deps: AppDependencies): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", securityHeaders());
  app.use("*", cors());

  app.get("/api/health", (c) => c.json({ status: "UP" }));

  app.use("/api/*", async (c, next) => {
    if (!c.env.SUPABASE_URL || !c.env.SUPABASE_ANON_KEY) {
      throw configurationError("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
    }
    const timeZone = c.env.APP_TIME_ZONE?.trim() || "UTC";
    if (!isValidTimeZone(timeZone)) {
      throw configurationError("APP_TIME_ZONE is not a valid IANA time zone");
    }

    const token = bearerToken(c.req.header("Authorization"));
    if (!token) throw unauthenticated();
    const user = await deps.verifyToken(token, c.env);

    const allowList = splitList(c.env.ALLOWED_USER_IDS).map((id) => id.toLowerCase());
    if (allowList.length > 0 && !allowList.includes(user.id.toLowerCase())) {
      throw accessDenied();
    }

    c.set("user", user);
    c.set("timeZone", timeZone);
    c.set("rpc", deps.rpc(c.env, user));
    await next();
  });

  registerRoutes(app);

  app.notFound((c) => c.json(errorBody("NOT_FOUND", "Resource not found."), 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(errorBody(err.code, err.message), err.status);
    }
    console.error("Unhandled error", err instanceof Error ? err.name : typeof err);
    return c.json(errorBody("INTERNAL_ERROR", "Unexpected server error."), 500);
  });

  return app;
}
