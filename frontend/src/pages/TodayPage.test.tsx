import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/ThemeContext";
import { todayIso } from "../utils/date";
import type { FocusSessionResponse } from "../api/types";

const activeSession = vi.hoisted(() => ({ current: null as FocusSessionResponse | null }));

vi.mock("../api/checklist", () => ({ checklistApi: { byDate: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }));
vi.mock("../api/today", () => ({ todayApi: { get: vi.fn() } }));
vi.mock("../api/analytics", () => ({ analyticsApi: { streaks: vi.fn(), byDay: vi.fn() } }));
vi.mock("../hooks/useFocusSession", () => ({ useCurrentFocusSession: () => ({ data: activeSession.current }), computeElapsedSeconds: () => 0 }));
vi.mock("../api/tasks", () => ({ tasksApi: { get: vi.fn() } }));
vi.mock("../api/projects", () => ({ projectsApi: { get: vi.fn(), focus: vi.fn() } }));

import { checklistApi } from "../api/checklist";
import { todayApi } from "../api/today";
import { analyticsApi } from "../api/analytics";
import { TodayPage } from "./TodayPage";

function renderPage() {
  return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ThemeProvider><TodayPage /></ThemeProvider></QueryClientProvider></MemoryRouter>);
}

describe("Today missions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    activeSession.current = null;
    vi.mocked(todayApi.get).mockResolvedValue({ date: todayIso(), currentSession: null, focusedMinutesToday: 30, sessionsToday: 1, tasksCompletedToday: 9, tasksDueToday: [{ id: 40, title: "Tarefa antiga", dueDate: todayIso(), priority: "HIGH", projectId: null }], overdueTasks: [], activeProjects: [{ id: 5, title: "Projeto antigo" }], goals: [{ id: 6, title: "Meta antiga", type: "FOCUS_MINUTES", currentValue: 1, targetValue: 2, done: false }] });
    vi.mocked(analyticsApi.streaks).mockResolvedValue({ currentStreak: 0, longestStreak: 0 });
    vi.mocked(analyticsApi.byDay).mockResolvedValue([]);
    vi.mocked(checklistApi.byDate).mockResolvedValue([{ id: 1, title: "Missão diária", date: todayIso(), completed: true, createdAt: "2026-09-21T12:00:00Z" }]);
  });

  it("shows today's completed checklist while omitting goals, projects and legacy tasks", async () => {
    renderPage();
    expect(await screen.findByText("Missão diária")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Missão diária" })).toBeChecked();
    expect(vi.mocked(checklistApi.byDate)).toHaveBeenCalledWith(todayIso());
    expect(screen.queryByText("Tarefa antiga")).not.toBeInTheDocument();
    expect(screen.queryByText("Projeto antigo")).not.toBeInTheDocument();
    expect(screen.queryByText("Meta antiga")).not.toBeInTheDocument();
    expect(screen.queryByText("TAREFAS FEITAS")).not.toBeInTheDocument();
    expect(screen.getByText("Nenhuma sessão ativa")).toBeInTheDocument();
  });

  it("adds and toggles a mission from Today", async () => {
    let records = [{ id: 1, title: "Missão diária", date: todayIso(), completed: false, createdAt: "2026-09-21T12:00:00Z" }];
    vi.mocked(checklistApi.byDate).mockImplementation(async () => [...records]);
    vi.mocked(checklistApi.create).mockImplementation(async ({ title, date }) => {
      const saved = { id: 2, title, date, completed: false, createdAt: "2026-09-21T12:00:00Z" };
      records.push(saved); return saved;
    });
    vi.mocked(checklistApi.update).mockImplementation(async (id, { completed }) => {
      const saved = { ...records.find((item) => item.id === id)!, completed };
      records = records.map((item) => item.id === id ? saved : item); return saved;
    });
    renderPage();
    await screen.findByText("Missão diária");
    await userEvent.type(screen.getByRole("textbox", { name: "Nova missão" }), "Novo compromisso");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar missão" }));
    await waitFor(() => expect(checklistApi.create).toHaveBeenCalledWith({ title: "Novo compromisso", date: todayIso() }));
    const checkbox = await screen.findByRole("checkbox", { name: "Novo compromisso" });
    await userEvent.click(checkbox);
    await waitFor(() => expect(checklistApi.update).toHaveBeenCalledWith(2, { completed: true }));
    await waitFor(() => expect(checkbox).toBeChecked());
  });

  it("uses the API's configured calendar day for today's missions when browser day differs", async () => {
    const serverDay = "2026-09-23";
    vi.mocked(todayApi.get).mockResolvedValue({ ...(await todayApi.get()), date: serverDay });
    renderPage();
    await waitFor(() => expect(checklistApi.byDate).toHaveBeenCalledWith(serverDay));
  });

  it("does not show a project field for a new free focus session", async () => {
    activeSession.current = {
      id: 8, taskId: null, projectId: null, startedAt: new Date().toISOString(),
      endedAt: null, plannedFocusMinutes: 25, plannedBreakMinutes: null,
      pausedSecondsAccum: 0, lastPausedAt: null, actualFocusSeconds: null,
      status: "RUNNING", notes: null, createdAt: new Date().toISOString(),
    };
    renderPage();
    await screen.findByText("Missão diária");
    expect(screen.queryByText("PROJETO")).not.toBeInTheDocument();
    expect(screen.getByText("PLANEJADO")).toBeInTheDocument();
  });
});
