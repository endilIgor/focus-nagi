import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AuthModule = typeof import("./auth");
type ClientModule = typeof import("./client");
let auth: AuthModule;
let clientApi: ClientModule;

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });
}

/** Routes fetch by URL and hands out a new CSRF token on every /api/auth/csrf call. */
function makeFetchRouter() {
  let csrfCounter = 0;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/api/auth/csrf")) {
      csrfCounter += 1;
      return jsonResponse(200, { token: `csrf-${csrfCounter}`, headerName: "X-XSRF-TOKEN", parameterName: "_csrf" });
    }
    if (url.includes("/api/auth/login")) {
      const body = JSON.parse(String(init?.body));
      if (body.password === "wrong") {
        return jsonResponse(401, { code: "INVALID_CREDENTIALS", message: "Invalid username or password.", timestamp: "now" });
      }
      return jsonResponse(200, { id: 1, username: body.username, createdAt: "now" });
    }
    if (url.includes("/api/auth/logout")) {
      return jsonResponse(204, null);
    }
    if (url.includes("/api/auth/password")) {
      return jsonResponse(204, null);
    }
    return jsonResponse(201, { id: 1 });
  });
  return { fetchMock, calls, csrfCount: () => csrfCounter };
}

describe("authApi CSRF sync", () => {
  beforeEach(async () => {
    vi.resetModules();
    auth = await import("./auth");
    clientApi = await import("./client");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("first mutation after a successful login uses the freshly synced CSRF token", async () => {
    const { fetchMock, calls } = makeFetchRouter();
    vi.stubGlobal("fetch", fetchMock);

    await auth.authApi.login({ username: "owner", password: "secret" });
    await clientApi.apiPost("/api/projects", { title: "p" });

    const urls = calls.map((c) => c.url);
    const loginIndex = urls.findIndex((u) => u.includes("/api/auth/login"));
    const refreshIndex = urls.findIndex((u, i) => i > loginIndex && u.includes("/api/auth/csrf"));
    const projectsIndex = urls.findIndex((u) => u.includes("/api/projects"));

    // login happened, then a CSRF re-sync, then the first mutation.
    expect(loginIndex).toBeGreaterThanOrEqual(0);
    expect(refreshIndex).toBeGreaterThan(loginIndex);
    expect(projectsIndex).toBeGreaterThan(refreshIndex);

    // the login request itself carried the pre-login token...
    const loginHeaders = calls[loginIndex].init?.headers as Record<string, string>;
    expect(loginHeaders["X-XSRF-TOKEN"]).toBe("csrf-1");
    // ...and the first mutation after login carries the renewed token, not the stale one.
    const projectHeaders = calls[projectsIndex].init?.headers as Record<string, string>;
    expect(projectHeaders["X-XSRF-TOKEN"]).toBe("csrf-2");
  });

  it("logout re-syncs the CSRF token so the next anonymous mutation does not reuse a stale one", async () => {
    const { fetchMock, calls, csrfCount } = makeFetchRouter();
    vi.stubGlobal("fetch", fetchMock);

    await auth.authApi.logout();
    await clientApi.apiPost("/api/auth/login", { username: "owner", password: "secret" });

    expect(csrfCount()).toBe(2);
    const urls = calls.map((c) => c.url);
    const logoutIndex = urls.findIndex((u) => u.includes("/api/auth/logout"));
    const refreshIndex = urls.findIndex((u, i) => i > logoutIndex && u.includes("/api/auth/csrf"));
    expect(refreshIndex).toBeGreaterThan(logoutIndex);
    const loginHeaders = calls[urls.findIndex((u) => u.includes("/api/auth/login"))].init?.headers as Record<string, string>;
    expect(loginHeaders["X-XSRF-TOKEN"]).toBe("csrf-2");
  });

  it("changePassword re-syncs the CSRF token", async () => {
    const { fetchMock, calls, csrfCount } = makeFetchRouter();
    vi.stubGlobal("fetch", fetchMock);

    await auth.authApi.changePassword({ currentPassword: "old", newPassword: "new-password" });
    await clientApi.apiPost("/api/projects", { title: "p" });

    expect(csrfCount()).toBe(2);
    const urls = calls.map((c) => c.url);
    const passwordIndex = urls.findIndex((u) => u.includes("/api/auth/password"));
    const refreshIndex = urls.findIndex((u, i) => i > passwordIndex && u.includes("/api/auth/csrf"));
    expect(refreshIndex).toBeGreaterThan(passwordIndex);
    const projectHeaders = calls[urls.findIndex((u) => u.includes("/api/projects"))].init?.headers as Record<string, string>;
    expect(projectHeaders["X-XSRF-TOKEN"]).toBe("csrf-2");
  });

  it("does not re-sync when login fails", async () => {
    const { fetchMock, csrfCount } = makeFetchRouter();
    vi.stubGlobal("fetch", fetchMock);

    await expect(auth.authApi.login({ username: "owner", password: "wrong" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect(csrfCount()).toBe(1);
  });
});
