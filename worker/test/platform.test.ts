import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./support/harness";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});

describe("platform behaviour", () => {
  it("serves an unauthenticated health check", async () => {
    const res = await h.request("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "UP" });
  });

  it("rejects protected routes without a bearer token using the API error envelope", async () => {
    const res = await h.request("/api/projects");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "UNAUTHENTICATED", message: "Authentication required." });
    expect(typeof res.body.timestamp).toBe("string");
  });

  it("rejects malformed authorization headers", async () => {
    const res = await h.request("/api/projects", { headers: { Authorization: "Basic abc" } });
    expect(res.status).toBe(401);
    const bad = await h.request("/api/projects", { headers: { Authorization: "Bearer not-a-valid-token" } });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe("UNAUTHENTICATED");
  });

  it("returns the current user from the verified token", async () => {
    const user = await h.newUser("owner@example.test");
    const res = await user.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: user.userId, email: "owner@example.test" });
  });

  it("returns a JSON 404 for unknown API routes", async () => {
    const user = await h.newUser();
    const res = await user.get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("returns a JSON 404 outside /api", async () => {
    const res = await h.request("/");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("rejects malformed JSON bodies", async () => {
    const user = await h.newUser();
    const res = await user.post("/api/projects", "{not json");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MALFORMED_REQUEST");
  });

  it("rejects non-numeric path ids", async () => {
    const user = await h.newUser();
    const res = await user.get("/api/projects/abc");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MALFORMED_REQUEST");
  });

  it("sets defensive security headers and disables caching on API responses", async () => {
    const res = await h.request("/api/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  it("emits no CORS headers when no origins are configured", async () => {
    const res = await h.request("/api/health", { headers: { Origin: "https://evil.example" } });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects oversized request bodies", async () => {
    const user = await h.newUser();
    const res = await user.post("/api/notes", { title: "x", content: "a".repeat(1_100_000) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("owner allowlist", () => {
  it("denies authenticated users that are not in ALLOWED_USER_IDS", async () => {
    const restricted = await createHarness({ ALLOWED_USER_IDS: "11111111-1111-4111-8111-111111111111" });
    const stranger = await restricted.newUser();
    const res = await stranger.get("/api/projects");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCESS_DENIED");
  });

  it("allows listed users", async () => {
    const restricted = await createHarness();
    const owner = await restricted.newUser();
    restricted.env.ALLOWED_USER_IDS = ` ${owner.userId} , 22222222-2222-4222-8222-222222222222`;
    const res = await owner.get("/api/auth/me");
    expect(res.status).toBe(200);
  });
});

describe("CORS allowlist", () => {
  it("answers preflight only for configured origins, without credentials", async () => {
    const c = await createHarness({ CORS_ALLOWED_ORIGINS: "https://app.example.com,https://*.evil.example,*" });
    const ok = await c.request("/api/projects", {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(ok.headers.get("access-control-allow-credentials")).toBeNull();
    expect(ok.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("authorization");

    const denied = await c.request("/api/projects", {
      method: "OPTIONS",
      headers: { Origin: "https://x.evil.example", "Access-Control-Request-Method": "POST" },
    });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });
});
