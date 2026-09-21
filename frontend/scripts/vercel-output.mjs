// Emits a Vercel Build Output API (v3) bundle for the SPA: static files from dist/, a same-origin
// /api/* proxy to the Cloudflare Worker, SPA fallback routing and security headers.
//
// vercel.json cannot read environment variables in rewrites, so the Worker origin comes from the
// API_ORIGIN environment variable at build time (set it in the Vercel project settings).
// Usage (after `vite build`): node scripts/vercel-output.mjs
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Validates an origin (scheme://host[:port]) and returns it without a trailing slash. */
export function normalizeOrigin(value, name) {
  if (!value || !value.trim()) {
    throw new Error(`${name} must be set to the Worker origin, e.g. https://focus-nagi-api.<account>.workers.dev`);
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${name} must be an absolute URL (got "${value}")`);
  }
  const secure = url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
  if (!secure) throw new Error(`${name} must use https`);
  if (url.username || url.password) throw new Error(`${name} must not contain credentials`);
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    throw new Error(`${name} must be a bare origin without path, query or fragment`);
  }
  return url.origin;
}

function contentSecurityPolicy(connectOrigins) {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    `connect-src 'self' ${connectOrigins.join(" ")}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Pure config builder (unit tested). */
export function buildVercelConfig(env) {
  const apiOrigin = normalizeOrigin(env.API_ORIGIN, "API_ORIGIN");
  const supabaseOrigin = normalizeOrigin(env.VITE_SUPABASE_URL, "VITE_SUPABASE_URL");
  const connect = [supabaseOrigin];
  if (env.VITE_API_BASE_URL) connect.push(normalizeOrigin(env.VITE_API_BASE_URL, "VITE_API_BASE_URL"));

  const securityHeaders = {
    "Content-Security-Policy": contentSecurityPolicy(connect),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };

  return {
    version: 3,
    routes: [
      { src: "^/api/(.*)$", dest: `${apiOrigin}/api/$1` },
      { src: "^/(?!api/).*$", headers: securityHeaders, continue: true },
      { src: "^/assets/(.*)$", headers: { "Cache-Control": "public, max-age=31536000, immutable" }, continue: true },
      { handle: "filesystem" },
      { src: "^/(.*)$", dest: "/index.html" },
    ],
  };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const config = buildVercelConfig(process.env);
  const output = join(root, ".vercel", "output");
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  cpSync(join(root, "dist"), join(output, "static"), { recursive: true });
  writeFileSync(join(output, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Vercel output written; /api/* is proxied to ${new URL(config.routes[0].dest).origin}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
