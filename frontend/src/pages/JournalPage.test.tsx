import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/ThemeContext";
import type { JournalEntryResponse } from "../api/types";
import { addDaysIso, todayIso } from "../utils/date";

vi.mock("../api/journal", () => ({
  journalApi: { recent: vi.fn(), create: vi.fn() },
}));

vi.mock("../api/analytics", () => ({
  analyticsApi: { byDay: vi.fn(), checklistDaily: vi.fn() },
}));

import { analyticsApi } from "../api/analytics";
import { journalApi } from "../api/journal";
import { JournalPage } from "./JournalPage";

const api = vi.mocked(journalApi);
const activityApi = vi.mocked(analyticsApi);
const entry: JournalEntryResponse = {
  id: 7,
  entryDate: todayIso(),
  content: "Texto antigo",
  createdAt: "2026-09-21T12:00:00Z",
  updatedAt: "2026-09-21T12:00:00Z",
};

function page(content: JournalEntryResponse[]) {
  return {
    content, totalElements: content.length, totalPages: 1, size: 10, number: 0,
    numberOfElements: content.length, first: true, last: true, empty: content.length === 0,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider><JournalPage /></ThemeProvider>
    </QueryClientProvider>,
  );
}

describe("JournalPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.recent.mockResolvedValue(page([entry]));
    activityApi.byDay.mockResolvedValue([]);
    activityApi.checklistDaily.mockResolvedValue([]);
  });

  it("clears the editor after saving and shows the complete text under today's date", async () => {
    api.create.mockImplementation(async ({ entryDate, content }) => ({ ...entry, id: 8, entryDate, content }));
    renderPage();
    const editor = screen.getByPlaceholderText("O que travou, o que fluiu, o que amanhã herda...");
    await userEvent.type(editor, "Meu novo registro sem cortes");
    await userEvent.click(screen.getByRole("button", { name: "Salvar entrada" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledWith({
      entryDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), content: "Meu novo registro sem cortes",
    }));
    await waitFor(() => expect(editor).toHaveValue(""));
    expect(screen.getByText("Meu novo registro sem cortes")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Dia salvo.");
  });

  it("groups multiple saved records under their day without replacing prior text", async () => {
    const older = { ...entry, id: 6, entryDate: addDaysIso(todayIso(), -1), content: "Dia anterior" };
    api.recent.mockResolvedValue(page([entry, older]));
    api.create.mockImplementation(async ({ entryDate, content }) => ({ ...entry, id: 8, entryDate, content }));
    renderPage();
    await screen.findByText("Texto antigo");
    const editor = screen.getByPlaceholderText("O que travou, o que fluiu, o que amanhã herda...");
    expect(editor).toHaveValue("");
    await userEvent.type(editor, "Outra lembrança");
    await userEvent.click(screen.getByRole("button", { name: "Salvar entrada" }));

    await waitFor(() => expect(screen.getByText("Outra lembrança")).toBeInTheDocument());
    expect(screen.getByText("Texto antigo")).toBeInTheDocument();
    expect(screen.getByText("Dia anterior")).toBeInTheDocument();
    expect(within(screen.getByText("Texto antigo").closest("section")!).getByText(todayIso())).toBeInTheDocument();
    expect(within(screen.getByText("Dia anterior").closest("section")!).getByText(older.entryDate)).toBeInTheDocument();
  });

  it("keeps two saves on the same day and loads both again from the server", async () => {
    const records: JournalEntryResponse[] = [];
    api.recent.mockImplementation(async () => page([...records].reverse()));
    api.create.mockImplementation(async ({ entryDate, content }) => {
      const saved = { ...entry, id: records.length + 10, entryDate, content };
      records.push(saved);
      return saved;
    });
    const view = renderPage();
    const editor = screen.getByPlaceholderText("O que travou, o que fluiu, o que amanhã herda...");
    await screen.findByText("Nenhum registro ainda.");
    await userEvent.type(editor, "Primeiro texto");
    await userEvent.click(screen.getByRole("button", { name: "Salvar entrada" }));
    await waitFor(() => expect(editor).toHaveValue(""));
    await userEvent.type(editor, "Segundo texto");
    await userEvent.click(screen.getByRole("button", { name: "Salvar entrada" }));
    await waitFor(() => expect(screen.getByText("Segundo texto")).toBeInTheDocument());
    expect(screen.getByText("Primeiro texto")).toBeInTheDocument();
    expect(screen.getByText("Primeiro texto").closest("section")).toBe(screen.getByText("Segundo texto").closest("section"));

    view.unmount();
    renderPage();
    expect(await screen.findByText("Primeiro texto")).toBeInTheDocument();
    expect(screen.getByText("Segundo texto")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("O que travou, o que fluiu, o que amanhã herda...")).toHaveValue("");
  });

  it("keeps the draft and does not show a new entry when saving fails", async () => {
    api.create.mockRejectedValue(new Error("Falha ao salvar"));
    renderPage();
    const editor = screen.getByPlaceholderText("O que travou, o que fluiu, o que amanhã herda...");
    await userEvent.type(editor, "Não perder este texto");
    await userEvent.click(screen.getByRole("button", { name: "Salvar entrada" }));

    expect(await screen.findByText("Falha ao salvar")).toBeInTheDocument();
    expect(editor).toHaveValue("Não perder este texto");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("Não perder este texto", { selector: "section *" })).not.toBeInTheDocument();
  });
});

describe("JournalPage v3 activity timeline", () => {
  const today = todayIso();
  const [y, m, d] = today.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, d).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  beforeEach(() => {
    vi.resetAllMocks();
    api.recent.mockResolvedValue(page([entry]));
    activityApi.byDay.mockResolvedValue([{ date: today, focusedMinutes: 75 }]);
    activityApi.checklistDaily.mockResolvedValue([{ date: today, total: 4, completed: 3 }]);
  });

  it("opens with the Diário. headline, today's date and a single robot anchor", async () => {
    const { container } = renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Diário." })).toBeInTheDocument();
    expect(screen.getByText(`Registro pessoal · ${today}`)).toBeInTheDocument();
    const anchors = container.querySelectorAll("[data-particle-anchor]");
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toHaveAttribute("data-shape", "cloud");
    expect(screen.queryByTestId("particle-scene")).not.toBeInTheDocument();
  });

  it("groups real journal, focus and checklist activity by date and month", async () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 2, name: "Atividade" })).toBeInTheDocument();
    const day = (await screen.findByText("Texto antigo")).closest("section")!;
    expect(within(day).getByText(today)).toBeInTheDocument();
    expect(within(day).getByText("hoje")).toBeInTheDocument();
    expect(await within(day).findByText("Focou 1h15")).toBeInTheDocument();
    expect(await within(day).findByText("Concluiu 3 de 4 missões")).toBeInTheDocument();
    expect(screen.getByText(monthLabel)).toBeInTheDocument();
    expect(activityApi.byDay).toHaveBeenCalledWith(today, today);
    expect(activityApi.checklistDaily).toHaveBeenCalledWith(today, today);
  });

  it("filters the timeline by real activity categories without inventing moods", async () => {
    renderPage();
    await screen.findByText("Focou 1h15");
    const filter = screen.getByRole("group", { name: "Filtrar atividade" });
    expect(within(filter).getAllByRole("button").map((button) => button.textContent)).toEqual(["Tudo", "Diário", "Foco", "Checklist"]);
    expect(within(filter).getByRole("button", { name: "Tudo" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(within(filter).getByRole("button", { name: "Foco" }));
    expect(within(filter).getByRole("button", { name: "Foco" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Focou 1h15")).toBeInTheDocument();
    expect(screen.queryByText("Texto antigo")).not.toBeInTheDocument();
    expect(screen.queryByText("Concluiu 3 de 4 missões")).not.toBeInTheDocument();

    await userEvent.click(within(filter).getByRole("button", { name: "Diário" }));
    expect(screen.getByText("Texto antigo")).toBeInTheDocument();
    expect(screen.queryByText("Focou 1h15")).not.toBeInTheDocument();
    expect(screen.queryByText(/humor|mood|sentimento/i)).not.toBeInTheDocument();
  });

  it("still saves a new entry when the activity list failed to load", async () => {
    let failed = false;
    api.recent.mockImplementation(async () => {
      if (!failed) { failed = true; throw new Error("offline"); }
      return page([{ ...entry, id: 30, content: "Salvo sem lista" }]);
    });
    api.create.mockImplementation(async ({ entryDate, content }) => ({ ...entry, id: 30, entryDate, content }));
    renderPage();
    expect(await screen.findByText(/Não foi possível carregar os registros/)).toBeInTheDocument();
    const editor = screen.getByPlaceholderText("O que travou, o que fluiu, o que amanhã herda...");
    await userEvent.type(editor, "Salvo sem lista");
    const save = screen.getByRole("button", { name: "Salvar entrada" });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ entryDate: today, content: "Salvo sem lista" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Dia salvo.");
    expect(editor).toHaveValue("");
    expect(await screen.findByText("Salvo sem lista", { selector: "section *" })).toBeInTheDocument();
  });

  it("keeps pagination of journal entries", async () => {
    api.recent.mockImplementation(async (pageNumber = 0) => ({
      ...page([{ ...entry, id: 40 + pageNumber, content: `Página ${pageNumber}` }]),
      totalElements: 11, totalPages: 2, number: pageNumber, first: pageNumber === 0, last: pageNumber === 1,
    }));
    renderPage();
    await screen.findByText("Página 0");
    await userEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Página 1")).toBeInTheDocument();
    expect(api.recent).toHaveBeenLastCalledWith(1, 10);
    expect(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();
  });
});

describe("JournalPage activity without journal entries (QA)", () => {
  const today = todayIso();
  const yesterday = addDaysIso(today, -1);

  beforeEach(() => {
    vi.resetAllMocks();
    activityApi.byDay.mockResolvedValue([]);
    activityApi.checklistDaily.mockResolvedValue([]);
  });

  it("shows today's focus and checklist activity even with an empty journal, and filters it", async () => {
    api.recent.mockResolvedValue(page([]));
    activityApi.byDay.mockResolvedValue([{ date: today, focusedMinutes: 75 }]);
    activityApi.checklistDaily.mockResolvedValue([{ date: today, total: 4, completed: 3 }]);
    renderPage();

    const focus = await screen.findByText("Focou 1h15");
    const day = focus.closest("section")!;
    expect(within(day).getByText(today)).toBeInTheDocument();
    expect(within(day).getByText("Concluiu 3 de 4 missões")).toBeInTheDocument();
    expect(activityApi.byDay).toHaveBeenCalledWith(today, today);
    expect(activityApi.checklistDaily).toHaveBeenCalledWith(today, today);
    expect(screen.queryByText("Nenhum registro ainda.")).not.toBeInTheDocument();

    const filter = screen.getByRole("group", { name: "Filtrar atividade" });
    await userEvent.click(within(filter).getByRole("button", { name: "Checklist" }));
    expect(screen.getByText("Concluiu 3 de 4 missões")).toBeInTheDocument();
    expect(screen.queryByText("Focou 1h15")).not.toBeInTheDocument();
    await userEvent.click(within(filter).getByRole("button", { name: "Diário" }));
    expect(screen.queryByText("Concluiu 3 de 4 missões")).not.toBeInTheDocument();
    expect(screen.queryByText(today, { selector: "time" })).not.toBeInTheDocument();
  });

  it("shows focus from today next to yesterday's note, newest day first", async () => {
    api.recent.mockResolvedValue(page([{ ...entry, id: 5, entryDate: yesterday, content: "Nota de ontem" }]));
    activityApi.byDay.mockResolvedValue([
      { date: yesterday, focusedMinutes: 0 },
      { date: today, focusedMinutes: 50 },
    ]);
    activityApi.checklistDaily.mockResolvedValue([{ date: yesterday, total: 0, completed: 0 }]);
    const { container } = renderPage();

    const focus = await screen.findByText("Focou 50min");
    expect(within(focus.closest("section")!).getByText(today)).toBeInTheDocument();
    expect(within(screen.getByText("Nota de ontem").closest("section")!).getByText(yesterday)).toBeInTheDocument();
    expect(activityApi.byDay).toHaveBeenCalledWith(yesterday, today);
    expect(activityApi.checklistDaily).toHaveBeenCalledWith(yesterday, today);
    const dates = Array.from(container.querySelectorAll("section time")).map((el) => el.getAttribute("datetime"));
    expect(dates).toEqual([today, yesterday]);
    // Zero rows are not events.
    expect(screen.queryByText("Focou 0min")).not.toBeInTheDocument();
    expect(screen.queryByText(/Concluiu 0 de 0/)).not.toBeInTheDocument();
  });

  it("keeps a historical page's own interval for activity queries", async () => {
    const old = addDaysIso(today, -40);
    const older = addDaysIso(today, -45);
    api.recent.mockImplementation(async (pageNumber = 0) => ({
      ...page(pageNumber === 0
        ? [{ ...entry, id: 50, content: "Recente" }]
        : [{ ...entry, id: 51, entryDate: old, content: "Antiga" }, { ...entry, id: 52, entryDate: older, content: "Mais antiga" }]),
      totalElements: 12, totalPages: 2, number: pageNumber, first: pageNumber === 0, last: pageNumber === 1,
    }));
    renderPage();
    await screen.findByText("Recente");
    await userEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await screen.findByText("Antiga");
    await waitFor(() => expect(activityApi.byDay).toHaveBeenLastCalledWith(older, old));
    expect(activityApi.checklistDaily).toHaveBeenLastCalledWith(older, old);
  });

  it("does not present an invented 4h goal or goal percentage for focus", async () => {
    api.recent.mockResolvedValue(page([entry]));
    activityApi.byDay.mockResolvedValue([{ date: today, focusedMinutes: 120 }]);
    renderPage();
    await screen.findByText("Focou 2h00");
    expect(screen.queryByText(/meta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/4h/)).not.toBeInTheDocument();
    expect(screen.queryByText(/50%/)).not.toBeInTheDocument();
  });
});

describe("JournalPage activity aggregation states (QA)", () => {
  const today = todayIso();

  beforeEach(() => {
    vi.resetAllMocks();
    api.recent.mockResolvedValue(page([entry]));
  });

  it("warns accessibly when the focus and checklist aggregations fail instead of showing zero", async () => {
    activityApi.byDay.mockRejectedValue(new Error("byDay down"));
    activityApi.checklistDaily.mockRejectedValue(new Error("checklist down"));
    api.create.mockImplementation(async ({ entryDate, content }) => ({ ...entry, id: 9, entryDate, content }));
    renderPage();

    expect(await screen.findByText("Texto antigo")).toBeInTheDocument();
    const alerts = await screen.findAllByRole("alert");
    const text = alerts.map((alert) => alert.textContent).join(" ");
    expect(text).toMatch(/foco/i);
    expect(text).toMatch(/checklist/i);
    expect(screen.queryByText(/0min/)).not.toBeInTheDocument();

    const editor = screen.getByPlaceholderText("O que travou, o que fluiu, o que amanhã herda...");
    await userEvent.type(editor, "Ainda salvo");
    await userEvent.click(screen.getByRole("button", { name: "Salvar entrada" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ entryDate: today, content: "Ainda salvo" }));
    expect(await screen.findByText("Ainda salvo", { selector: "section *" })).toBeInTheDocument();
  });

  it("does not report a confirmed zero total while the aggregations are still loading", async () => {
    activityApi.byDay.mockReturnValue(new Promise(() => {}));
    activityApi.checklistDaily.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(await screen.findByText("Texto antigo")).toBeInTheDocument();
    await waitFor(() => expect(activityApi.byDay).toHaveBeenCalled());
    expect(screen.queryByText(/0min/)).not.toBeInTheDocument();
    expect(screen.getByText(/carregando/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports a confirmed zero only after the aggregation succeeds empty", async () => {
    activityApi.byDay.mockResolvedValue([]);
    activityApi.checklistDaily.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/· 0min ·/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});