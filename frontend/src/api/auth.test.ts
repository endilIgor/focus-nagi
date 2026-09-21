import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authError, createFakeSupabase, fake, supabaseModuleMock } from "../test/supabaseMock";

vi.mock("./supabase", () => supabaseModuleMock);

import { authApi } from "./auth";
import { ApiRequestError } from "./client";

function reply(status: number, body?: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
  });
}

describe("authApi (Supabase Auth)", () => {
  beforeEach(() => {
    fake.current = createFakeSupabase();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("signs in with Supabase and loads the owner from the Worker with the new token", async () => {
    const fetchMock = vi.fn(() => reply(200, { id: "user-1", email: "owner@example.com" }));
    vi.stubGlobal("fetch", fetchMock);

    const me = await authApi.login({ email: "owner@example.com", password: "secret" });

    expect(fake.current.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "secret",
    });
    expect(me).toEqual({ id: "user-1", email: "owner@example.com" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/me");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-for-owner@example.com");
  });

  it("maps invalid credentials to INVALID_CREDENTIALS without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fake.current.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: authError(400, "invalid_credentials", "Invalid login credentials"),
    } as never);

    const err = await authApi.login({ email: "owner@example.com", password: "wrong" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps Supabase rate limiting to LOGIN_LOCKED", async () => {
    fake.current.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: authError(429, "over_request_rate_limit"),
    } as never);
    await expect(authApi.login({ email: "a@b.c", password: "x" })).rejects.toMatchObject({ code: "LOGIN_LOCKED" });
  });

  it("signs out of the local session only", async () => {
    await authApi.logout();
    expect(fake.current.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("changes the password only after re-verifying the current one", async () => {
    fake.current.session = { access_token: "t", user: { id: "user-1", email: "owner@example.com" } };
    await authApi.changePassword({ currentPassword: "old-password", newPassword: "new-password-123" });
    expect(fake.current.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "old-password",
    });
    expect(fake.current.auth.updateUser).toHaveBeenCalledWith({ password: "new-password-123" });
  });

  it("rejects a wrong current password without updating", async () => {
    fake.current.session = { access_token: "t", user: { id: "user-1", email: "owner@example.com" } };
    fake.current.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: authError(400, "invalid_credentials"),
    } as never);
    await expect(
      authApi.changePassword({ currentPassword: "bad", newPassword: "new-password-123" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(fake.current.auth.updateUser).not.toHaveBeenCalled();
  });

  it("requires a session to change the password", async () => {
    await expect(
      authApi.changePassword({ currentPassword: "a", newPassword: "new-password-123" }),
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });
});
