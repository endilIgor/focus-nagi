import { describe, expect, it, vi } from "vitest";
import { PostgrestRpc, mapDatabaseError } from "../src/db";
import { ApiError } from "../src/errors";
import { TEST_ENV } from "./support/harness";

function response(status: number, body: string) {
  return new Response(body, { status, headers: { "Content-Type": "application/json" } });
}

describe("PostgrestRpc", () => {
  it("calls the RPC endpoint with the anon key and the caller's JWT", async () => {
    const fetcher = vi.fn(async () => response(200, JSON.stringify({ id: 1 })));
    const rpc = new PostgrestRpc({ ...TEST_ENV, SUPABASE_URL: "https://ref.supabase.co/" }, "user-jwt", fetcher);
    await expect(rpc.call("api_project_get", { p_id: 1 })).resolves.toEqual({ id: 1 });

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ref.supabase.co/rest/v1/rpc/api_project_get");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe("test-anon-key");
    expect(headers.Authorization).toBe("Bearer user-jwt");
    expect(init.body).toBe(JSON.stringify({ p_id: 1 }));
  });

  it("returns null for empty (void) responses", async () => {
    const rpc = new PostgrestRpc(TEST_ENV, "jwt", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(rpc.call("api_task_delete", { p_id: 1 })).resolves.toBeNull();
  });

  it("maps domain errors raised by SQL functions", async () => {
    const body = JSON.stringify({ code: "P0001", message: "INVALID_TASK_STATE", details: "Only a completed task can be reopened." });
    const rpc = new PostgrestRpc(TEST_ENV, "jwt", vi.fn(async () => response(400, body)));
    await expect(rpc.call("api_task_transition", {})).rejects.toMatchObject({
      status: 409,
      code: "INVALID_TASK_STATE",
      message: "Only a completed task can be reopened.",
    });
  });

  it("maps PostgREST JWT rejections to 401", async () => {
    const rpc = new PostgrestRpc(TEST_ENV, "jwt", vi.fn(async () => response(401, JSON.stringify({ code: "PGRST301", message: "JWT expired" }))));
    await expect(rpc.call("api_today", {})).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });

  it("hides unexpected database errors behind INTERNAL_ERROR", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rpc = new PostgrestRpc(TEST_ENV, "jwt", vi.fn(async () => response(400, JSON.stringify({ code: "42P01", message: 'relation "x" does not exist' }))));
    const err = await rpc.call("api_today", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 500, code: "INTERNAL_ERROR", message: "Unexpected server error." });
    spy.mockRestore();
  });

  it("reports transport failures and gateway errors as 502", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const down = new PostgrestRpc(TEST_ENV, "jwt", vi.fn(async () => Promise.reject(new TypeError("network"))));
    await expect(down.call("api_today", {})).rejects.toMatchObject({ status: 502, code: "UPSTREAM_UNAVAILABLE" });
    const gateway = new PostgrestRpc(TEST_ENV, "jwt", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 503 })));
    await expect(gateway.call("api_today", {})).rejects.toMatchObject({ status: 502 });
    spy.mockRestore();
  });

  it("refuses unexpected function names", async () => {
    const fetcher = vi.fn();
    const rpc = new PostgrestRpc(TEST_ENV, "jwt", fetcher);
    await expect(rpc.call("../auth/v1/admin", {})).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("mapDatabaseError", () => {
  it("maps constraint and input errors to client errors", () => {
    expect(mapDatabaseError({ code: "23514" })).toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(mapDatabaseError({ code: "22P02" })).toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(mapDatabaseError({ code: "23505" })).toMatchObject({ status: 409, code: "CONFLICT" });
    expect(mapDatabaseError({ code: "42501" })).toMatchObject({ status: 403, code: "ACCESS_DENIED" });
    expect(mapDatabaseError({ code: "P0001", message: "UNKNOWN_CODE" })).toMatchObject({ status: 500 });
    expect(mapDatabaseError({ code: "P0001", message: "TASK_NOT_FOUND", details: "" })).toMatchObject({
      status: 404,
      message: "Task not found.",
    });
  });
});
