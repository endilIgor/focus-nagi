import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiDelete, apiGet, apiPost, ApiRequestError } from "./client";

function mockFetchOnce(response: { status: number; body?: unknown }) {
  const body = response.body !== undefined ? JSON.stringify(response.body) : "";
  return vi.fn().mockResolvedValueOnce({
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    text: () => Promise.resolve(body),
  });
}

describe("apiRequest", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch a CSRF token for GET requests", async () => {
    const fetchMock = mockFetchOnce({ status: 200, body: { ok: true } });
    vi.stubGlobal("fetch", fetchMock);

    await apiGet("/api/today");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-XSRF-TOKEN"]).toBeUndefined();
    expect(init.credentials).toBe("include");
  });

  it("attaches the XSRF-TOKEN cookie value as a header on mutating requests", async () => {
    document.cookie = "XSRF-TOKEN=abc123; path=/;";
    const fetchMock = mockFetchOnce({ status: 201, body: { id: 1 } });
    vi.stubGlobal("fetch", fetchMock);

    await apiPost("/api/tasks", { title: "x" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-XSRF-TOKEN"]).toBe("abc123");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ title: "x" }));
  });

  it("fetches a fresh CSRF token when no cookie is present yet", async () => {
    const csrfFetch = vi.fn().mockResolvedValueOnce({
      json: () => Promise.resolve({ token: "fresh-token", headerName: "X-XSRF-TOKEN", parameterName: "_csrf" }),
    });
    const deleteFetch = mockFetchOnce({ status: 204 });
    const fetchMock = vi.fn().mockImplementationOnce(csrfFetch).mockImplementationOnce(deleteFetch);
    vi.stubGlobal("fetch", fetchMock);

    await apiDelete("/api/notes/1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/csrf");
    const [, deleteInit] = fetchMock.mock.calls[1];
    expect(deleteInit.headers["X-XSRF-TOKEN"]).toBe("fresh-token");
  });

  it("returns undefined for 204 responses without parsing a body", async () => {
    document.cookie = "XSRF-TOKEN=abc123; path=/;";
    const fetchMock = mockFetchOnce({ status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiDelete("/api/notes/1")).resolves.toBeUndefined();
  });

  it("throws ApiRequestError with the parsed error envelope on failure", async () => {
    const fetchMock = mockFetchOnce({
      status: 404,
      body: { code: "TASK_NOT_FOUND", message: "Tarefa não encontrada.", timestamp: "2026-09-17T00:00:00Z" },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiGet("/api/tasks/999")).rejects.toMatchObject(
      new ApiRequestError(404, { code: "TASK_NOT_FOUND", message: "Tarefa não encontrada.", timestamp: "2026-09-17T00:00:00Z" }),
    );
  });
});
