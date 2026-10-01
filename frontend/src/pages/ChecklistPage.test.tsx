import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { todayIso } from "../utils/date";
import type { ChecklistItemResponse } from "../api/types";

vi.mock("../api/checklist", () => ({ checklistApi: { byDate: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }));
vi.mock("../api/analytics", () => ({ analyticsApi: { checklistDaily: vi.fn() } }));
import { analyticsApi } from "../api/analytics";
import { checklistApi } from "../api/checklist";
import { ChecklistPage } from "./ChecklistPage";

const api = vi.mocked(checklistApi);
const weekApi = vi.mocked(analyticsApi);
const item = (overrides: Partial<ChecklistItemResponse> = {}): ChecklistItemResponse => ({
  id: 1, title: "Ler livro", date: todayIso(), completed: false, createdAt: "2026-09-21T12:00:00Z", ...overrides,
});
function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ChecklistPage /></QueryClientProvider>);
}

describe("ChecklistPage", () => {
  beforeEach(() => { vi.resetAllMocks(); api.byDate.mockResolvedValue([]); weekApi.checklistDaily.mockResolvedValue([]); });

  it("limits mission titles to the API's 200-character contract", () => {
    renderPage();
    expect(screen.getByRole("textbox", { name: "Nova missão" })).toHaveAttribute("maxlength", "200");
  });

  it("loads the local current date, creates a trimmed item and keeps it visible", async () => {
    const records: ChecklistItemResponse[] = [];
    api.byDate.mockImplementation(async () => [...records]);
    api.create.mockImplementation(async (body) => {
      const saved = item({ title: body.title, date: body.date }); records.push(saved); return saved;
    });
    renderPage();
    await waitFor(() => expect(api.byDate).toHaveBeenCalledWith(todayIso()));
    await userEvent.type(screen.getByRole("textbox", { name: "Nova missão" }), "  Ler livro  ");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar missão" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ title: "Ler livro", date: todayIso() }));
    expect(await screen.findByText("Ler livro")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nova missão" })).toHaveValue("");
  });

  it("shows completed items and allows toggling them back and deleting", async () => {
    let records = [item({ completed: true })];
    api.byDate.mockImplementation(async () => [...records]);
    api.update.mockImplementation(async (_id, body) => {
      const updated = { ...records[0], completed: body.completed }; records = [updated]; return updated;
    });
    api.remove.mockImplementation(async () => { records = []; });
    renderPage();
    const checkbox = await screen.findByRole("checkbox", { name: "Ler livro" });
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(1, { completed: false }));
    await waitFor(() => expect(checkbox).not.toBeChecked());
    await userEvent.click(screen.getByRole("button", { name: "Excluir Ler livro" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText("Ler livro")).not.toBeInTheDocument());
  });

  it("switches selected day without mixing results and creates against that day", async () => {
    api.byDate.mockImplementation(async (date) => date === "2026-10-03" ? [item({ id: 3, title: "Dia escolhido", date })] : [item()]);
    api.create.mockResolvedValue(item({ id: 4, title: "Outra", date: "2026-10-03" }));
    renderPage();
    await screen.findByText("Ler livro");
    await userEvent.clear(screen.getByLabelText("Data da checklist"));
    await userEvent.type(screen.getByLabelText("Data da checklist"), "2026-10-03");
    await waitFor(() => expect(api.byDate).toHaveBeenCalledWith("2026-10-03"));
    expect(await screen.findByText("Dia escolhido")).toBeInTheDocument();
    expect(screen.queryByText("Ler livro")).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Nova missão" }), "Outra");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar missão" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ title: "Outra", date: "2026-10-03" }));
  });

  it("keeps the draft and reports a mutation error", async () => {
    api.create.mockRejectedValue(new Error("Falha de rede"));
    renderPage();
    await userEvent.type(screen.getByRole("textbox", { name: "Nova missão" }), "Minha missão");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar missão" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha de rede");
    expect(screen.getByRole("textbox", { name: "Nova missão" })).toHaveValue("Minha missão");
    expect(within(screen.getByRole("list")).queryByText("Minha missão")).not.toBeInTheDocument();
  });
});

describe("ChecklistPage v3 week strip", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Sunday late evening, local time: the week must still be Monday 21 → Sunday 27.
    vi.setSystemTime(new Date("2026-09-27T23:30:00"));
    api.byDate.mockResolvedValue([]);
    weekApi.checklistDaily.mockImplementation(async (from) => from === "2026-09-21"
      ? [{ date: "2026-09-21", total: 4, completed: 2 }, { date: "2026-09-27", total: 1, completed: 1 }]
      : []);
  });
  afterEach(() => { vi.useRealTimers(); });

  const weekDays = () => within(screen.getByRole("group", { name: "Semana da checklist" })).getAllByRole("button");

  it("opens with the Checklist diária headline, amber progress copy and a single robot anchor", async () => {
    const { container } = renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Checklist diária" })).toBeInTheDocument();
    const anchors = container.querySelectorAll("[data-particle-anchor]");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toHaveAttribute("data-shape", "cloud");
    expect(await screen.findByText("3 de 5 missões concluídas na semana")).toBeInTheDocument();
  });

  it("shows the local Monday–Sunday week with real per-day progress", async () => {
    renderPage();
    await waitFor(() => expect(weekApi.checklistDaily).toHaveBeenCalledWith("2026-09-21", "2026-09-27"));
    const days = weekDays();
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveTextContent("Seg");
    expect(days[0]).toHaveTextContent("21");
    expect(days[6]).toHaveTextContent("Hoje");
    expect(days[6]).toHaveTextContent("27");
    expect(days[6]).toHaveAttribute("aria-pressed", "true");
    expect(days[0]).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByRole("button", { name: "segunda-feira, 21/09: 2 de 4 missões concluídas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hoje, domingo, 27/09: 1 de 1 missões concluídas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "terça-feira, 22/09: sem missões" })).toBeInTheDocument();
  });

  it("selects a day from the strip and moves between weeks without losing the date picker", async () => {
    renderPage();
    await waitFor(() => expect(weekApi.checklistDaily).toHaveBeenCalledWith("2026-09-21", "2026-09-27"));
    fireEvent.click(weekDays()[0]);
    await waitFor(() => expect(api.byDate).toHaveBeenCalledWith("2026-09-21"));
    expect(screen.getByLabelText("Data da checklist")).toHaveValue("2026-09-21");
    expect(weekDays()[0]).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
    await waitFor(() => expect(weekApi.checklistDaily).toHaveBeenCalledWith("2026-09-14", "2026-09-20"));
    expect(screen.getByLabelText("Data da checklist")).toHaveValue("2026-09-14");
    await waitFor(() => expect(api.byDate).toHaveBeenCalledWith("2026-09-14"));

    fireEvent.click(screen.getByRole("button", { name: "Próxima semana" }));
    expect(screen.getByLabelText("Data da checklist")).toHaveValue("2026-09-21");

    fireEvent.change(screen.getByLabelText("Data da checklist"), { target: { value: "2026-10-01" } });
    await waitFor(() => expect(weekApi.checklistDaily).toHaveBeenCalledWith("2026-09-28", "2026-10-04"));
    expect(weekDays()[3]).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores an empty date picker value instead of querying an invalid week", async () => {
    renderPage();
    await waitFor(() => expect(weekApi.checklistDaily).toHaveBeenCalledWith("2026-09-21", "2026-09-27"));
    fireEvent.change(screen.getByLabelText("Data da checklist"), { target: { value: "" } });
    expect(weekDays()[6]).toHaveAttribute("aria-pressed", "true");
    expect(weekApi.checklistDaily.mock.calls.some(([from, to]) => `${from}${to}`.includes("NaN"))).toBe(false);
  });

  it("refreshes the week progress after a mission changes", async () => {
    api.byDate.mockResolvedValue([item({ date: "2026-09-27" })]);
    api.update.mockResolvedValue(item({ date: "2026-09-27", completed: true }));
    renderPage();
    const checkbox = await screen.findByRole("checkbox", { name: "Ler livro" });
    const before = weekApi.checklistDaily.mock.calls.length;
    fireEvent.click(checkbox);
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(1, { completed: true }));
    await waitFor(() => expect(weekApi.checklistDaily.mock.calls.length).toBeGreaterThan(before));
  });
});
