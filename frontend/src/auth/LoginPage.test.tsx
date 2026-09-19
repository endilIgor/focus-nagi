import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { LoginPage } from "./LoginPage";
import { ThemeProvider } from "../theme/ThemeContext";

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  });
}

function renderLoginPage() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe("LoginPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a friendly message on invalid credentials", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) {
        return jsonResponse(401, { code: "UNAUTHENTICATED", message: "Authentication required.", timestamp: "now" });
      }
      if (url.includes("/api/auth/csrf")) {
        return jsonResponse(200, { token: "csrf-token", headerName: "X-XSRF-TOKEN", parameterName: "_csrf" });
      }
      if (url.includes("/api/auth/login")) {
        return jsonResponse(401, { code: "INVALID_CREDENTIALS", message: "Bad credentials", timestamp: "now" });
      }
      return jsonResponse(200, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLoginPage();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("USERNAME"), "owner");
    await user.type(screen.getByLabelText("PASSWORD"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /entrar na sessão/i }));

    await waitFor(() => {
      expect(screen.getByText("Usuário ou senha incorretos.")).toBeInTheDocument();
    });
  });

  it("announces the login error to screen readers via role=alert", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/csrf")) {
        return jsonResponse(200, { token: "csrf-token", headerName: "X-XSRF-TOKEN", parameterName: "_csrf" });
      }
      return jsonResponse(401, { code: "INVALID_CREDENTIALS", message: "Bad credentials", timestamp: "now" });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderLoginPage();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("USERNAME"), "owner");
    await user.type(screen.getByLabelText("PASSWORD"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /entrar na sessão/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Usuário ou senha incorretos.");
    });
  });

  it("requires username and password before submitting", async () => {
    const fetchMock = vi.fn(() => jsonResponse(401, { code: "UNAUTHENTICATED", message: "x", timestamp: "now" }));
    vi.stubGlobal("fetch", fetchMock);

    renderLoginPage();
    expect(screen.getByRole("heading", { level: 1, name: /acesse seu console/i })).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /entrar na sessão/i }) as HTMLButtonElement;
    const form = submit.closest("form")!;

    expect(form.checkValidity()).toBe(false);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
