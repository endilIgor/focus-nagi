import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/ThemeContext";
import type { JournalEntryResponse } from "../api/types";

vi.mock("../api/journal", () => ({
  journalApi: { byDate: vi.fn(), recent: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

import { journalApi } from "../api/journal";
import { JournalPage } from "./JournalPage";

const api = vi.mocked(journalApi);
const entry: JournalEntryResponse = {
  id: 7,
  entryDate: "2026-09-21",
  content: "Texto antigo",
  createdAt: "2026-09-21T12:00:00Z",
  updatedAt: "2026-09-21T12:00:00Z",
};

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
    api.recent.mockResolvedValue({
      content: [], totalElements: 0, totalPages: 1, size: 10, number: 0,
      numberOfElements: 0, first: true, last: true, empty: true,
    });
    api.update.mockImplementation(async (_id, body) => ({ ...entry, content: body.content ?? entry.content }));
  });

  it("preserves text typed while today's GET is pending and sends it in PATCH", async () => {
    let resolveToday!: (entries: JournalEntryResponse[]) => void;
    api.byDate.mockImplementationOnce(() => new Promise((resolve) => { resolveToday = resolve; }));
    api.byDate.mockResolvedValue([entry]);
    renderPage();
    const editor = screen.getByPlaceholderText("O que travou, o que fluiu, o que amanhã herda...");
    await userEvent.type(editor, "Texto novo");
    expect(screen.getByRole("button", { name: "Salvar entrada" })).toBeDisabled();
    await act(async () => resolveToday([entry]));

    expect(editor).toHaveValue("Texto novo");
    await userEvent.click(screen.getByRole("button", { name: "Salvar entrada" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(7, { content: "Texto novo" }));
    await waitFor(() => expect(screen.getByText("Entrada salva.")).toBeInTheDocument());
  });

  it("does not create a duplicate entry when today's GET fails", async () => {
    api.byDate.mockRejectedValue(new Error("Falha na consulta"));
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("O que travou, o que fluiu, o que amanhã herda..."), "Novo texto");
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar entrada" })).toBeDisabled());
    expect(api.create).not.toHaveBeenCalled();
  });

  it("creates an entry after confirming the day has none", async () => {
    api.byDate.mockResolvedValue([]);
    api.create.mockResolvedValue(entry);
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("O que travou, o que fluiu, o que amanhã herda..."), "Primeiro registro");
    await userEvent.click(screen.getByRole("button", { name: "Salvar entrada" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({
      entryDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), content: "Primeiro registro",
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Entrada salva.");
  });
});
