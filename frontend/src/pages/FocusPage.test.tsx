import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/ThemeContext";
import type { FocusSessionResponse } from "../api/types";
import { CURRENT_FOCUS_SESSION_KEY, LAST_COMPLETED_FOCUS_SESSION_KEY } from "../hooks/useFocusSession";

let mockNow = Date.parse("2026-09-21T12:00:00Z");
vi.mock("../hooks/useClock", () => ({
  useClockTick: () => mockNow,
}));

vi.mock("../api/focusSessions", () => ({
  focusSessionsApi: {
    start: vi.fn(),
    current: vi.fn(),
    list: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    finish: vi.fn(),
    cancel: vi.fn(),
  },
}));
vi.mock("../api/tasks", () => ({ tasksApi: { list: vi.fn(), get: vi.fn() } }));
vi.mock("../api/projects", () => ({ projectsApi: { list: vi.fn(), get: vi.fn() } }));
vi.mock("../api/pagination", () => ({ fetchAllContent: vi.fn(async () => []) }));

import { focusSessionsApi } from "../api/focusSessions";
import { projectsApi } from "../api/projects";
import { tasksApi } from "../api/tasks";
import { FocusPage } from "./FocusPage";

const mockedApi = vi.mocked(focusSessionsApi);

function session(overrides: Partial<FocusSessionResponse> = {}): FocusSessionResponse {
  return {
    id: 1,
    taskId: null,
    projectId: null,
    startedAt: "2026-09-21T12:00:00Z",
    endedAt: null,
    plannedFocusMinutes: 25,
    plannedBreakMinutes: null,
    pausedSecondsAccum: 0,
    lastPausedAt: null,
    actualFocusSeconds: null,
    status: "RUNNING",
    notes: null,
    createdAt: "2026-09-21T12:00:00Z",
    ...overrides,
  };
}

const EMPTY_PAGE = {
  content: [],
  totalElements: 0,
  totalPages: 1,
  size: 8,
  number: 0,
  numberOfElements: 0,
  first: true,
  last: true,
  empty: true,
};

function makeUi(queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <FocusPage />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(makeUi(queryClient));
  return { queryClient, ...view, rerenderPage: () => view.rerender(makeUi(queryClient)) };
}

describe("FocusPage session actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    mockNow = Date.parse("2026-09-21T12:00:00Z");
    mockedApi.list.mockResolvedValue(EMPTY_PAGE);
  });

  it("finish updates controls immediately from the mutation response, without refetching the current session", async () => {
    const audioContext = vi.fn();
    vi.stubGlobal("AudioContext", audioContext);
    // The current-session endpoint keeps returning the stale RUNNING record,
    // so the UI can only update if the mutation response is written to cache.
    mockedApi.current.mockResolvedValue(session());
    mockedApi.finish.mockResolvedValue(
      session({ status: "COMPLETED", endedAt: "2026-09-21T12:25:00Z", actualFocusSeconds: 1500 }),
    );

    renderPage();
    await screen.findByRole("button", { name: "Finalizar" });

    await userEvent.click(screen.getByRole("button", { name: "Finalizar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar sessão" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Finalizar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pausar" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Pronta." })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(audioContext).not.toHaveBeenCalled();
    expect(mockedApi.current).toHaveBeenCalledTimes(1);
  });

  it("cancel clears controls immediately from the mutation response, without refetching the current session", async () => {
    mockedApi.current.mockResolvedValue(session());
    mockedApi.cancel.mockResolvedValue(
      session({ status: "CANCELLED", endedAt: "2026-09-21T12:25:00Z", actualFocusSeconds: 600 }),
    );

    renderPage();
    await screen.findByRole("button", { name: "Cancelar" });

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar sessão" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    expect(mockedApi.current).toHaveBeenCalledTimes(1);
  });

  it("pause updates status and controls immediately from the mutation response, without refetching", async () => {
    mockedApi.current.mockResolvedValue(session());
    mockedApi.pause.mockResolvedValue(
      session({ status: "PAUSED", pausedSecondsAccum: 30, lastPausedAt: "2026-09-21T12:00:30Z" }),
    );

    renderPage();
    await screen.findByRole("button", { name: "Pausar" });

    await userEvent.click(screen.getByRole("button", { name: "Pausar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Retomar" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Pausar" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Pausada." })).toBeInTheDocument();
    expect(mockedApi.current).toHaveBeenCalledTimes(1);
  });

  it("resume updates controls immediately from the mutation response, without refetching", async () => {
    mockedApi.current.mockResolvedValue(session());
    mockedApi.pause.mockResolvedValue(
      session({ status: "PAUSED", pausedSecondsAccum: 30, lastPausedAt: "2026-09-21T12:00:30Z" }),
    );
    mockedApi.resume.mockResolvedValue(session({ status: "RUNNING" }));

    renderPage();
    await screen.findByRole("button", { name: "Pausar" });
    await userEvent.click(screen.getByRole("button", { name: "Pausar" }));
    await screen.findByRole("button", { name: "Retomar" });

    await userEvent.click(screen.getByRole("button", { name: "Retomar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Retomar" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Em execução." })).toBeInTheDocument();
    expect(mockedApi.current).toHaveBeenCalledTimes(1);
  });

  it("start with the 60 MIN preset starts a 60-minute session and shows controls immediately, without refetching", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const browserNotification = vi.fn();
    Object.assign(browserNotification, { permission: "default", requestPermission });
    vi.stubGlobal("Notification", browserNotification);
    mockedApi.current.mockResolvedValue(undefined);
    mockedApi.start.mockResolvedValue(session({ id: 7, plannedFocusMinutes: 60 }));

    renderPage();
    await screen.findByRole("button", { name: "Iniciar sessão" });

    await userEvent.click(screen.getByRole("button", { name: /duração da sessão/i }));
    await userEvent.click(screen.getByRole("button", { name: "60 MIN" }));
    await userEvent.click(screen.getByRole("button", { name: "Iniciar sessão" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Finalizar" })).toBeInTheDocument());
    expect(mockedApi.start).toHaveBeenCalledWith(
      expect.objectContaining({ plannedFocusMinutes: 60 }),
    );
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(mockedApi.current).toHaveBeenCalledTimes(1);
  });

  it("starts a free session without exposing retired task and project selectors", async () => {
    mockedApi.current.mockResolvedValue(undefined);
    mockedApi.start.mockResolvedValue(session());
    renderPage();
    await screen.findByRole("button", { name: "Iniciar sessão" });
    expect(screen.queryByText("TAREFA")).not.toBeInTheDocument();
    expect(screen.queryByText("PROJETO")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Iniciar sessão" }));
    await waitFor(() => expect(mockedApi.start).toHaveBeenCalledWith(expect.objectContaining({ taskId: null, projectId: null })));
  });

  it("disables every session action button while finish is pending, keeping one request", async () => {
    let resolveFinish!: (value: FocusSessionResponse) => void;
    mockedApi.current.mockResolvedValue(session());
    mockedApi.finish.mockImplementation(
      () => new Promise<FocusSessionResponse>((resolve) => (resolveFinish = resolve)),
    );

    renderPage();
    const finishBtn = await screen.findByRole("button", { name: "Finalizar" });
    const cancelBtn = screen.getByRole("button", { name: "Cancelar" });
    const pauseBtn = screen.getByRole("button", { name: "Pausar" });

    await userEvent.click(finishBtn);
    await waitFor(() => expect(finishBtn).toBeDisabled());

    // While finish is in flight no other session action may fire.
    expect(cancelBtn).toBeDisabled();
    expect(pauseBtn).toBeDisabled();
    await userEvent.click(cancelBtn);

    resolveFinish(session({ status: "COMPLETED", endedAt: "2026-09-21T12:25:00Z", actualFocusSeconds: 1500 }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar sessão" })).toBeInTheDocument());
    expect(mockedApi.finish).toHaveBeenCalledTimes(1);
    expect(mockedApi.cancel).not.toHaveBeenCalled();
  });
});

describe("FocusPage current-session polling race", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockNow = Date.parse("2026-09-21T12:00:00Z");
    mockedApi.list.mockResolvedValue(EMPTY_PAGE);
  });

  it("a stale in-flight current() poll resolving after finish cannot overwrite the cleared session", async () => {
    let resolvePoll!: (value: FocusSessionResponse | undefined) => void;
    mockedApi.current
      // mount fetch: session is active
      .mockResolvedValueOnce(session())
      // background poll stays in flight until the test resolves it
      .mockImplementationOnce(
        () => new Promise<FocusSessionResponse | undefined>((resolve) => (resolvePoll = resolve)),
      )
      .mockResolvedValue(undefined);

    mockedApi.finish.mockResolvedValue(
      session({ status: "COMPLETED", endedAt: "2026-09-21T12:25:00Z", actualFocusSeconds: 1500 }),
    );

    const { queryClient } = renderPage();
    await screen.findByRole("button", { name: "Finalizar" });

    // Start a deterministic background poll and leave it in flight.
    let pollPromise!: Promise<void>;
    act(() => {
      pollPromise = queryClient.invalidateQueries({ queryKey: CURRENT_FOCUS_SESSION_KEY });
    });
    await waitFor(() => expect(mockedApi.current).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole("button", { name: "Finalizar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar sessão" })).toBeInTheDocument());

    // The stale poll resolves late with the old RUNNING session; it must be ignored.
    await act(async () => {
      resolvePoll(session());
      await pollPromise;
    });

    expect(screen.getByRole("button", { name: "Iniciar sessão" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalizar" })).not.toBeInTheDocument();
    expect(mockedApi.current).toHaveBeenCalledTimes(2);
  });
});

describe("FocusPage idle base (last COMPLETED session)", () => {
  const oldCompleted = session({ id: 0, status: "COMPLETED", startedAt: "2026-09-21T08:00:00Z", endedAt: "2026-09-21T08:25:00Z" });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    mockNow = Date.parse("2026-09-21T12:00:00Z");
    mockedApi.list.mockResolvedValue(EMPTY_PAGE);
  });

  it("manual finish writes the finish response as idle base immediately, cancelling an in-flight read", async () => {
    const finished = session({ status: "COMPLETED", endedAt: "2026-09-21T12:25:00Z", actualFocusSeconds: 1500 });
    mockedApi.current.mockResolvedValue(session());
    mockedApi.finish.mockResolvedValue(finished);

    const { queryClient } = renderPage();
    await screen.findByRole("button", { name: "Finalizar" });

    let resolveRead!: (value: FocusSessionResponse | null) => void;
    let inFlight!: Promise<void>;
    act(() => {
      inFlight = queryClient.prefetchQuery({
        queryKey: LAST_COMPLETED_FOCUS_SESSION_KEY,
        queryFn: () => new Promise<FocusSessionResponse | null>((resolve) => (resolveRead = resolve)),
      });
    });

    await userEvent.click(screen.getByRole("button", { name: "Finalizar" }));
    await waitFor(() => expect(queryClient.getQueryData(LAST_COMPLETED_FOCUS_SESSION_KEY)).toEqual(finished));

    await act(async () => {
      resolveRead(oldCompleted);
      await inFlight;
    });
    expect(queryClient.getQueryData(LAST_COMPLETED_FOCUS_SESSION_KEY)).toEqual(finished);
  });

  it("cancel never moves the idle base", async () => {
    mockedApi.current.mockResolvedValue(session());
    mockedApi.cancel.mockResolvedValue(
      session({ status: "CANCELLED", endedAt: "2026-09-21T12:10:00Z", actualFocusSeconds: 600 }),
    );

    const { queryClient } = renderPage();
    queryClient.setQueryData(LAST_COMPLETED_FOCUS_SESSION_KEY, oldCompleted);
    await screen.findByRole("button", { name: "Cancelar" });

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar sessão" })).toBeInTheDocument());

    expect(queryClient.getQueryData(LAST_COMPLETED_FOCUS_SESSION_KEY)).toEqual(oldCompleted);
    expect(queryClient.getQueryState(LAST_COMPLETED_FOCUS_SESSION_KEY)?.isInvalidated).toBe(false);
    expect(mockedApi.list).not.toHaveBeenCalledWith(expect.objectContaining({ status: "COMPLETED" }));
  });
});

describe("FocusPage duration menu", () => {
  const durationTrigger = () => screen.getByRole("button", { name: /duração da sessão/i });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    mockNow = Date.parse("2026-09-21T12:00:00Z");
    mockedApi.list.mockResolvedValue(EMPTY_PAGE);
  });

  it("replaces the always-visible presets with a compact menu defaulting to 50 minutes", async () => {
    mockedApi.current.mockResolvedValue(undefined);
    mockedApi.start.mockResolvedValue(session({ plannedFocusMinutes: 50 }));

    renderPage();
    await screen.findByRole("button", { name: "Iniciar sessão" });
    expect(durationTrigger()).toHaveAccessibleName("Duração da sessão: 50 MIN");
    expect(screen.queryByRole("button", { name: "25 MIN" })).not.toBeInTheDocument();
    expect(screen.getByText("50:00")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Iniciar sessão" }));
    await waitFor(() =>
      expect(mockedApi.start).toHaveBeenCalledWith(expect.objectContaining({ plannedFocusMinutes: 50 })),
    );
  });

  it("a custom duration updates the timer and the start payload", async () => {
    mockedApi.current.mockResolvedValue(undefined);
    mockedApi.start.mockResolvedValue(session({ plannedFocusMinutes: 75 }));

    renderPage();
    await screen.findByRole("button", { name: "Iniciar sessão" });
    await userEvent.click(durationTrigger());
    await userEvent.type(screen.getByLabelText("Minutos personalizados"), "75");
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));

    expect(durationTrigger()).toHaveAccessibleName("Duração da sessão: 75 MIN");
    expect(screen.getByText("75:00")).toBeInTheDocument();
    expect(screen.getByText("Planejado 75 min · pausas 0 min")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Iniciar sessão" }));
    await waitFor(() => expect(mockedApi.start).toHaveBeenCalledTimes(1));
    expect(mockedApi.start).toHaveBeenCalledWith(expect.objectContaining({ plannedFocusMinutes: 75 }));
  });

  it("an invalid custom duration never reaches the start payload", async () => {
    mockedApi.current.mockResolvedValue(undefined);
    mockedApi.start.mockResolvedValue(session({ plannedFocusMinutes: 50 }));

    renderPage();
    await screen.findByRole("button", { name: "Iniciar sessão" });
    await userEvent.click(durationTrigger());
    await userEvent.type(screen.getByLabelText("Minutos personalizados"), "1441");
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByText("Informe um número inteiro de 1 a 1440 minutos.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "Iniciar sessão" }));
    await waitFor(() => expect(mockedApi.start).toHaveBeenCalledTimes(1));
    expect(mockedApi.start).toHaveBeenCalledWith(expect.objectContaining({ plannedFocusMinutes: 50 }));
  });

  it("blocks duration changes while the start request is pending", async () => {
    let resolveStart!: (value: FocusSessionResponse) => void;
    mockedApi.current.mockResolvedValue(undefined);
    mockedApi.start.mockImplementation(
      () => new Promise<FocusSessionResponse>((resolve) => (resolveStart = resolve)),
    );

    renderPage();
    await screen.findByRole("button", { name: "Iniciar sessão" });
    await userEvent.click(screen.getByRole("button", { name: "Iniciar sessão" }));
    await screen.findByRole("button", { name: "Iniciando..." });

    expect(durationTrigger()).toBeDisabled();
    await userEvent.click(durationTrigger());
    expect(screen.queryByRole("dialog", { name: "Duração da sessão" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "25 MIN" })).not.toBeInTheDocument();

    await act(async () => resolveStart(session({ plannedFocusMinutes: 50 })));
    await screen.findByRole("button", { name: "Finalizar" });
    expect(mockedApi.start).toHaveBeenCalledTimes(1);
  });

  it.each(["RUNNING", "PAUSED"] as const)("blocks duration changes during a %s session", async (status) => {
    mockedApi.current.mockResolvedValue(
      session({ status, lastPausedAt: status === "PAUSED" ? "2026-09-21T12:00:00Z" : null }),
    );

    renderPage();
    await screen.findByRole("button", { name: "Finalizar" });
    expect(durationTrigger()).toBeDisabled();
    expect(durationTrigger()).toHaveAccessibleName("Duração da sessão: 25 MIN");
    await userEvent.click(durationTrigger());
    expect(screen.queryByRole("dialog", { name: "Duração da sessão" })).not.toBeInTheDocument();
  });

  it("closes an open menu when a session becomes active", async () => {
    mockedApi.current.mockResolvedValue(undefined);
    const { queryClient } = renderPage();
    await screen.findByRole("button", { name: "Iniciar sessão" });
    await userEvent.click(durationTrigger());
    expect(screen.getByRole("dialog", { name: "Duração da sessão" })).toBeInTheDocument();

    act(() => {
      queryClient.setQueryData(CURRENT_FOCUS_SESSION_KEY, session({ plannedFocusMinutes: 25 }));
    });

    await screen.findByRole("button", { name: "Finalizar" });
    expect(screen.queryByRole("dialog", { name: "Duração da sessão" })).not.toBeInTheDocument();
    expect(durationTrigger()).toBeDisabled();
  });
});

describe("FocusPage v3 composition", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    mockNow = Date.parse("2026-09-21T12:00:00Z");
    mockedApi.list.mockResolvedValue(EMPTY_PAGE);
  });

  it("centres the remaining time inside a single ring particle anchor that carries the real progress", async () => {
    mockNow = Date.parse("2026-09-21T12:10:00Z");
    mockedApi.current.mockResolvedValue(session({ plannedFocusMinutes: 25 }));

    const { container } = renderPage();
    await screen.findByRole("button", { name: "Finalizar" });
    const anchors = container.querySelectorAll<HTMLElement>("[data-particle-anchor]");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toHaveAttribute("data-shape", "ring");
    expect(anchors[0]).toHaveAttribute("data-progress", "0.4");
    expect(anchors[0]).toHaveAttribute("data-running", "true");
    expect(within(anchors[0]).getByText("15:00")).toBeInTheDocument();
    expect(within(anchors[0]).getByText("Restante · 40% concluído")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Em execução." })).toBeInTheDocument();
    expect(screen.queryByTestId("particle-scene")).not.toBeInTheDocument();
  });

  it("keeps the ring idle with the selected block when there is no session", async () => {
    mockedApi.current.mockResolvedValue(undefined);

    const { container } = renderPage();
    await screen.findByRole("button", { name: "Iniciar sessão" });
    const anchor = container.querySelector<HTMLElement>("[data-particle-anchor]")!;
    expect(anchor).toHaveAttribute("data-shape", "ring");
    expect(anchor).toHaveAttribute("data-progress", "0");
    expect(anchor).toHaveAttribute("data-running", "false");
    expect(within(anchor).getByText("50:00")).toBeInTheDocument();
    expect(within(anchor).getByText("Selecione um bloco e inicie")).toBeInTheDocument();
    expect(screen.getByText("Câmara de foco")).toBeInTheDocument();
    expect(screen.getByLabelText("Notas da sessão")).toBeInTheDocument();
  });

  it("stops the ring motion while the session is paused", async () => {
    mockNow = Date.parse("2026-09-21T12:10:00Z");
    mockedApi.current.mockResolvedValue(
      session({ status: "PAUSED", lastPausedAt: "2026-09-21T12:05:00Z" }),
    );

    const { container } = renderPage();
    await screen.findByRole("button", { name: "Retomar" });
    const anchor = container.querySelector<HTMLElement>("[data-particle-anchor]")!;
    expect(anchor).toHaveAttribute("data-running", "false");
    expect(anchor).toHaveAttribute("data-progress", "0.2");
  });

  it("lists the real history under the Histórico heading with status and pagination", async () => {
    mockedApi.current.mockResolvedValue(undefined);
    mockedApi.list.mockResolvedValue({
      ...EMPTY_PAGE,
      content: [
        session({ id: 11, status: "COMPLETED", endedAt: "2026-09-21T12:25:00Z", actualFocusSeconds: 1500 }),
        session({ id: 12, taskId: 42, status: "CANCELLED", endedAt: "2026-09-21T11:10:00Z", actualFocusSeconds: 600 }),
      ],
      totalElements: 9,
      totalPages: 2,
      numberOfElements: 2,
      first: true,
      last: false,
      empty: false,
    });

    renderPage();
    const history = await screen.findByRole("region", { name: "Histórico" });
    expect(within(history).getByRole("heading", { level: 2, name: "Histórico" })).toBeInTheDocument();
    expect(await within(history).findByText("9 sessões")).toBeInTheDocument();
    const rows = within(history).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Sessão livre")).toBeInTheDocument();
    expect(within(rows[0]).getByText("25 min")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Concluída")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Tarefa #42")).toBeInTheDocument();
    expect(within(rows[1]).getByText("10 min")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Cancelada")).toBeInTheDocument();

    await userEvent.click(within(history).getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(mockedApi.list).toHaveBeenCalledWith({ page: 1, size: 8 }));
  });

  it("shows the linked task, project and notes of the active session", async () => {
    vi.mocked(tasksApi.get).mockResolvedValue({ id: 3, title: "Revisar worker" } as never);
    vi.mocked(projectsApi.get).mockResolvedValue({ id: 4, title: "Projeto Vega" } as never);
    mockedApi.current.mockResolvedValue(session({ taskId: 3, projectId: 4, notes: "Fechar o PR" }));

    renderPage();
    await screen.findByRole("button", { name: "Finalizar" });
    expect(await screen.findByText("Revisar worker")).toBeInTheDocument();
    expect(await screen.findByText("Projeto Vega")).toBeInTheDocument();
    expect(screen.getByText("Fechar o PR")).toBeInTheDocument();
    expect(screen.queryByLabelText("Notas da sessão")).not.toBeInTheDocument();
  });
});

describe("FocusPage timer display", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    mockNow = Date.parse("2026-09-21T12:00:00Z");
    mockedApi.list.mockResolvedValue(EMPTY_PAGE);
  });

  it("stops at zero without showing overtime while global completion runs", async () => {
    const startedAt = "2026-09-21T12:00:00Z";
    mockNow = Date.parse(startedAt) + 25 * 60 * 1000;
    mockedApi.current.mockResolvedValue(session({ startedAt, plannedFocusMinutes: 25 }));

    renderPage();
    await screen.findByRole("button", { name: "Finalizar" });
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.queryByText("TEMPO EXTRA")).not.toBeInTheDocument();
  });
});
