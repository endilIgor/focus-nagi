import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/ThemeContext";
import type { FocusSessionResponse } from "../api/types";
import { CURRENT_FOCUS_SESSION_KEY } from "../hooks/useFocusSession";

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
    mockNow = Date.parse("2026-09-21T12:00:00Z");
    mockedApi.list.mockResolvedValue(EMPTY_PAGE);
  });

  it("finish updates controls immediately from the mutation response, without refetching the current session", async () => {
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
    expect(screen.getByText("PRONTA")).toBeInTheDocument();
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
    expect(screen.getByText("PAUSADA")).toBeInTheDocument();
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
    expect(screen.getByText("EM EXECUÇÃO")).toBeInTheDocument();
    expect(mockedApi.current).toHaveBeenCalledTimes(1);
  });

  it("start with the 60 MIN preset starts a 60-minute session and shows controls immediately, without refetching", async () => {
    mockedApi.current.mockResolvedValue(undefined);
    mockedApi.start.mockResolvedValue(session({ id: 7, plannedFocusMinutes: 60 }));

    renderPage();
    await screen.findByRole("button", { name: "Iniciar sessão" });

    await userEvent.click(screen.getByRole("button", { name: "60 MIN" }));
    await userEvent.click(screen.getByRole("button", { name: "Iniciar sessão" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Finalizar" })).toBeInTheDocument());
    expect(mockedApi.start).toHaveBeenCalledWith(
      expect.objectContaining({ plannedFocusMinutes: 60 }),
    );
    expect(mockedApi.current).toHaveBeenCalledTimes(1);
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

describe("FocusPage one-minute countdown notice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockNow = Date.parse("2026-09-21T12:00:00Z");
    mockedApi.list.mockResolvedValue(EMPTY_PAGE);
  });

  it("shows an accessible notice exactly once when the session crosses into the final minute", async () => {
    const startedAt = "2026-09-21T12:00:00Z";
    mockNow = Date.parse(startedAt) + (25 * 60 - 61) * 1000; // 61s remaining
    mockedApi.current.mockResolvedValue(session({ startedAt, plannedFocusMinutes: 25 }));

    const { rerenderPage } = renderPage();
    await screen.findByRole("button", { name: "Finalizar" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    act(() => {
      mockNow += 1000; // 60s remaining — crossing
      rerenderPage();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/resta 1 minuto/i);

    // Further ticks inside the window do not stack duplicate notices.
    for (let i = 0; i < 3; i++) {
      act(() => {
        mockNow += 1000;
        rerenderPage();
      });
    }
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("hides the notice when the session is paused", async () => {
    const startedAt = "2026-09-21T12:00:00Z";
    mockNow = Date.parse(startedAt) + (25 * 60 - 61) * 1000; // 61s remaining
    mockedApi.current.mockResolvedValue(session({ startedAt, plannedFocusMinutes: 25 }));
    mockedApi.pause.mockResolvedValue(
      session({ status: "PAUSED", pausedSecondsAccum: 1430, lastPausedAt: "2026-09-21T12:23:50Z" }),
    );

    const { rerenderPage } = renderPage();
    await screen.findByRole("button", { name: "Finalizar" });

    act(() => {
      mockNow += 1000; // 60s remaining — notice appears
      rerenderPage();
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Pausar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retomar" })).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
