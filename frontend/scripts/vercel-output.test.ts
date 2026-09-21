import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM build script without type declarations
import { buildVercelConfig, normalizeOrigin } from "./vercel-output.mjs";

type Route = { src?: string; dest?: string; handle?: string; headers?: Record<string, string>; continue?: boolean };

const env = {
  API_ORIGIN: "https://focus-nagi-api.example.workers.dev",
  VITE_SUPABASE_URL: "https://abcd.supabase.co",
};

function matching(routes: Route[], path: string): Route[] {
  return routes.filter((r) => r.src && new RegExp(r.src).test(path));
}

describe("normalizeOrigin", () => {
  it("accepts bare https origins and strips a trailing slash", () => {
    expect(normalizeOrigin("https://api.example.com/", "API_ORIGIN")).toBe("https://api.example.com");
  });

  it.each([
    ["missing", undefined],
    ["http outside localhost", "http://api.example.com"],
    ["with a path", "https://api.example.com/api"],
    ["with credentials", "https://user:pass@api.example.com"],
    ["with a query", "https://api.example.com?x=1"],
    ["not a URL", "api.example.com"],
  ])("rejects %s", (_label, value) => {
    expect(() => normalizeOrigin(value, "API_ORIGIN")).toThrow(/API_ORIGIN/);
  });

  it("allows plain http for local previews", () => {
    expect(normalizeOrigin("http://localhost:8787", "API_ORIGIN")).toBe("http://localhost:8787");
  });
});

describe("buildVercelConfig", () => {
  it("proxies /api/* to the Worker origin, preserving the path", () => {
    const config = buildVercelConfig(env);
    expect(config.version).toBe(3);
    const api = config.routes.find((r: Route) => r.dest?.startsWith("https://focus-nagi-api"));
    expect(api).toEqual({ src: "^/api/(.*)$", dest: "https://focus-nagi-api.example.workers.dev/api/$1" });
    expect(new RegExp(api.src).test("/api/tasks/1/subtasks")).toBe(true);
    expect(new RegExp(api.src).test("/apidocs")).toBe(false);
  });

  it("serves static files first and falls back to index.html for client routes", () => {
    const { routes } = buildVercelConfig(env);
    const filesystem = routes.findIndex((r: Route) => r.handle === "filesystem");
    const fallback = routes.findIndex((r: Route) => r.dest === "/index.html");
    const api = routes.findIndex((r: Route) => r.src === "^/api/(.*)$");
    expect(api).toBeLessThan(filesystem);
    expect(filesystem).toBeLessThan(fallback);
    expect(new RegExp(routes[fallback].src).test("/tarefas")).toBe(true);
  });

  it("adds security headers to the app shell (not to proxied API responses)", () => {
    const { routes } = buildVercelConfig(env);
    const appHeaders = matching(routes, "/hoje").find((r) => r.headers);
    expect(appHeaders?.continue).toBe(true);
    const h = appHeaders!.headers!;
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    const csp = h["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self' https://abcd.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://fonts.googleapis.com");
    expect(matching(routes, "/api/today").some((r) => r.headers)).toBe(false);
  });

  it("caches hashed assets immutably", () => {
    const { routes } = buildVercelConfig(env);
    const asset = matching(routes, "/assets/index-abc123.js").find((r) => r.headers?.["Cache-Control"]);
    expect(asset?.headers?.["Cache-Control"]).toBe("public, max-age=31536000, immutable");
  });

  it("allows cross-origin API calls in the CSP when VITE_API_BASE_URL is used instead of the rewrite", () => {
    const { routes } = buildVercelConfig({ ...env, VITE_API_BASE_URL: "https://api.example.com" });
    const csp = matching(routes, "/hoje").find((r) => r.headers)!.headers!["Content-Security-Policy"];
    expect(csp).toContain("https://api.example.com");
  });

  it("fails the build when the Worker origin or Supabase URL is missing", () => {
    expect(() => buildVercelConfig({ VITE_SUPABASE_URL: env.VITE_SUPABASE_URL })).toThrow(/API_ORIGIN/);
    expect(() => buildVercelConfig({ API_ORIGIN: env.API_ORIGIN })).toThrow(/VITE_SUPABASE_URL/);
  });
});
