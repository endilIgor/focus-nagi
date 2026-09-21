import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tokens = vi.hoisted(() => ({
  getAccessToken: vi.fn<() => Promise<string | null>>(),
  refreshAccessToken: vi.fn<() => Promise<string | null>>(),
}));
vi.mock("./supabase", () => tokens);

import { ApiRequestError, apiDelete, apiGet, apiPost, setUnauthorizedHandler } from "./client";

function reply(status: number, body?: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
  });
}

describe("apiRequest", () => {
  beforeEach(() => {
    tokens.getAccessToken.mockResolvedValue("access-1");
    tokens.refreshAccessToken.mockResolvedValue("access-2");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setUnauthorizedHandler(null);
  });

  it("sends the Supabase access token as a Bearer credential on relative /api URLs", async () => {
    const fetchMock = vi.fn(() => reply(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiGet("/api/today", { page: 0, skip: undefined });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/today?page=0");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer access-1");
    expect(headers["X-XSRF-TOKEN"]).toBeUndefined();
    expect(init.credentials).toBe("omit");
  });

  it("serializes JSON bodies for mutations without any CSRF round trip", async () => {
    const fetchMock = vi.fn(() => reply(201, { id: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiPost("/api/tasks", { title: "x" })).resolves.toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ title: "x" }));
  });

  it("omits Authorization when there is no session", async () => {
    tokens.getAccessToken.mockResolvedValue(null);
    const fetchMock = vi.fn(() => reply(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await apiGet("/api/health");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("returns undefined for 204 responses", async () => {
    vi.stubGlobal("fetch", vi.fn(() => reply(204)));
    await expect(apiDelete("/api/notes/1")).resolves.toBeUndefined();
  });

  it("throws ApiRequestError with the parsed error envelope on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => reply(404, { code: "TASK_NOT_FOUND", message: "Tarefa não encontrada.", timestamp: "t" })),
    );
    const err = await apiGet("/api/tasks/999").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 404, code: "TASK_NOT_FOUND", message: "Tarefa não encontrada." });
  });

  it("refreshes the session once and retries after a 401", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => reply(401, { code: "UNAUTHENTICATED", message: "x", timestamp: "t" }))
      .mockImplementationOnce(() => reply(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(apiGet("/api/today")).resolves.toEqual({ ok: true });
    expect(tokens.refreshAccessToken).toHaveBeenCalledTimes(1);
    const [, retryInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe("Bearer access-2");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("signals the unauthorized handler when the retry is also rejected", async () => {
    const body = { code: "UNAUTHENTICATED", message: "Authentication required.", timestamp: "t" };
    vi.stubGlobal("fetch", vi.fn(() => reply(401, body)));
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    await expect(apiGet("/api/today")).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not retry when refreshing yields no session", async () => {
    tokens.refreshAccessToken.mockResolvedValue(null);
    const fetchMock = vi.fn(() => reply(401, { code: "UNAUTHENTICATED", message: "x", timestamp: "t" }));
    vi.stubGlobal("fetch", fetchMock);
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    await expect(apiGet("/api/today")).rejects.toBeInstanceOf(ApiRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("maps non-JSON gateway failures to a generic ApiRequestError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ status: 502, ok: false, text: () => Promise.resolve("<html>Bad gateway</html>") })),
    );
    await expect(apiGet("/api/today")).rejects.toMatchObject({ status: 502, code: "UNKNOWN" });
  });
});
