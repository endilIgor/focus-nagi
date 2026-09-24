import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusSessionResponse } from "../api/types";

const mockSession: { current: FocusSessionResponse | null } = { current: null };
const mockNow = { current: Date.parse("2026-09-22T12:25:00Z") };

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));
vi.mock("../theme/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      acc: "#3B82F6",
      acc2: "#67E8F9",
      glow: "rgba(59,130,246,.3)",
      soft: "rgba(59,130,246,.12)",
    },
  }),
}));
vi.mock("../hooks/useClock", () => ({
  useClockTick: () => mockNow.current,
  formatClock: () => "09:25",
}));
vi.mock("../hooks/useFocusSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/useFocusSession")>();
  return {
    ...actual,
    useCurrentFocusSession: () => ({ data: mockSession.current }),
  };
});
vi.mock("../api/analytics", () => ({
  analyticsApi: {
    streaks: vi.fn().mockResolvedValue({ currentStreak: 0 }),
    byDay: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../api/focusSessions", () => ({
  focusSessionsApi: {
    finish: vi.fn(),
  },
}));
vi.mock("../utils/timerAlarm", () => ({
  playTimerAlarm: vi.fn().mockResolvedValue(undefined),
  primeTimerAlarm: vi.fn(),
}));

import { focusSessionsApi } from "../api/focusSessions";
import { AppShell } from "./AppShell";
import { playTimerAlarm } from "../utils/timerAlarm";

const mockedFinish = vi.mocked(focusSessionsApi.finish);
const mockedPlayAlarm = vi.mocked(playTimerAlarm);

function favicon(): HTMLLinkElement | null {
  return document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
}

function session(overrides: Partial<FocusSessionResponse> = {}): FocusSessionResponse {
  return {
    id: 41,
    taskId: null,
    projectId: null,
    startedAt: "2026-09-22T12:00:00Z",
    endedAt: null,
    plannedFocusMinutes: 25,
    plannedBreakMinutes: null,
    pausedSecondsAccum: 0,
    lastPausedAt: null,
    actualFocusSeconds: null,
    status: "RUNNING",
    notes: null,
    createdAt: "2026-09-22T12:00:00Z",
    ...overrides,
  };
}

function renderShell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/hoje"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/hoje" element={<div>Conteúdo de Hoje</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppShell global focus timer completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.head.querySelectorAll('link[rel="icon"]').forEach((link) => link.remove());
    mockNow.current = Date.parse("2026-09-22T12:25:00Z");
    mockSession.current = session();
    mockedFinish.mockResolvedValue(
      session({ status: "COMPLETED", endedAt: "2026-09-22T12:25:00Z", actualFocusSeconds: 1500 }),
    );
  });

  it("keeps the FN logo blue when there is no focus session", () => {
    mockSession.current = null;

    renderShell();

    expect(screen.getByText("FN")).toHaveAttribute("data-focus-state", "idle");
    expect(favicon()).toHaveAttribute("data-focus-state", "idle");
    expect(mockedFinish).not.toHaveBeenCalled();
  });

  it("shows only the simplified sections in navigation", () => {
    mockSession.current = null;
    renderShell();
    expect(screen.getByRole("link", { name: "Checklist" })).toHaveAttribute("href", "/checklist");
    for (const section of ["Tarefas", "Projetos", "Metas", "Notas"]) {
      expect(screen.queryByRole("link", { name: section })).not.toBeInTheDocument();
    }
  });

  it("turns the FN logo purple while a focus session is active", () => {
    mockNow.current = Date.parse("2026-09-22T12:01:00Z");

    renderShell();

    expect(screen.getByText("FN")).toHaveAttribute("data-focus-state", "focusing");
    expect(favicon()).toHaveAttribute("data-focus-state", "focusing");
    expect(favicon()?.href).toContain("%23A855F7");
    expect(mockedFinish).not.toHaveBeenCalled();
  });

  it("keeps the FN logo purple while a focus session is paused", () => {
    mockSession.current = session({
      status: "PAUSED",
      lastPausedAt: "2026-09-22T12:10:00Z",
    });

    renderShell();

    expect(screen.getByText("FN")).toHaveAttribute("data-focus-state", "focusing");
    expect(favicon()).toHaveAttribute("data-focus-state", "focusing");
    expect(favicon()?.href).toContain("%23A855F7");
    expect(mockedFinish).not.toHaveBeenCalled();
  });

  it("finishes and sends a browser notification while another app page is open", async () => {
    const browserNotification = vi.fn();
    Object.assign(browserNotification, {
      permission: "granted",
      requestPermission: vi.fn(),
    });
    vi.stubGlobal("Notification", browserNotification);

    renderShell();

    expect(screen.getByText("Conteúdo de Hoje")).toBeInTheDocument();
    await waitFor(() => expect(mockedFinish).toHaveBeenCalledWith(41));
    expect(browserNotification).toHaveBeenCalledWith(
      "Focus Nagi",
      expect.objectContaining({ body: expect.stringMatching(/sessão de foco concluída/i) }),
    );
    expect(mockedPlayAlarm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(/sessão de foco concluída/i);
    expect(screen.getByText("FN")).toHaveAttribute("data-focus-state", "completed");
    expect(favicon()).toHaveAttribute("data-focus-state", "completed");
    expect(favicon()?.href).toContain("%23D8D4E6");
  });

  it("surfaces an automatic-finish failure instead of silently leaving the timer stuck", async () => {
    mockedFinish.mockRejectedValueOnce(new Error("Conexão indisponível"));

    renderShell();

    expect(await screen.findByRole("alert")).toHaveTextContent(/conexão indisponível/i);
    expect(mockedFinish).toHaveBeenCalledTimes(1);
    expect(mockedPlayAlarm).not.toHaveBeenCalled();
  });
});
