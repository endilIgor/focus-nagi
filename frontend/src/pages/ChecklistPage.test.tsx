import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { todayIso } from "../utils/date";
import type { ChecklistItemResponse } from "../api/types";

vi.mock("../api/checklist", () => ({ checklistApi: { byDate: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }));
import { checklistApi } from "../api/checklist";
import { ChecklistPage } from "./ChecklistPage";

const api = vi.mocked(checklistApi);
const item = (overrides: Partial<ChecklistItemResponse> = {}): ChecklistItemResponse => ({
  id: 1, title: "Ler livro", date: todayIso(), completed: false, createdAt: "2026-09-21T12:00:00Z", ...overrides,
});
function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ChecklistPage /></QueryClientProvider>);
}

describe("ChecklistPage", () => {
  beforeEach(() => { vi.resetAllMocks(); api.byDate.mockResolvedValue([]); });

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
