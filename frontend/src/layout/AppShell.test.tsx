import { act, render, screen, waitFor, within } from "@testing-library/react";
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
  const { useQuery } = await import("@tanstack/react-query");
  return {
    ...actual,
    // Seeded from mockSession but backed by the real cache key, so writes made
    // by finish (setQueryData(current, null)) are reflected like in production.
    useCurrentFocusSession: () =>
      useQuery({
        queryKey: actual.CURRENT_FOCUS_SESSION_KEY,
        queryFn: async () => mockSession.current,
        initialData: mockSession.current,
        staleTime: Infinity,
      }),
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
    list: vi.fn(),
  },
}));
vi.mock("../utils/timerAlarm", () => ({
  playTimerAlarm: vi.fn().mockResolvedValue(undefined),
  primeTimerAlarm: vi.fn(),
}));

import { focusSessionsApi } from "../api/focusSessions";
import { AppShell } from "./AppShell";
import { CURRENT_FOCUS_SESSION_KEY } from "../hooks/useFocusSession";
import { playTimerAlarm } from "../utils/timerAlarm";
import type { Page } from "../api/types";

const mockedFinish = vi.mocked(focusSessionsApi.finish);
const mockedList = vi.mocked(focusSessionsApi.list);
const mockedPlayAlarm = vi.mocked(playTimerAlarm);

function page(content: FocusSessionResponse[]): Page<FocusSessionResponse> {
  return {
    content,
    totalElements: content.length,
    totalPages: 1,
    size: 1,
    number: 0,
    numberOfElements: content.length,
    first: true,
    last: true,
    empty: content.length === 0,
  };
}

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

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderShell(queryClient = newQueryClient()) {
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
    mockedList.mockResolvedValue(page([]));
  });

  it("keeps the triangular logo idle when there is no focus session", () => {
    mockSession.current = null;

    renderShell();

    expect(screen.getByTestId("brand-logo")).toHaveAttribute("data-focus-state", "idle");
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

  it("marks the triangular logo as focusing while a focus session is active", () => {
    mockNow.current = Date.parse("2026-09-22T12:01:00Z");

    renderShell();

    expect(screen.getByTestId("brand-logo")).toHaveAttribute("data-focus-state", "focusing");
    expect(favicon()).toHaveAttribute("data-focus-state", "focusing");
    expect(favicon()?.href).toContain("%23A855F7");
    expect(mockedFinish).not.toHaveBeenCalled();
  });

  it("keeps the triangular logo focusing while a focus session is paused", () => {
    mockSession.current = session({
      status: "PAUSED",
      lastPausedAt: "2026-09-22T12:10:00Z",
    });

    renderShell();

    expect(screen.getByTestId("brand-logo")).toHaveAttribute("data-focus-state", "focusing");
    expect(favicon()).toHaveAttribute("data-focus-state", "focusing");
    expect(favicon()?.href).toContain("%23A855F7");
    expect(mockedFinish).not.toHaveBeenCalled();
  });

  it("renders the floating header with the triangular brand, navigation, session status and logout in one bar", () => {
    mockSession.current = null;
    renderShell();

    const header = screen.getByRole("banner");
    const logo = within(header).getByTestId("brand-logo");
    expect(logo).toHaveAttribute("aria-hidden", "true");
    expect(logo).toHaveAttribute("data-shape", "triangle");
    expect(screen.queryByText("FN")).not.toBeInTheDocument();
    expect(within(header).getByText("Focus Nagi")).toBeInTheDocument();

    const nav = within(header).getByRole("navigation", { name: "Principal" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Hoje",
      "Foco",
      "Checklist",
      "Diário",
      "Analytics",
    ]);
    expect(within(nav).getByRole("link", { name: "Hoje" })).toHaveAttribute("aria-current", "page");
    expect(within(header).getByRole("timer", { name: "Tempo ocioso" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Sair" })).toBeInTheDocument();
  });

  it("mounts the decorative particle scene behind the shell without wrapping page content", () => {
    mockSession.current = null;
    renderShell();

    const scene = screen.getByTestId("particle-scene");
    expect(scene).toHaveAttribute("aria-hidden", "true");
    expect(scene.style.pointerEvents).toBe("none");
    expect(scene).not.toContainElement(screen.getByText("Conteúdo de Hoje"));
    expect(scene).not.toContainElement(screen.getByRole("banner"));
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
    expect(screen.getByTestId("brand-logo")).toHaveAttribute("data-focus-state", "completed");
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

describe("AppShell idle counter", () => {
  const lastCompleted = (endedAt: string, id = 30) =>
    session({ id, status: "COMPLETED", startedAt: "2026-09-22T10:00:00Z", endedAt, actualFocusSeconds: 1500 });

  beforeEach(() => {
    vi.clearAllMocks();
    mockNow.current = Date.parse("2026-09-22T12:25:00Z");
    mockSession.current = null;
    mockedList.mockResolvedValue(page([]));
  });

  it("shows time since endedAt of the last COMPLETED session (not the time of day), over one hour", async () => {
    mockedList.mockResolvedValue(page([lastCompleted("2026-09-22T11:00:00Z")]));

    renderShell();

    expect(screen.getByText("Ocioso")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("timer", { name: "Tempo ocioso" })).toHaveTextContent("01:25:00"));
    expect(mockedList).toHaveBeenCalledWith({ status: "COMPLETED", page: 0, size: 1 });
    expect(screen.queryByText("09:25")).not.toBeInTheDocument();
  });

  it("shows 00:00 without completed history", async () => {
    renderShell();

    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    expect(screen.getByRole("timer", { name: "Tempo ocioso" })).toHaveTextContent(/^00:00$/);
  });

  it.each([
    ["invalid", "não-é-data"],
    ["future", "2026-09-22T13:00:00Z"],
  ])("shows 00:00 for an %s endedAt, never NaN or negative", async (_label, endedAt) => {
    mockedList.mockResolvedValue(page([lastCompleted(endedAt)]));

    renderShell();

    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    const timer = screen.getByRole("timer", { name: "Tempo ocioso" });
    await waitFor(() => expect(timer).toHaveTextContent(/^00:00$/));
    expect(timer.textContent).not.toMatch(/NaN|-/);
  });

  it("continues from the server endedAt after remount/reload instead of restarting locally", async () => {
    mockedList.mockResolvedValue(page([lastCompleted("2026-09-22T11:00:00Z")]));
    const queryClient = newQueryClient();
    const first = renderShell(queryClient);
    await waitFor(() => expect(screen.getByRole("timer", { name: "Tempo ocioso" })).toHaveTextContent("01:25:00"));
    first.unmount();

    // Navigation remount sharing the cache.
    mockNow.current = Date.parse("2026-09-22T12:40:00Z");
    const second = renderShell(queryClient);
    await waitFor(() => expect(screen.getByRole("timer", { name: "Tempo ocioso" })).toHaveTextContent("01:40:00"));
    second.unmount();

    // Full reload: brand-new cache, base comes from the server again.
    mockNow.current = Date.parse("2026-09-22T12:41:05Z");
    renderShell();
    await waitFor(() => expect(screen.getByRole("timer", { name: "Tempo ocioso" })).toHaveTextContent("01:41:05"));
  });

  it("preserves the focus count while RUNNING", async () => {
    mockedList.mockResolvedValue(page([lastCompleted("2026-09-22T11:00:00Z")]));
    mockSession.current = session({ startedAt: "2026-09-22T12:00:00Z" });
    mockNow.current = Date.parse("2026-09-22T12:10:05Z");

    renderShell();

    expect(screen.getByText("Em foco")).toBeInTheDocument();
    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    expect(screen.getByRole("timer", { name: "Tempo de foco" })).toHaveTextContent("10:05");
    expect(screen.queryByRole("timer", { name: "Tempo ocioso" })).not.toBeInTheDocument();
  });

  it("preserves the frozen focus count while PAUSED", async () => {
    mockSession.current = session({
      startedAt: "2026-09-22T12:00:00Z",
      status: "PAUSED",
      pausedSecondsAccum: 60,
      lastPausedAt: "2026-09-22T12:06:00Z",
    });

    renderShell();

    expect(screen.getByText("Pausada")).toBeInTheDocument();
    // 6 min since start - 1 min previous pauses; the open pause does not count.
    expect(screen.getByRole("timer", { name: "Tempo de foco" })).toHaveTextContent("05:00");
  });

  it("auto finish moves the idle base immediately and a late history read cannot overwrite it", async () => {
    let resolveList!: (value: Page<FocusSessionResponse>) => void;
    mockedList.mockImplementationOnce(
      () => new Promise<Page<FocusSessionResponse>>((resolve) => (resolveList = resolve)),
    );
    mockSession.current = session({ startedAt: "2026-09-22T12:00:00Z", plannedFocusMinutes: 25 });
    mockedFinish.mockResolvedValue(
      session({ status: "COMPLETED", endedAt: "2026-09-22T12:24:30Z", actualFocusSeconds: 1470 }),
    );

    renderShell();

    await waitFor(() => expect(mockedFinish).toHaveBeenCalledWith(41));
    await waitFor(() => expect(screen.getByRole("timer", { name: "Tempo ocioso" })).toHaveTextContent("00:30"));

    await act(async () => {
      resolveList(page([lastCompleted("2026-09-22T10:00:00Z")]));
    });

    expect(screen.getByRole("timer", { name: "Tempo ocioso" })).toHaveTextContent("00:30");
    expect(mockedFinish).toHaveBeenCalledTimes(1);
  });

  it("after a cancel clears the session, returns to the time since the last COMPLETED session", async () => {
    mockedList.mockResolvedValue(page([lastCompleted("2026-09-22T11:00:00Z")]));
    mockSession.current = session({ startedAt: "2026-09-22T12:00:00Z" });
    mockNow.current = Date.parse("2026-09-22T12:10:00Z");
    const queryClient = newQueryClient();

    renderShell(queryClient);
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    // FocusPage's cancel writes null to the current-session cache and never touches the idle base.
    act(() => {
      queryClient.setQueryData(CURRENT_FOCUS_SESSION_KEY, null);
    });

    await waitFor(() => expect(screen.getByRole("timer", { name: "Tempo ocioso" })).toHaveTextContent("01:10:00"));
  });
});
