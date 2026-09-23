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

import { journalApi } from "../api/journal";
import { JournalPage } from "./JournalPage";

const api = vi.mocked(journalApi);
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
    expect(screen.getByRole("status")).toHaveTextContent("Entrada salva.");
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
    await screen.findByText("NENHUM REGISTRO AINDA");
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