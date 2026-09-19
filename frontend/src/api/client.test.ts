import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ClientModule = typeof import("./client");
let client: ClientModule;

function mockFetchOnce(response: { status: number; body?: unknown }) {
  const body = response.body !== undefined ? JSON.stringify(response.body) : "";
  return vi.fn().mockResolvedValueOnce({
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    text: () => Promise.resolve(body),
  });
}

function mockCsrfFetch(token: string) {
  return vi.fn().mockResolvedValueOnce({
    status: 200,
    ok: true,
    json: () => Promise.resolve({ token, headerName: "X-XSRF-TOKEN", parameterName: "_csrf" }),
  });
}

describe("apiRequest", () => {
  beforeEach(async () => {
    // client.ts caches the CSRF token in module state; reload it so tests are isolated.
    vi.resetModules();
    client = await import("./client");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch a CSRF token for GET requests", async () => {
    const fetchMock = mockFetchOnce({ status: 200, body: { ok: true } });
    vi.stubGlobal("fetch", fetchMock);

    await client.apiGet("/api/today");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-XSRF-TOKEN"]).toBeUndefined();
    expect(init.credentials).toBe("include");
  });

  it("uses the token served by /api/auth/csrf even when a XSRF-TOKEN cookie exists", async () => {
    // Regression: the raw cookie value is rejected by Spring Security's XorCsrfTokenRequestAttributeHandler
    // (403 ACCESS_DENIED); only the masked token from the endpoint is accepted.
    document.cookie = "XSRF-TOKEN=raw-cookie-token; path=/;";
    const csrfFetch = mockCsrfFetch("masked-token");
    const postFetch = mockFetchOnce({ status: 201, body: { id: 1 } });
    const fetchMock = vi.fn().mockImplementationOnce(csrfFetch).mockImplementationOnce(postFetch);
    vi.stubGlobal("fetch", fetchMock);

    await client.apiPost("/api/tasks", { title: "x" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/csrf");
    const [, init] = fetchMock.mock.calls[1];
    expect(init.headers["X-XSRF-TOKEN"]).toBe("masked-token");
    expect(init.headers["X-XSRF-TOKEN"]).not.toBe("raw-cookie-token");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ title: "x" }));
    document.cookie = "XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  });

  it("reuses the cached CSRF token across mutations", async () => {
    const csrfFetch = mockCsrfFetch("masked-token");
    const postFetch = mockFetchOnce({ status: 201, body: { id: 1 } });
    const deleteFetch = mockFetchOnce({ status: 204 });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(csrfFetch)
      .mockImplementationOnce(postFetch)
      .mockImplementationOnce(deleteFetch);
    vi.stubGlobal("fetch", fetchMock);

    await client.apiPost("/api/tasks", { title: "x" });
    await client.apiDelete("/api/tasks/1");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, postInit] = fetchMock.mock.calls[1];
    const [, deleteInit] = fetchMock.mock.calls[2];
    expect(postInit.headers["X-XSRF-TOKEN"]).toBe("masked-token");
    expect(deleteInit.headers["X-XSRF-TOKEN"]).toBe("masked-token");
  });

  it("refreshCsrfToken renews the cached token for subsequent mutations", async () => {
    const firstCsrf = mockCsrfFetch("token-before");
    const postFetch = mockFetchOnce({ status: 200, body: { ok: true } });
    const secondCsrf = mockCsrfFetch("token-after");
    const projectFetch = mockFetchOnce({ status: 201, body: { id: 7 } });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(firstCsrf)
      .mockImplementationOnce(postFetch)
      .mockImplementationOnce(secondCsrf)
      .mockImplementationOnce(projectFetch);
    vi.stubGlobal("fetch", fetchMock);

    await client.apiPost("/api/auth/login", { username: "u", password: "p" });
    await client.refreshCsrfToken();
    await client.apiPost("/api/projects", { title: "p" });

    const [, loginInit] = fetchMock.mock.calls[1];
    const [, projectInit] = fetchMock.mock.calls[3];
    expect(loginInit.headers["X-XSRF-TOKEN"]).toBe("token-before");
    expect(projectInit.headers["X-XSRF-TOKEN"]).toBe("token-after");
  });

  it("returns undefined for 204 responses without parsing a body", async () => {
    const csrfFetch = mockCsrfFetch("masked-token");
    const deleteFetch = mockFetchOnce({ status: 204 });
    const fetchMock = vi.fn().mockImplementationOnce(csrfFetch).mockImplementationOnce(deleteFetch);
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.apiDelete("/api/notes/1")).resolves.toBeUndefined();
  });

  it("throws ApiRequestError with the parsed error envelope on failure", async () => {
    const fetchMock = mockFetchOnce({
      status: 404,
      body: { code: "TASK_NOT_FOUND", message: "Tarefa não encontrada.", timestamp: "2026-09-17T00:00:00Z" },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.apiGet("/api/tasks/999")).rejects.toMatchObject(
      new client.ApiRequestError(404, {
        code: "TASK_NOT_FOUND",
        message: "Tarefa não encontrada.",
        timestamp: "2026-09-17T00:00:00Z",
      }),
    );
  });
});
