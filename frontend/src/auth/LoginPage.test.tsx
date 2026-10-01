import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

/** AuthProvider resolves the stored session on mount; let that state update settle inside act. */
async function waitForAuthBootstrap() {
  await waitFor(() => expect(fake.current.auth.getSession).toHaveBeenCalled());
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
    await user.type(screen.getByLabelText("E-mail"), "owner@example.com");
    await user.type(screen.getByLabelText("Senha"), "wrong-password");
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
    await user.type(screen.getByLabelText("E-mail"), "owner@example.com");
    await user.type(screen.getByLabelText("Senha"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /entrar na sessão/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Usuário ou senha incorretos.");
    });
    // A failed attempt releases the submit button for a retry.
    expect(screen.getByRole("button", { name: /entrar na sessão/i })).toBeEnabled();
  });

  it("requires e-mail and password before submitting", async () => {
    renderLoginPage();
    expect(screen.getByRole("heading", { level: 2, name: /acesse seu console/i })).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /entrar na sessão/i }) as HTMLButtonElement;
    const form = submit.closest("form")!;
    const email = screen.getByLabelText("E-mail") as HTMLInputElement;
    const password = screen.getByLabelText("Senha") as HTMLInputElement;

    expect(email.type).toBe("email");
    expect(email.autocomplete).toBe("email");
    expect(email.required).toBe(true);
    expect(password.type).toBe("password");
    expect(password.autocomplete).toBe("current-password");
    expect(password.required).toBe(true);
    expect(form.checkValidity()).toBe(false);
    await waitFor(() => expect(fake.current.auth.getSession).toHaveBeenCalled());
    expect(fake.current.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("shows the large Focus Nagi headline outside the glass authentication card", async () => {
    renderLoginPage();
    await waitForAuthBootstrap();

    const headline = screen.getByRole("heading", { level: 1, name: "Focus Nagi" });
    const card = screen.getByRole("form", { name: /acesse seu console/i });
    expect(card).not.toContainElement(headline);
    expect(within(card).getByRole("heading", { level: 2, name: /acesse seu console/i })).toBeInTheDocument();
    expect(within(card).getByLabelText("E-mail")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /entrar na sessão/i })).toBeInTheDocument();
    expect(screen.getByText("Sem cadastro público. Acesso restrito ao owner.")).toBeInTheDocument();
  });

  it("keeps the Senha label accessible and hides the Supabase Auth hint from assistive tech", async () => {
    renderLoginPage();
    await waitForAuthBootstrap();

    const password = screen.getByLabelText("Senha");
    expect(password).toHaveAccessibleName("Senha");
    expect(screen.getByText("Supabase Auth")).toHaveAttribute("aria-hidden", "true");
  });

  it("blocks duplicate submissions while the login request is pending", async () => {
    let resolveSignIn!: (value: unknown) => void;
    fake.current.auth.signInWithPassword.mockImplementation(
      () => new Promise((resolve) => (resolveSignIn = resolve)) as never,
    );
    renderLoginPage();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "owner@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret-password");
    const form = screen.getByRole("form", { name: /acesse seu console/i });

    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(fake.current.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    const pending = screen.getByRole("button", { name: /entrando/i });
    expect(pending).toBeDisabled();
    expect(form).toHaveAttribute("aria-busy", "true");

    resolveSignIn({
      data: { session: null, user: null },
      error: authError(400, "invalid_credentials", "Invalid login credentials"),
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Usuário ou senha incorretos."));
    expect(fake.current.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("anchors the decorative particle robot behind the card and turns it into a ring while signing in", async () => {
    let resolveSignIn!: (value: unknown) => void;
    fake.current.auth.signInWithPassword.mockImplementation(
      () => new Promise((resolve) => (resolveSignIn = resolve)) as never,
    );
    const { container } = renderLoginPage();

    const scene = screen.getByTestId("particle-scene");
    expect(scene).toHaveAttribute("aria-hidden", "true");
    const anchor = container.querySelector<HTMLElement>("[data-particle-anchor]");
    expect(anchor).not.toBeNull();
    expect(anchor).toHaveAttribute("aria-hidden", "true");
    expect(anchor).toHaveAttribute("data-shape", "cloud");
    expect(anchor).not.toContainElement(screen.getByLabelText("Senha"));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "owner@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret-password");
    await user.click(screen.getByRole("button", { name: /entrar na sessão/i }));

    expect(anchor).toHaveAttribute("data-shape", "ring");
    expect(anchor).toHaveAttribute("data-running", "true");

    resolveSignIn({
      data: { session: null, user: null },
      error: authError(400, "invalid_credentials", "Invalid login credentials"),
    });
    await waitFor(() => expect(anchor).toHaveAttribute("data-shape", "cloud"));
  });
});
