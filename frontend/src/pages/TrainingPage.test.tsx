import type { ComponentType } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerResponse, TrainingRoutineResponse, TrainingExerciseResponse } from "../api/types";
import trainingCss from "./TrainingPage.module.css?raw";

const auth = vi.hoisted(() => ({ owner: null as OwnerResponse | null }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ owner: auth.owner, status: "authenticated", login: vi.fn(), logout: vi.fn(), retrySession: vi.fn() }),
}));
vi.mock("../api/training", () => ({
  trainingApi: {
    listRoutines: vi.fn(),
    allRoutines: vi.fn(),
    getRoutine: vi.fn(),
    createRoutine: vi.fn(),
    updateRoutine: vi.fn(),
    removeRoutine: vi.fn(),
    listExercises: vi.fn(),
    allExercises: vi.fn(),
    getExercise: vi.fn(),
    createExercise: vi.fn(),
    updateExercise: vi.fn(),
    removeExercise: vi.fn(),
  },
}));
import { ApiRequestError } from "../api/client";
import { trainingApi } from "../api/training";

const api = vi.mocked(trainingApi);
const USER_A: OwnerResponse = { id: "user-a", email: null, healthAccess: true };
const USER_B: OwnerResponse = { id: "user-b", email: null, healthAccess: true };
// A glob yields an empty map for a missing file, so its absence fails an assertion, not the file transform.
const pageModules = import.meta.glob<{ TrainingPage: ComponentType }>("./TrainingPage.tsx");

async function loadPage(): Promise<ComponentType> {
  const load = pageModules["./TrainingPage.tsx"];
  expect(load, "TrainingPage.tsx must exist").toBeTypeOf("function");
  return (await load()).TrainingPage;
}

const routine = (overrides: Partial<TrainingRoutineResponse> = {}): TrainingRoutineResponse => ({
  id: 1,
  name: "Treino A",
  weekdays: [],
  exerciseCount: 0,
  createdAt: "2026-10-12T10:00:00Z",
  updatedAt: "2026-10-12T10:00:00Z",
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function renderPage(client = newClient()) {
  const TrainingPage = await loadPage();
  const view = render(
    <QueryClientProvider client={client}>
      <TrainingPage />
    </QueryClientProvider>,
  );
  const rerender = () =>
    view.rerender(
      <QueryClientProvider client={client}>
        <TrainingPage />
      </QueryClientProvider>,
    );
  return { ...view, client, rerender };
}

const routinesList = () => screen.getByRole("list", { name: "Rotinas" });

beforeEach(() => {
  vi.resetAllMocks();
  auth.owner = USER_A;
  api.allRoutines.mockResolvedValue([]);
  api.allExercises.mockResolvedValue([]);
});

describe("S1 — estrutura, carregamento e listagem", () => {
  it("shows a loading state without a false empty state", async () => {
    api.allRoutines.mockReturnValue(new Promise(() => undefined));
    await renderPage();
    expect(screen.getByLabelText("Carregando rotinas")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma rotina cadastrada.")).not.toBeInTheDocument();
  });

  it("shows the empty state only after an empty successful load", async () => {
    await renderPage();
    expect(await screen.findByText("Nenhuma rotina cadastrada.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Carregando rotinas")).not.toBeInTheDocument();
  });

  it("reports a load error with retry and never shows the empty state", async () => {
    api.allRoutines
      .mockRejectedValueOnce(new ApiRequestError(503, { code: "UPSTREAM_UNAVAILABLE", message: "down" } as never))
      .mockResolvedValueOnce([routine({ name: "Recuperada" })]);
    await renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Banco de dados indisponível");
    expect(screen.queryByText("Nenhuma rotina cadastrada.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("button", { name: "Recuperada" })).toBeInTheDocument();
    expect(api.allRoutines).toHaveBeenCalledTimes(2);
  });

  it("lists every routine from allRoutines with weekdays and exercise counts", async () => {
    const many = Array.from({ length: 25 }, (_, i) => routine({ id: i + 1, name: `Rotina ${i + 1}` }));
    many[0] = routine({ id: 1, name: "Rotina 1", weekdays: [1, 3, 7], exerciseCount: 2 });
    many[1] = routine({ id: 2, name: "Rotina 2", weekdays: [], exerciseCount: 1 });
    api.allRoutines.mockResolvedValue(many);
    await renderPage();
    await screen.findByRole("button", { name: "Rotina 25" });
    expect(within(routinesList()).getAllByRole("listitem")).toHaveLength(25);
    const first = within(routinesList()).getAllByRole("listitem")[0];
    expect(first).toHaveTextContent("Seg, Qua, Dom");
    expect(first).toHaveTextContent("2 exercícios");
    const second = within(routinesList()).getAllByRole("listitem")[1];
    expect(second).toHaveTextContent("Sem dias definidos");
    expect(second).toHaveTextContent("1 exercício");
    expect(api.listRoutines).not.toHaveBeenCalled();
    expect(api.allExercises).not.toHaveBeenCalled();
    expect(api.listExercises).not.toHaveBeenCalled();
  });

  it("caches routines under the owner's health key", async () => {
    const { client } = await renderPage();
    await screen.findByText("Nenhuma rotina cadastrada.");
    const keys = client.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toEqual([["health", "user-a", "training", "routines"]]);
  });

  it("does not query anything without an authenticated owner", async () => {
    auth.owner = null;
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Treino" })).toBeInTheDocument();
    expect(api.allRoutines).not.toHaveBeenCalled();
  });
});

const createForm = () => screen.getByRole("form", { name: "Nova rotina" });

const exercise = (id = 1): TrainingExerciseResponse => ({
  id, routineId: 1, name: `Exercício ${id}`, sets: 3, mode: "REPETITIONS", repetitions: 10,
  durationSeconds: null, notes: "Sem pressa", createdAt: "2026-10-12T10:00:00Z", updatedAt: "2026-10-12T10:00:00Z",
});
async function selectRoutine() {
  api.allRoutines.mockResolvedValue([routine(), routine({ id: 2, name: "Treino B" })]);
  const view = await renderPage();
  expect(api.allExercises).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
  return view;
}
const exercisesPanel = () => screen.getByRole("region", { name: "Exercícios da rotina" });

describe("T11 L — lista de exercícios", () => {
  it("loads only after selection and preserves stable API order and owner key", async () => {
    api.allExercises.mockResolvedValue([exercise(2), exercise(9)]);
    const { client } = await selectRoutine();
    expect(screen.queryByRole("region", { name: "Exercícios da rotina" })).toBeInTheDocument();
    const list = await within(exercisesPanel()).findByRole("list", { name: "Exercícios" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Exercício 2"), expect.stringContaining("Exercício 9"),
    ]);
    expect(list).toHaveTextContent("3 séries · 10 repetições");
    expect(list).toHaveTextContent("Sem pressa");
    expect(api.allExercises).toHaveBeenCalledWith(1);
    expect(api.listExercises).not.toHaveBeenCalled();
    expect(client.getQueryCache().getAll().map((q) => q.queryKey)).toContainEqual(["health", "user-a", "training", "routines", 1, "exercises"]);
  });
  it("shows loading without false empty and then empty success", async () => {
    const pending = deferred<TrainingExerciseResponse[]>();
    api.allExercises.mockReturnValue(pending.promise);
    await selectRoutine();
    expect(screen.queryByRole("region", { name: "Exercícios da rotina" })).toBeInTheDocument();
    expect(within(exercisesPanel()).getByLabelText("Carregando exercícios")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum exercício cadastrado.")).not.toBeInTheDocument();
    await act(async () => pending.resolve([]));
    expect(await screen.findByText("Nenhum exercício cadastrado.")).toBeInTheDocument();
  });
  it("retries a load error without false empty", async () => {
    api.allExercises.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([exercise()]);
    await selectRoutine();
    expect(screen.queryByRole("region", { name: "Exercícios da rotina" })).toBeInTheDocument();
    const alert = await within(exercisesPanel()).findByRole("alert");
    expect(screen.queryByText("Nenhum exercício cadastrado.")).not.toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Exercício 1")).toBeInTheDocument();
    expect(api.allExercises).toHaveBeenCalledTimes(2);
  });
});

const exerciseForm = () => screen.getByRole("form", { name: "Novo exercício" });
async function fillExercise() {
  expect(screen.queryByRole("form", { name: "Novo exercício" })).toBeInTheDocument();
  fireEvent.change(within(exerciseForm()).getByRole("textbox", { name: "Nome do exercício" }), { target: { value: "  Agachamento  " } });
  fireEvent.change(within(exerciseForm()).getByRole("spinbutton", { name: "Séries" }), { target: { value: "3" } });
  fireEvent.change(within(exerciseForm()).getByRole("spinbutton", { name: "Repetições" }), { target: { value: "12" } });
}
describe("T11 C — criar exercícios", () => {
  it("creates repetitions, trims notes and writes response before owner training invalidation", async () => {
    const saved: TrainingExerciseResponse = { ...exercise(7), name: "Agachamento", mode: "REPETITIONS", repetitions: 12, durationSeconds: null, notes: "leve" };
    api.createExercise.mockResolvedValue(saved);
    const { client } = await selectRoutine();
    await screen.findByText("Nenhum exercício cadastrado.");
    const cancel = vi.spyOn(client, "cancelQueries");
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    await fillExercise();
    fireEvent.change(within(exerciseForm()).getByRole("textbox", { name: "Observações" }), { target: { value: "  leve  " } });
    fireEvent.submit(exerciseForm());
    await waitFor(() => expect(api.createExercise).toHaveBeenCalledWith(1, { name: "Agachamento", sets: 3, mode: "REPETITIONS", repetitions: 12, durationSeconds: null, notes: "leve" }));
    expect(await screen.findByText("Agachamento")).toBeInTheDocument();
    expect(cancel).toHaveBeenCalledWith({ queryKey: ["health", "user-a", "training", "routines", 1, "exercises"] });
    expect(client.getQueryData(["health", "user-a", "training", "routines", 1, "exercises"])).toEqual([saved]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["health", "user-a", "training"] });
    expect(within(exerciseForm()).getByRole("textbox", { name: "Nome do exercício" })).toHaveValue("");
  });
  it("clears incompatible targets on each mode change and creates duration with null notes", async () => {
    api.createExercise.mockResolvedValue({ ...exercise(), mode: "DURATION", repetitions: null, durationSeconds: 86400 });
    await selectRoutine();
    await fillExercise();
    const mode = within(exerciseForm()).getByRole("combobox", { name: "Modo" });
    await userEvent.selectOptions(mode, "DURATION");
    expect(within(exerciseForm()).getByRole("spinbutton", { name: "Duração (segundos)" })).toHaveValue(null);
    fireEvent.change(within(exerciseForm()).getByRole("spinbutton", { name: "Duração (segundos)" }), { target: { value: "30" } });
    await userEvent.selectOptions(mode, "REPETITIONS");
    expect(within(exerciseForm()).getByRole("spinbutton", { name: "Repetições" })).toHaveValue(null);
    await userEvent.selectOptions(mode, "DURATION");
    fireEvent.change(within(exerciseForm()).getByRole("spinbutton", { name: "Duração (segundos)" }), { target: { value: "86400" } });
    fireEvent.submit(exerciseForm());
    await waitFor(() => expect(api.createExercise).toHaveBeenCalledWith(1, { name: "Agachamento", sets: 3, mode: "DURATION", repetitions: null, durationSeconds: 86400, notes: null }));
  });
  it("rejects blank, too long, fractional and out of bounds values without requests", async () => {
    await selectRoutine();
    await fillExercise();
    const form = exerciseForm();
    expect(within(form).getByRole("textbox", { name: "Nome do exercício" })).toHaveAttribute("maxlength", "150");
    expect(within(form).getByRole("textbox", { name: "Observações" })).toHaveAttribute("maxlength", "2000");
    for (const [role, label, value] of [
      ["textbox", "Nome do exercício", "   "], ["textbox", "Nome do exercício", "x".repeat(151)],
      ["spinbutton", "Séries", ""], ["spinbutton", "Séries", "0"], ["spinbutton", "Séries", "1001"], ["spinbutton", "Séries", "1.5"],
      ["spinbutton", "Repetições", "-1"], ["spinbutton", "Repetições", "1001"], ["spinbutton", "Repetições", "1.5"],
      ["textbox", "Observações", "x".repeat(2001)],
    ]) {
      await fillExercise();
      fireEvent.change(within(form).getByRole("textbox", { name: "Observações" }), { target: { value: "" } });
      fireEvent.change(within(form).getByRole(role, { name: label }), { target: { value } });
      fireEvent.submit(form);
      expect(await within(form).findByRole("alert")).toBeInTheDocument();
      expect(api.createExercise).not.toHaveBeenCalled();
    }
    await fillExercise();
    fireEvent.change(within(form).getByRole("textbox", { name: "Observações" }), { target: { value: "" } });
    await userEvent.selectOptions(within(form).getByRole("combobox", { name: "Modo" }), "DURATION");
    for (const value of ["", "0", "86401", "1.5"]) {
      fireEvent.change(within(form).getByRole("spinbutton", { name: "Duração (segundos)" }), { target: { value } });
      fireEvent.submit(form);
      expect(await within(form).findByRole("alert")).toBeInTheDocument();
      expect(api.createExercise).not.toHaveBeenCalled();
    }
  });
  it("preserves drafts on error and locks all routine and exercise fields during save", async () => {
    const pending = deferred<TrainingExerciseResponse>();
    api.createExercise.mockReturnValue(pending.promise);
    await selectRoutine();
    await fillExercise();
    fireEvent.submit(exerciseForm());
    fireEvent.submit(exerciseForm());
    await waitFor(() => expect(api.createExercise).toHaveBeenCalledTimes(1));
    within(exerciseForm()).getAllByRole("textbox").forEach((el) => expect(el).toBeDisabled());
    within(exerciseForm()).getAllByRole("spinbutton").forEach((el) => expect(el).toBeDisabled());
    expect(within(exerciseForm()).getByRole("combobox")).toBeDisabled();
    expect(within(createForm()).getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Treino B" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Editar rotina" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Excluir rotina" })).toBeDisabled();
    fireEvent.submit(createForm());
    expect(api.createRoutine).not.toHaveBeenCalled();
    await act(async () => pending.reject(new Error("down")));
    expect(await within(exerciseForm()).findByRole("alert")).toBeInTheDocument();
    expect(within(exerciseForm()).getByRole("textbox", { name: "Nome do exercício" })).toHaveValue("  Agachamento  ");
    expect(within(exerciseForm()).getByRole("spinbutton", { name: "Repetições" })).toHaveValue(12);
    expect(screen.getByRole("button", { name: "Treino B" })).toBeEnabled();
  });
});

const editExerciseForm = () => screen.getByRole("form", { name: "Editar exercício" });
async function startExerciseEdit() {
  api.allExercises.mockResolvedValue([exercise()]);
  const view = await selectRoutine();
  await screen.findByText("Exercício 1");
  expect(screen.queryByRole("button", { name: "Editar exercício 1" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Editar exercício 1" }));
  return view;
}
describe("T11 E — editar e excluir exercícios", () => {
  it("prefills edit, focuses name and restores trigger on cancel without saving", async () => {
    await startExerciseEdit();
    const name = within(editExerciseForm()).getByRole("textbox", { name: "Nome do exercício" });
    expect(name).toHaveValue("Exercício 1");
    expect(name).toHaveFocus();
    expect(within(editExerciseForm()).getByRole("spinbutton", { name: "Séries" })).toHaveValue(3);
    expect(within(editExerciseForm()).getByRole("spinbutton", { name: "Repetições" })).toHaveValue(10);
    expect(within(editExerciseForm()).getByRole("textbox", { name: "Observações" })).toHaveValue("Sem pressa");
    await userEvent.click(within(editExerciseForm()).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("form", { name: "Editar exercício" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar exercício 1" })).toHaveFocus();
    expect(api.updateExercise).not.toHaveBeenCalled();
  });
  it("changes mode coherently, clears notes and writes the edited response in place", async () => {
    const saved: TrainingExerciseResponse = { ...exercise(), name: "Prancha", mode: "DURATION", repetitions: null, durationSeconds: 40, notes: null };
    api.updateExercise.mockResolvedValue(saved);
    const { client } = await startExerciseEdit();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const form = editExerciseForm();
    fireEvent.change(within(form).getByRole("textbox", { name: "Nome do exercício" }), { target: { value: "Prancha" } });
    fireEvent.change(within(form).getByRole("textbox", { name: "Observações" }), { target: { value: "   " } });
    await userEvent.selectOptions(within(form).getByRole("combobox"), "DURATION");
    expect(within(form).getByRole("spinbutton", { name: "Duração (segundos)" })).toHaveValue(null);
    fireEvent.change(within(form).getByRole("spinbutton", { name: "Duração (segundos)" }), { target: { value: "40" } });
    fireEvent.submit(form);
    await waitFor(() => expect(api.updateExercise).toHaveBeenCalledWith(1, 1, { name: "Prancha", sets: 3, mode: "DURATION", repetitions: null, durationSeconds: 40, notes: null }));
    expect(await screen.findByText("Prancha")).toBeInTheDocument();
    expect(exercisesPanel()).toHaveTextContent("3 séries · 40 segundos");
    expect(screen.queryByRole("form", { name: "Editar exercício" })).not.toBeInTheDocument();
    expect(client.getQueryData(["health", "user-a", "training", "routines", 1, "exercises"])).toEqual([saved]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["health", "user-a", "training"] });
  });
  it("keeps failed edits and prevents cancel, selection and other mutations while pending", async () => {
    const pending = deferred<TrainingExerciseResponse>();
    api.updateExercise.mockReturnValue(pending.promise);
    await startExerciseEdit();
    fireEvent.change(within(editExerciseForm()).getByRole("textbox", { name: "Nome do exercício" }), { target: { value: "Rascunho" } });
    fireEvent.submit(editExerciseForm());
    fireEvent.submit(editExerciseForm());
    await waitFor(() => expect(api.updateExercise).toHaveBeenCalledTimes(1));
    for (const role of ["textbox", "spinbutton", "combobox", "button"]) within(editExerciseForm()).getAllByRole(role).forEach((el) => expect(el).toBeDisabled());
    expect(screen.getByRole("button", { name: "Treino B" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Excluir rotina" })).toBeDisabled();
    expect(within(exerciseForm()).getByRole("button")).toBeDisabled();
    await act(async () => pending.reject(new Error("down")));
    expect(await within(editExerciseForm()).findByRole("alert")).toBeInTheDocument();
    expect(within(editExerciseForm()).getByRole("textbox", { name: "Nome do exercício" })).toHaveValue("Rascunho");
  });
  it("confirms deletion, focuses safe cancel and preserves confirmation on error before retry", async () => {
    api.allExercises.mockResolvedValue([exercise()]);
    api.removeExercise.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce();
    const { client } = await selectRoutine();
    await screen.findByText("Exercício 1");
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    expect(screen.queryByRole("button", { name: "Excluir exercício 1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Excluir exercício 1" }));
    const dialog = screen.getByRole("alertdialog", { name: "Excluir exercício 1" });
    expect(within(dialog).getByRole("button", { name: "Cancelar" })).toHaveFocus();
    expect(api.removeExercise).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Excluir exercício 1" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Excluir exercício 1" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirmar exclusão" }));
    expect(await within(screen.getByRole("alertdialog")).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Exercício 1")).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(screen.queryByText("Exercício 1")).not.toBeInTheDocument());
    expect(api.removeExercise).toHaveBeenLastCalledWith(1, 1);
    expect(client.getQueryData(["health", "user-a", "training", "routines", 1, "exercises"])).toEqual([]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["health", "user-a", "training"] });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("T11 R — cache, concorrência e isolamento", () => {
  it("contains narrow-layout guards for exercise descriptions, notes and inline forms", () => {
    expect(trainingCss).toMatch(/\.exerciseDescription\s*\{[^}]*min-width:\s*0/);
    expect(trainingCss).toMatch(/\.exerciseNotes\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(trainingCss).toMatch(/\.row\s+\.form\s*\{[^}]*flex-basis:\s*100%/);
  });
  it("does not duplicate a created response already observed by a refresh", async () => {
    const pending = deferred<TrainingExerciseResponse>();
    api.createExercise.mockReturnValue(pending.promise);
    const { client } = await selectRoutine();
    await fillExercise();
    fireEvent.submit(exerciseForm());
    await waitFor(() => expect(api.createExercise).toHaveBeenCalledTimes(1));
    const saved = exercise(7);
    act(() => client.setQueryData(["health", "user-a", "training", "routines", 1, "exercises"], [saved]));
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    await act(async () => pending.resolve(saved));
    expect(client.getQueryData(["health", "user-a", "training", "routines", 1, "exercises"])).toEqual([saved]);
    expect(within(screen.getByRole("list", { name: "Exercícios" })).getAllByRole("listitem")).toHaveLength(1);
  });
  it("cancels an old load so its late response cannot overwrite mutation data", async () => {
    const old = deferred<TrainingExerciseResponse[]>();
    api.allExercises.mockReturnValueOnce(old.promise).mockResolvedValue([exercise(7)]);
    api.createExercise.mockResolvedValue(exercise(7));
    const { client } = await selectRoutine();
    await fillExercise();
    fireEvent.submit(exerciseForm());
    expect(await screen.findByText("Exercício 7")).toBeInTheDocument();
    await act(async () => old.resolve([exercise(1)]));
    expect(screen.queryByText("Exercício 1")).not.toBeInTheDocument();
    expect(client.getQueryData(["health", "user-a", "training", "routines", 1, "exercises"])).toEqual([exercise(7)]);
  });
  it("refreshes routine counts without invalidating Analytics or focus", async () => {
    let count = 0;
    api.allRoutines.mockImplementation(async () => [routine({ exerciseCount: count })]);
    api.createExercise.mockImplementation(async () => { count = 1; return exercise(); });
    const { client } = await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await fillExercise();
    fireEvent.submit(exerciseForm());
    await waitFor(() => expect(routinesList()).toHaveTextContent("1 exercício"));
    expect(invalidate).toHaveBeenCalled();
    invalidate.mock.calls.forEach(([filters]) => expect(filters?.queryKey).toEqual(["health", "user-a", "training"]));
  });
  it("resets exercise drafts, edits and confirmations when changing routine", async () => {
    await startExerciseEdit();
    await fillExercise();
    fireEvent.change(within(editExerciseForm()).getByRole("textbox", { name: "Nome do exercício" }), { target: { value: "Editado" } });
    await userEvent.click(screen.getByRole("button", { name: "Treino B" }));
    expect(api.allExercises).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("form", { name: "Editar exercício" })).not.toBeInTheDocument();
    expect(within(exerciseForm()).getByRole("textbox", { name: "Nome do exercício" })).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Treino A" }));
    await userEvent.click(await screen.findByRole("button", { name: "Excluir exercício 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Treino B" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("blocks exercise edits, creation and delete cancellation during a routine save or exercise delete", async () => {
    const routinePending = deferred<TrainingRoutineResponse>();
    const deletePending = deferred<void>();
    api.updateRoutine.mockReturnValue(routinePending.promise);
    api.removeExercise.mockReturnValue(deletePending.promise);
    await startExerciseEdit();
    await userEvent.click(within(editExerciseForm()).getByRole("button", { name: "Cancelar" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar rotina" }));
    fireEvent.submit(screen.getByRole("form", { name: "Editar rotina" }));
    await waitFor(() => expect(api.updateRoutine).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Editar exercício 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Excluir exercício 1" })).toBeDisabled();
    within(exerciseForm()).getAllByRole("textbox").forEach((el) => expect(el).toBeDisabled());
    await act(async () => routinePending.resolve(routine()));
    await userEvent.click(screen.getByRole("button", { name: "Excluir exercício 1" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar exclusão" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(api.removeExercise).toHaveBeenCalledTimes(1));
    within(dialog).getAllByRole("button").forEach((el) => expect(el).toBeDisabled());
    expect(screen.getByRole("button", { name: "Treino B" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Editar rotina" })).toBeDisabled();
    await act(async () => deletePending.reject(new Error("down")));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  });
  it.each(["success", "failure"])("does not leak a late exercise create %s across accounts with the same routine ID", async (outcome) => {
    const pending = deferred<TrainingExerciseResponse>();
    api.createExercise.mockReturnValue(pending.promise);
    api.allExercises.mockImplementation(async () => auth.owner?.id === USER_B.id ? [{ ...exercise(88), name: "Só B" }] : []);
    const { client, rerender } = await selectRoutine();
    await fillExercise();
    fireEvent.submit(exerciseForm());
    await waitFor(() => expect(api.createExercise).toHaveBeenCalledTimes(1));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    auth.owner = USER_B;
    rerender();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    expect(await screen.findByText("Só B")).toBeInTheDocument();
    expect(within(exerciseForm()).getByRole("textbox", { name: "Nome do exercício" })).toHaveValue("");
    expect(within(exerciseForm()).getByRole("button")).toBeEnabled();
    await act(async () => outcome === "success" ? pending.resolve(exercise(99)) : pending.reject(new Error("old error")));
    expect(screen.queryByText("Exercício 99")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(client.getQueryData(["health", "user-b", "training", "routines", 1, "exercises"])).toEqual([{ ...exercise(88), name: "Só B" }]);
    invalidate.mock.calls.forEach(([filters]) => expect(filters?.queryKey).toEqual(["health", "user-a", "training"]));
  });
  it("does not leak a previous owner's late exercise load", async () => {
    const old = deferred<TrainingExerciseResponse[]>();
    api.allExercises.mockReturnValueOnce(old.promise).mockResolvedValue([]);
    const { rerender } = await selectRoutine();
    auth.owner = USER_B;
    rerender();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    await screen.findByText("Nenhum exercício cadastrado.");
    await act(async () => old.resolve([exercise(99)]));
    expect(screen.queryByText("Exercício 99")).not.toBeInTheDocument();
  });
});

const exercisesKeyA1 = ["health", "user-a", "training", "routines", 1, "exercises"];
/** Mirrors the Worker: listing exercises of a routine that no longer exists answers 404. */
function deletableRoutines() {
  const state = { records: [routine(), routine({ id: 2, name: "Treino B" })] };
  api.allRoutines.mockImplementation(async () => [...state.records]);
  api.allExercises.mockImplementation(async (id) => {
    if (!state.records.some((r) => r.id === id)) throw new ApiRequestError(404, { code: "NOT_FOUND", message: "missing" } as never);
    return [exercise()];
  });
  const pending = deferred<void>();
  api.removeRoutine.mockImplementation(async (id) => {
    await pending.promise;
    state.records = state.records.filter((r) => r.id !== id);
  });
  return pending;
}
async function confirmRoutineRemoval() {
  await userEvent.click(within(selectedPanel()).getByRole("button", { name: "Excluir rotina" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirmar exclusão" }));
  await waitFor(() => expect(api.removeRoutine).toHaveBeenCalledWith(1));
}

describe("T11 X — exclusão de rotina com exercícios", () => {
  it("never refetches the deleted routine's exercises and drops their cache (retry 1 as in main)", async () => {
    const pending = deletableRoutines();
    // main.tsx retries once; a retry delay longer than the test keeps any retry pending instead of sleeping.
    const client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 600_000 } } });
    await renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    expect(await screen.findByText("Exercício 1")).toBeInTheDocument();
    expect(api.allExercises).toHaveBeenCalledTimes(1);
    await confirmRoutineRemoval();
    await act(async () => pending.resolve());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Treino A" })).not.toBeInTheDocument());
    expect(api.allExercises).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Exercícios da rotina" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Rotina selecionada" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Treino B" })).toBeEnabled());
    expect(client.getQueryState(exercisesKeyA1)).toBeUndefined();
  });

  it("discards an exercises load still in flight when its routine is deleted", async () => {
    const pending = deletableRoutines();
    const late = deferred<TrainingExerciseResponse[]>();
    api.allExercises.mockReturnValueOnce(late.promise);
    const { client } = await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    expect(within(exercisesPanel()).getByLabelText("Carregando exercícios")).toBeInTheDocument();
    await confirmRoutineRemoval();
    await act(async () => pending.resolve());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Treino A" })).not.toBeInTheDocument());
    await act(async () => late.resolve([exercise(99)]));
    expect(api.allExercises).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Exercício 99")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Treino B" })).toBeEnabled();
    expect(client.getQueryState(exercisesKeyA1)).toBeUndefined();
  });

  it("keeps another account's same-ID routine exercises when a previous delete succeeds late", async () => {
    const records: Record<string, TrainingRoutineResponse[]> = { "user-a": [routine()], "user-b": [routine({ name: "Rotina da B" })] };
    api.allRoutines.mockImplementation(async () => [...(records[auth.owner?.id ?? ""] ?? [])]);
    api.allExercises.mockImplementation(async () => auth.owner?.id === USER_B.id ? [{ ...exercise(88), name: "Só B" }] : [exercise()]);
    const pending = deferred<void>();
    api.removeRoutine.mockImplementation(async () => {
      await pending.promise;
      records["user-a"] = [];
    });
    const { client, rerender } = await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    await screen.findByText("Exercício 1");
    await confirmRoutineRemoval();
    auth.owner = USER_B;
    act(() => rerender());
    await userEvent.click(await screen.findByRole("button", { name: "Rotina da B" }));
    expect(await screen.findByText("Só B")).toBeInTheDocument();
    const loads = api.allExercises.mock.calls.length;
    await act(async () => pending.resolve());
    await act(async () => undefined);
    expect(screen.getByText("Só B")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(client.getQueryData(["health", "user-b", "training", "routines", 1, "exercises"])).toEqual([{ ...exercise(88), name: "Só B" }]);
    expect(api.allExercises.mock.calls.length).toBe(loads);
  });

  it("keeps the selection, exercises cache and exercise draft when deleting the routine fails", async () => {
    api.allRoutines.mockResolvedValue([routine(), routine({ id: 2, name: "Treino B" })]);
    api.allExercises.mockResolvedValue([exercise()]);
    api.removeRoutine.mockRejectedValue(new ApiRequestError(503, { code: "UPSTREAM_UNAVAILABLE", message: "down" } as never));
    const { client } = await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    await screen.findByText("Exercício 1");
    await fillExercise();
    await confirmRoutineRemoval();
    expect(await within(selectedPanel()).findByRole("alert")).toHaveTextContent("Banco de dados indisponível");
    expect(within(exerciseForm()).getByRole("textbox", { name: "Nome do exercício" })).toHaveValue("  Agachamento  ");
    expect(screen.getByText("Exercício 1")).toBeInTheDocument();
    expect(client.getQueryData(exercisesKeyA1)).toEqual([exercise()]);
    expect(api.allExercises).toHaveBeenCalledTimes(1);
  });
});

describe("S2 — criação de rotina", () => {
  it("offers a 150-character name and the seven optional ISO weekdays", async () => {
    await renderPage();
    await screen.findByText("Nenhuma rotina cadastrada.");
    const form = createForm();
    expect(within(form).getByRole("textbox", { name: "Nome da rotina" })).toHaveAttribute("maxlength", "150");
    const days = within(within(form).getByRole("group", { name: "Dias da semana (opcional)" })).getAllByRole("checkbox");
    expect(days.map((d) => d.closest("label")?.textContent)).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
    days.forEach((d) => expect(d).not.toBeChecked());
  });

  it("creates a trimmed routine with sorted days, clears the form and selects it", async () => {
    const records: TrainingRoutineResponse[] = [];
    api.allRoutines.mockImplementation(async () => [...records]);
    api.createRoutine.mockImplementation(async (body) => {
      const saved = routine({ id: 7, name: body.name, weekdays: body.weekdays ?? [] });
      records.push(saved);
      return saved;
    });
    await renderPage();
    await screen.findByText("Nenhuma rotina cadastrada.");
    const form = createForm();
    await userEvent.type(within(form).getByRole("textbox", { name: "Nome da rotina" }), "  Treino B  ");
    await userEvent.click(within(form).getByRole("checkbox", { name: "Sex" }));
    await userEvent.click(within(form).getByRole("checkbox", { name: "Seg" }));
    await userEvent.click(within(form).getByRole("button", { name: "Criar rotina" }));
    await waitFor(() => expect(api.createRoutine).toHaveBeenCalledWith({ name: "Treino B", weekdays: [1, 5] }));
    const created = await screen.findByRole("button", { name: "Treino B" });
    await waitFor(() => expect(created).toHaveAttribute("aria-pressed", "true"));
    expect(within(createForm()).getByRole("textbox", { name: "Nome da rotina" })).toHaveValue("");
    within(createForm()).getAllByRole("checkbox").forEach((d) => expect(d).not.toBeChecked());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends an empty weekday list when no day is chosen", async () => {
    api.createRoutine.mockResolvedValue(routine({ id: 3, name: "Livre" }));
    await renderPage();
    await screen.findByText("Nenhuma rotina cadastrada.");
    await userEvent.type(within(createForm()).getByRole("textbox", { name: "Nome da rotina" }), "Livre");
    await userEvent.click(within(createForm()).getByRole("button", { name: "Criar rotina" }));
    await waitFor(() => expect(api.createRoutine).toHaveBeenCalledWith({ name: "Livre", weekdays: [] }));
  });

  it("rejects blank and over-long names locally without calling the API", async () => {
    await renderPage();
    await screen.findByText("Nenhuma rotina cadastrada.");
    const input = within(createForm()).getByRole("textbox", { name: "Nome da rotina" });
    await userEvent.type(input, "   ");
    fireEvent.submit(createForm());
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe um nome para a rotina.");
    fireEvent.change(input, { target: { value: "x".repeat(151) } });
    fireEvent.submit(createForm());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("O nome deve ter no máximo 150 caracteres."));
    expect(api.createRoutine).not.toHaveBeenCalled();
  });

  it("keeps the typed name and days when saving fails", async () => {
    api.createRoutine.mockRejectedValue(new ApiRequestError(400, { code: "VALIDATION_ERROR", message: "bad" } as never));
    await renderPage();
    await screen.findByText("Nenhuma rotina cadastrada.");
    await userEvent.type(within(createForm()).getByRole("textbox", { name: "Nome da rotina" }), "Pernas");
    await userEvent.click(within(createForm()).getByRole("checkbox", { name: "Qua" }));
    await userEvent.click(within(createForm()).getByRole("button", { name: "Criar rotina" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dados inválidos. Verifique os campos.");
    expect(within(createForm()).getByRole("textbox", { name: "Nome da rotina" })).toHaveValue("Pernas");
    expect(within(createForm()).getByRole("checkbox", { name: "Qua" })).toBeChecked();
    expect(screen.queryByRole("button", { name: "Pernas" })).not.toBeInTheDocument();
  });

  it("blocks duplicate submits, including programmatic ones, while saving", async () => {
    const pending = deferred<TrainingRoutineResponse>();
    api.createRoutine.mockReturnValue(pending.promise);
    await renderPage();
    await screen.findByText("Nenhuma rotina cadastrada.");
    await userEvent.type(within(createForm()).getByRole("textbox", { name: "Nome da rotina" }), "Costas");
    const submit = within(createForm()).getByRole("button", { name: "Criar rotina" });
    act(() => {
      fireEvent.submit(createForm());
      fireEvent.submit(createForm());
    });
    await waitFor(() => expect(submit).toBeDisabled());
    fireEvent.submit(createForm());
    await userEvent.click(submit);
    expect(api.createRoutine).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(routine({ id: 9, name: "Costas" })));
    await waitFor(() => expect(submit).toBeEnabled());
  });

  it("invalidates only the owner's health cache and never touches local storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    api.createRoutine.mockResolvedValue(routine({ id: 5, name: "Core" }));
    const client = newClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await renderPage(client);
    await screen.findByText("Nenhuma rotina cadastrada.");
    await userEvent.type(within(createForm()).getByRole("textbox", { name: "Nome da rotina" }), "Core");
    await userEvent.click(within(createForm()).getByRole("button", { name: "Criar rotina" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    for (const [filters] of invalidate.mock.calls) {
      expect(filters?.queryKey).toEqual(["health", "user-a", "training"]);
    }
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

const selectedPanel = () => screen.getByRole("region", { name: "Rotina selecionada" });

describe("pending mutation controls", () => {
  it("locks the draft and routine selection during creation", async () => {
    const pending = deferred<TrainingRoutineResponse>();
    api.allRoutines.mockResolvedValue([routine(), routine({ id: 2, name: "Treino B" })]);
    api.createRoutine.mockReturnValue(pending.promise);
    await renderPage();
    await screen.findByRole("button", { name: "Treino B" });
    const form = createForm();
    await userEvent.type(within(form).getByRole("textbox"), "Nova");
    fireEvent.submit(form);
    await waitFor(() => expect(within(form).getByRole("button", { name: "Criar rotina" })).toBeDisabled());
    expect(within(form).getByRole("textbox")).toBeDisabled();
    within(form).getAllByRole("checkbox").forEach((day) => expect(day).toBeDisabled());
    expect(screen.getByRole("button", { name: "Treino B" })).toBeDisabled();
    await act(async () => pending.resolve(routine({ id: 3, name: "Nova" })));
    await waitFor(() => expect(within(form).getByRole("textbox")).toBeEnabled());
  });

  it("locks edit cancellation and selection until the save settles", async () => {
    const pending = deferred<TrainingRoutineResponse>();
    api.allRoutines.mockResolvedValue([routine(), routine({ id: 2, name: "Treino B" })]);
    api.updateRoutine.mockReturnValue(pending.promise);
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar rotina" }));
    const form = screen.getByRole("form", { name: "Editar rotina" });
    fireEvent.submit(form);
    await waitFor(() => expect(within(form).getByRole("button", { name: "Salvar alterações" })).toBeDisabled());
    expect(within(form).getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(within(form).getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Treino B" })).toBeDisabled();
    await act(async () => pending.resolve(routine()));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Editar rotina" })).not.toBeInTheDocument());
  });

  it("locks routine selection while deletion is pending", async () => {
    const pending = deferred<void>();
    api.allRoutines.mockResolvedValue([routine(), routine({ id: 2, name: "Treino B" })]);
    api.removeRoutine.mockReturnValue(pending.promise);
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    await userEvent.click(screen.getByRole("button", { name: "Excluir rotina" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(api.removeRoutine).toHaveBeenCalledWith(1));
    expect(screen.getByRole("button", { name: "Treino B" })).toBeDisabled();
    await act(async () => pending.resolve());
    await waitFor(() => expect(screen.getByRole("button", { name: "Treino B" })).toBeEnabled());
  });
});

describe("S3 — seleção, edição e exclusão", () => {
  it("shows the selected routine's details and follows a new selection", async () => {
    api.allRoutines.mockResolvedValue([
      routine({ id: 1, name: "Treino A", weekdays: [2, 4] }),
      routine({ id: 2, name: "Treino B", weekdays: [] }),
    ]);
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    expect(within(selectedPanel()).getByRole("heading", { name: "Treino A" })).toBeInTheDocument();
    expect(selectedPanel()).toHaveTextContent("Ter, Qui");
    await userEvent.click(screen.getByRole("button", { name: "Treino B" }));
    expect(within(selectedPanel()).getByRole("heading", { name: "Treino B" })).toBeInTheDocument();
    expect(selectedPanel()).toHaveTextContent("Sem dias definidos");
    expect(screen.getByRole("button", { name: "Treino A" })).toHaveAttribute("aria-pressed", "false");
    expect(api.allExercises).toHaveBeenCalledWith(1);
    expect(api.allExercises).toHaveBeenCalledWith(2);
    expect(api.getRoutine).not.toHaveBeenCalled();
  });

  it("edits name and weekdays from a prefilled form and closes it on success", async () => {
    let records = [routine({ id: 1, name: "Treino A", weekdays: [1, 3] })];
    api.allRoutines.mockImplementation(async () => [...records]);
    api.updateRoutine.mockImplementation(async (id, body) => {
      const updated = { ...records[0], id, name: body.name ?? records[0].name, weekdays: body.weekdays ?? [] };
      records = [updated];
      return updated;
    });
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    await userEvent.click(within(selectedPanel()).getByRole("button", { name: "Editar rotina" }));
    const form = screen.getByRole("form", { name: "Editar rotina" });
    const name = within(form).getByRole("textbox", { name: "Nome da rotina" });
    expect(name).toHaveValue("Treino A");
    expect(within(form).getByRole("checkbox", { name: "Seg" })).toBeChecked();
    expect(within(form).getByRole("checkbox", { name: "Qua" })).toBeChecked();
    await userEvent.clear(name);
    await userEvent.type(name, "  Treino A2 ");
    await userEvent.click(within(form).getByRole("checkbox", { name: "Seg" }));
    await userEvent.click(within(form).getByRole("checkbox", { name: "Sáb" }));
    await userEvent.click(within(form).getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(api.updateRoutine).toHaveBeenCalledWith(1, { name: "Treino A2", weekdays: [3, 6] }));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Editar rotina" })).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: "Treino A2" })).toHaveAttribute("aria-pressed", "true");
    expect(selectedPanel()).toHaveTextContent("Qua, Sáb");
  });

  it("cancels an edit without calling the API", async () => {
    api.allRoutines.mockResolvedValue([routine({ id: 1, name: "Treino A" })]);
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    await userEvent.click(within(selectedPanel()).getByRole("button", { name: "Editar rotina" }));
    await userEvent.click(within(screen.getByRole("form", { name: "Editar rotina" })).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("form", { name: "Editar rotina" })).not.toBeInTheDocument();
    expect(api.updateRoutine).not.toHaveBeenCalled();
  });

  it("keeps edited values and reports the error when the update fails", async () => {
    api.allRoutines.mockResolvedValue([routine({ id: 1, name: "Treino A", weekdays: [1] })]);
    api.updateRoutine.mockRejectedValue(new ApiRequestError(409, { code: "CONFLICT", message: "conflict" } as never));
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    await userEvent.click(within(selectedPanel()).getByRole("button", { name: "Editar rotina" }));
    const form = screen.getByRole("form", { name: "Editar rotina" });
    await userEvent.clear(within(form).getByRole("textbox", { name: "Nome da rotina" }));
    await userEvent.type(within(form).getByRole("textbox", { name: "Nome da rotina" }), "Novo nome");
    await userEvent.click(within(form).getByRole("checkbox", { name: "Dom" }));
    await userEvent.click(within(form).getByRole("button", { name: "Salvar alterações" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("A operação conflita com o estado atual");
    expect(within(form).getByRole("textbox", { name: "Nome da rotina" })).toHaveValue("Novo nome");
    expect(within(form).getByRole("checkbox", { name: "Seg" })).toBeChecked();
    expect(within(form).getByRole("checkbox", { name: "Dom" })).toBeChecked();
  });

  it("asks for confirmation before deleting and deletes once after confirming", async () => {
    let records = [routine({ id: 1, name: "Treino A" }), routine({ id: 2, name: "Treino B" })];
    api.allRoutines.mockImplementation(async () => [...records]);
    const pending = deferred<void>();
    api.removeRoutine.mockImplementation(async (id) => {
      await pending.promise;
      records = records.filter((r) => r.id !== id);
    });
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    await userEvent.click(within(selectedPanel()).getByRole("button", { name: "Excluir rotina" }));
    let dialog = screen.getByRole("alertdialog", { name: "Confirmar exclusão" });
    expect(dialog).toHaveTextContent("Excluir a rotina “Treino A” e seus exercícios?");
    expect(api.removeRoutine).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.removeRoutine).not.toHaveBeenCalled();
    await userEvent.click(within(selectedPanel()).getByRole("button", { name: "Excluir rotina" }));
    dialog = screen.getByRole("alertdialog", { name: "Confirmar exclusão" });
    const confirm = within(dialog).getByRole("button", { name: "Confirmar exclusão" });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    await act(async () => pending.resolve());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Treino A" })).not.toBeInTheDocument());
    expect(api.removeRoutine).toHaveBeenCalledTimes(1);
    expect(api.removeRoutine).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("region", { name: "Rotina selecionada" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Treino B" })).toBeInTheDocument();
  });

  it("keeps the selection and reports the error when deletion fails", async () => {
    api.allRoutines.mockResolvedValue([routine({ id: 1, name: "Treino A" })]);
    api.removeRoutine.mockRejectedValue(new ApiRequestError(503, { code: "UPSTREAM_UNAVAILABLE", message: "down" } as never));
    await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Treino A" }));
    await userEvent.click(within(selectedPanel()).getByRole("button", { name: "Excluir rotina" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirmar exclusão" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Banco de dados indisponível");
    expect(within(selectedPanel()).getByRole("heading", { name: "Treino A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Treino A" })).toBeInTheDocument();
  });
});

describe("S4 — troca de conta", () => {
  const byOwner: Record<string, TrainingRoutineResponse[]> = {};
  beforeEach(() => {
    byOwner["user-a"] = [routine({ id: 1, name: "Rotina da A", weekdays: [1] })];
    byOwner["user-b"] = [routine({ id: 2, name: "Rotina da B" })];
    api.allRoutines.mockImplementation(async () => [...(byOwner[auth.owner?.id ?? ""] ?? [])]);
  });

  async function switchTo(owner: OwnerResponse, rerender: () => void) {
    auth.owner = owner;
    act(() => rerender());
  }

  it("drops the previous account's list, selection, forms and errors", async () => {
    api.updateRoutine.mockRejectedValue(new ApiRequestError(409, { code: "CONFLICT", message: "conflict" } as never));
    const { rerender, client } = await renderPage();
    await userEvent.type(within(createForm()).getByRole("textbox", { name: "Nome da rotina" }), "Rascunho da A");
    await userEvent.click(within(createForm()).getByRole("checkbox", { name: "Ter" }));
    await userEvent.click(await screen.findByRole("button", { name: "Rotina da A" }));
    await userEvent.click(within(selectedPanel()).getByRole("button", { name: "Editar rotina" }));
    await userEvent.click(within(screen.getByRole("form", { name: "Editar rotina" })).getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await switchTo(USER_B, rerender);
    expect(await screen.findByRole("button", { name: "Rotina da B" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Rotina da A")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Rotina selecionada" })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Editar rotina" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(createForm()).getByRole("textbox", { name: "Nome da rotina" })).toHaveValue("");
    expect(within(createForm()).getByRole("checkbox", { name: "Ter" })).not.toBeChecked();
    const keys = client.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(["health", "user-b", "training", "routines"]);
  });

  it("never leaks a previous account's in-flight create into the new account", async () => {
    const pendingA = deferred<TrainingRoutineResponse>();
    api.createRoutine.mockImplementation((body) =>
      auth.owner?.id === "user-a" ? pendingA.promise : Promise.resolve(routine({ id: 3, name: body.name })),
    );
    const client = newClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { rerender } = await renderPage(client);
    await screen.findByRole("button", { name: "Rotina da A" });
    await userEvent.type(within(createForm()).getByRole("textbox", { name: "Nome da rotina" }), "Nova da A");
    await userEvent.click(within(createForm()).getByRole("button", { name: "Criar rotina" }));
    await waitFor(() => expect(api.createRoutine).toHaveBeenCalledTimes(1));

    await switchTo(USER_B, rerender);
    await screen.findByRole("button", { name: "Rotina da B" });
    // The new account is not blocked by the previous account's pending save.
    expect(within(createForm()).getByRole("button", { name: "Criar rotina" })).toBeEnabled();
    const loadsBefore = api.allRoutines.mock.calls.length;

    byOwner["user-a"].push(routine({ id: 99, name: "Nova da A" }));
    await act(async () => pendingA.resolve(routine({ id: 99, name: "Nova da A" })));
    await act(async () => undefined);

    expect(screen.queryByText("Nova da A")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Rotina selecionada" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rotina da B" })).toHaveAttribute("aria-pressed", "false");
    expect(invalidate).toHaveBeenCalled();
    for (const [filters] of invalidate.mock.calls) {
      expect(filters?.queryKey).toEqual(["health", "user-a", "training"]);
    }
    expect(api.allRoutines.mock.calls.length).toBe(loadsBefore);

    await userEvent.type(within(createForm()).getByRole("textbox", { name: "Nome da rotina" }), "Nova da B");
    await userEvent.click(within(createForm()).getByRole("button", { name: "Criar rotina" }));
    await waitFor(() => expect(api.createRoutine).toHaveBeenLastCalledWith({ name: "Nova da B", weekdays: [] }));
  });

  it("never shows a previous account's late mutation error", async () => {
    const pendingA = deferred<void>();
    api.removeRoutine.mockReturnValue(pendingA.promise);
    const { rerender } = await renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Rotina da A" }));
    await userEvent.click(within(selectedPanel()).getByRole("button", { name: "Excluir rotina" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(api.removeRoutine).toHaveBeenCalledWith(1));

    await switchTo(USER_B, rerender);
    await screen.findByRole("button", { name: "Rotina da B" });
    await act(async () => pendingA.reject(new ApiRequestError(503, { code: "UPSTREAM_UNAVAILABLE", message: "down" } as never)));
    await act(async () => undefined);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Rotina da A")).not.toBeInTheDocument();
  });
});
