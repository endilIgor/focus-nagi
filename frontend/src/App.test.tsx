import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerResponse } from "./api/types";

const auth = vi.hoisted(() => ({ owner: null as OwnerResponse | null, status: "authenticated" }));
const pages = vi.hoisted(() => ({ training: vi.fn(), nutrition: vi.fn() }));
vi.mock("./auth/AuthContext", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ ...auth, retrySession: vi.fn() }),
}));
vi.mock("./theme/ThemeContext", () => ({ ThemeProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("./layout/AppShell", async () => {
  const { Outlet } = await import("react-router-dom");
  return { AppShell: () => <Outlet /> };
});
vi.mock("./pages/TrainingPage", () => ({ TrainingPage: () => { pages.training(); return <h1>Treino privado</h1>; } }));
vi.mock("./pages/NutritionPage", () => ({ NutritionPage: () => { pages.nutrition(); return <h1>Alimentação privada</h1>; } }));
vi.mock("./pages/TodayPage", () => ({ TodayPage: () => <h1>Hoje público autenticado</h1> }));
vi.mock("./pages/FocusPage", () => ({ FocusPage: () => <h1>Foco existente</h1> }));
vi.mock("./pages/ChecklistPage", () => ({ ChecklistPage: () => <h1>Checklist existente</h1> }));
vi.mock("./pages/JournalPage", () => ({ JournalPage: () => <h1>Diário existente</h1> }));
vi.mock("./pages/AnalyticsPage", () => ({ AnalyticsPage: () => <h1>Analytics existente</h1> }));
vi.mock("./auth/LoginPage", () => ({ LoginPage: () => <h1>Login existente</h1> }));
import { App } from "./App";

beforeEach(() => {
  vi.clearAllMocks();
  auth.owner = { id: "synthetic-owner", email: null, healthAccess: true };
  auth.status = "authenticated";
});

function open(path: string) {
  window.history.replaceState(null, "", path);
  return render(<App />);
}

describe("T13 — rotas privadas de saúde", () => {
  it.each([["/treino", "Treino privado"], ["/alimentacao", "Alimentação privada"]])("opens %s only for an enabled account", async (path, title) => {
    open(path);
    await waitFor(() => expect(screen.queryByRole("heading", { name: title })).not.toBeNull());
    expect(window.location.pathname).toBe(path);
  });

  it.each([false, undefined, "true", 1, null])("denies non-strict capability %s without mounting health pages", async (capability) => {
    auth.owner = { id: "blocked-owner", email: null, healthAccess: capability } as unknown as OwnerResponse;
    open("/treino");
    await screen.findByRole("heading", { name: "Hoje público autenticado" });
    expect(window.location.pathname).toBe("/hoje");
    expect(pages.training).not.toHaveBeenCalled();
    expect(pages.nutrition).not.toHaveBeenCalled();
  });

  it("denies a blocked account's direct nutrition URL", async () => {
    auth.owner!.healthAccess = false;
    open("/alimentacao");
    await screen.findByRole("heading", { name: "Hoje público autenticado" });
    expect(pages.nutrition).not.toHaveBeenCalled();
  });

  it.each(["/treino", "/alimentacao"])("redirects an anonymous direct request %s to login without mounting health pages", async (path) => {
    auth.status = "anonymous";
    auth.owner = null;
    open(path);
    await screen.findByRole("heading", { name: "Login existente" });
    expect(window.location.pathname).toBe("/login");
    expect(pages.training).not.toHaveBeenCalled();
    expect(pages.nutrition).not.toHaveBeenCalled();
  });

  it("drops the private page after capability revocation", async () => {
    const view = open("/treino");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Treino privado" })).not.toBeNull());
    auth.owner = { id: "another-owner", email: null, healthAccess: false };
    view.rerender(<App />);
    await screen.findByRole("heading", { name: "Hoje público autenticado" });
    expect(screen.queryByRole("heading", { name: "Treino privado" })).toBeNull();
  });

  it.each(["loading", "unavailable"])("does not mount health pages while auth is %s", (status) => {
    auth.status = status;
    open("/treino");
    expect(pages.training).not.toHaveBeenCalled();
    expect(pages.nutrition).not.toHaveBeenCalled();
  });

  it.each([["/analytics", "Analytics existente"], ["/foco", "Foco existente"], ["/diario", "Diário existente"], ["/tarefas", "Checklist existente"]])("preserves %s for accounts without health access", async (path, title) => {
    auth.owner!.healthAccess = false;
    open(path);
    await screen.findByRole("heading", { name: title });
  });
});
