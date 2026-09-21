import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authError, createFakeSupabase, fake, supabaseModuleMock } from "../test/supabaseMock";

vi.mock("../api/supabase", () => supabaseModuleMock);

import { AuthProvider } from "./AuthContext";
import { LoginPage } from "./LoginPage";
import { ThemeProvider } from "../theme/ThemeContext";

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

function rejectCredentials() {
  fake.current.auth.signInWithPassword.mockResolvedValue({
    data: { session: null, user: null },
    error: authError(400, "invalid_credentials", "Invalid login credentials"),
  } as never);
}

describe("LoginPage", () => {
  beforeEach(() => {
    fake.current = createFakeSupabase();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a friendly message on invalid credentials", async () => {
    rejectCredentials();
    renderLoginPage();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-MAIL"), "owner@example.com");
    await user.type(screen.getByLabelText("PASSWORD"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /entrar na sessão/i }));

    await waitFor(() => {
      expect(screen.getByText("Usuário ou senha incorretos.")).toBeInTheDocument();
    });
    expect(fake.current.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "wrong-password",
    });
  });

  it("announces the login error to screen readers via role=alert", async () => {
    rejectCredentials();
    renderLoginPage();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-MAIL"), "owner@example.com");
    await user.type(screen.getByLabelText("PASSWORD"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /entrar na sessão/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Usuário ou senha incorretos.");
    });
  });

  it("requires e-mail and password before submitting", async () => {
    renderLoginPage();
    expect(screen.getByRole("heading", { level: 1, name: /acesse seu console/i })).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /entrar na sessão/i }) as HTMLButtonElement;
    const form = submit.closest("form")!;
    const email = screen.getByLabelText("E-MAIL") as HTMLInputElement;

    expect(email.type).toBe("email");
    expect(email.autocomplete).toBe("email");
    expect(form.checkValidity()).toBe(false);
    await waitFor(() => expect(fake.current.auth.getSession).toHaveBeenCalled());
    expect(fake.current.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
