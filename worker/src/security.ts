import type { MiddlewareHandler } from "hono";
import { splitList, type Env } from "./env";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
};

/** Hardens every API response; JSON API responses are never cacheable. */
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      c.res.headers.set(name, value);
    }
    if (!c.res.headers.has("Cache-Control")) {
      c.res.headers.set("Cache-Control", "no-store");
    }
  };
}

/** Exact-match origins only; wildcard entries are ignored so a typo can never open the API to every site. */
export function allowedOrigins(env: Env): string[] {
  return splitList(env.CORS_ALLOWED_ORIGINS).filter((origin) => !origin.includes("*"));
}

/**
 * Optional CORS for deployments where the browser calls the Worker cross-origin. Behind the Vercel
 * rewrite the API is same-origin and no CORS headers are emitted. Credentials are never allowed:
 * auth travels in the Authorization header, not in cookies.
 */
export function cors(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const origin = c.req.header("Origin");
    const allowed = origin !== undefined && allowedOrigins(c.env).includes(origin);

    if (c.req.method === "OPTIONS" && c.req.header("Access-Control-Request-Method")) {
      const headers = new Headers({ Vary: "Origin" });
      if (allowed) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
        headers.set("Access-Control-Max-Age", "600");
      }
      c.res = new Response(null, { status: 204, headers });
      return;
    }

    await next();
    if (allowed) {
      c.res.headers.set("Access-Control-Allow-Origin", origin);
      c.res.headers.append("Vary", "Origin");
    }
  };
}
