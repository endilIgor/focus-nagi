import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, fake, supabaseModuleMock } from "../test/supabaseMock";

vi.mock("../api/supabase", () => supabaseModuleMock);

import { apiGet } from "../api/client";
import { AuthProvider, useAuth } from "./AuthContext";
import { RequireAuth } from "./RequireAuth";

function reply(status: number, body?: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
  });
}

function Owner() {
  const { owner } = useAuth();
  return <div>owner:{owner?.email}</div>;
}

function renderApp() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/hoje"]}>
        <Routes>
          <Route path="/login" element={<div>login screen</div>} />
          <Route
            path="/hoje"
            element={
              <RequireAuth>
                <Owner />
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const SESSION = { access_token: "stored-token", user: { id: "user-1", email: "owner@example.com" } };

describe("AuthProvider", () => {
  beforeEach(() => {
    fake.current = createFakeSupabase();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is anonymous without a stored Supabase session and never calls the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderApp();
    await waitFor(() => expect(screen.getByText("login screen")).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores a stored session after the Worker confirms it", async () => {
    fake.current.session = SESSION;
    const fetchMock = vi.fn(() => reply(200, { id: "user-1", email: "owner@example.com" }));
    vi.stubGlobal("fetch", fetchMock);
    renderApp();
    await waitFor(() => expect(screen.getByText("owner:owner@example.com")).toBeInTheDocument());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer stored-token");
  });

  it("drops a session the Worker refuses (e.g. not the allowed owner)", async () => {
    fake.current.session = SESSION;
    vi.stubGlobal("fetch", vi.fn(() => reply(403, { code: "ACCESS_DENIED", message: "Access denied.", timestamp: "t" })));
    renderApp();
    await waitFor(() => expect(screen.getByText("login screen")).toBeInTheDocument());
    expect(fake.current.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("returns to the login screen when any API call ends in 401", async () => {
    fake.current.session = SESSION;
    const fetchMock = vi.fn(() => reply(200, { id: "user-1", email: "owner@example.com" }));
    vi.stubGlobal("fetch", fetchMock);
    renderApp();
    await waitFor(() => expect(screen.getByText("owner:owner@example.com")).toBeInTheDocument());

    fetchMock.mockImplementation(() => reply(401, { code: "UNAUTHENTICATED", message: "x", timestamp: "t" }));
    await act(async () => {
      await apiGet("/api/today").catch(() => undefined);
    });
    await waitFor(() => expect(screen.getByText("login screen")).toBeInTheDocument());
    expect(fake.current.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("follows sign-outs from other tabs", async () => {
    fake.current.session = SESSION;
    vi.stubGlobal("fetch", vi.fn(() => reply(200, { id: "user-1", email: "owner@example.com" })));
    renderApp();
    await waitFor(() => expect(screen.getByText("owner:owner@example.com")).toBeInTheDocument());
    await act(async () => {
      await fake.current.auth.signOut();
    });
    await waitFor(() => expect(screen.getByText("login screen")).toBeInTheDocument());
  });
});
