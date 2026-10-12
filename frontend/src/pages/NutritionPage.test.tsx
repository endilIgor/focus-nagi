import type { ComponentType } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NutritionFoodResponse, NutritionMeal, OwnerResponse } from "../api/types";
import nutritionCss from "./NutritionPage.module.css?raw";

const auth = vi.hoisted(() => ({ owner: null as OwnerResponse | null }));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ owner: auth.owner, status: "authenticated", login: vi.fn(), logout: vi.fn(), retrySession: vi.fn() }),
}));
vi.mock("../api/nutrition", () => ({
  nutritionApi: {
    list: vi.fn(),
    all: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));
import { ApiRequestError } from "../api/client";
import { nutritionApi } from "../api/nutrition";

const api = vi.mocked(nutritionApi);
const USER_A: OwnerResponse = { id: "user-a", email: null, healthAccess: true };
const MEALS: ReadonlyArray<readonly [NutritionMeal, string]> = [
  ["BREAKFAST", "Café da manhã"],
  ["LUNCH", "Almoço"],
  ["AFTERNOON_SNACK", "Café da tarde"],
  ["DINNER", "Janta"],
];
const EMPTY_MEAL = "Nenhum alimento cadastrado.";
const fetchSpy = vi.fn();
// A glob yields an empty map for a missing file, so its absence fails an assertion, not the file transform.
const pageModules = import.meta.glob<{ NutritionPage: ComponentType }>("./NutritionPage.tsx");

async function loadPage(): Promise<ComponentType> {
  const load = pageModules["./NutritionPage.tsx"];
  expect(load, "NutritionPage.tsx must exist").toBeTypeOf("function");
  return (await load()).NutritionPage;
}

const food = (overrides: Partial<NutritionFoodResponse> = {}): NutritionFoodResponse => ({
  id: 1,
  meal: "BREAKFAST",
  name: "Ovos",
  quantity: "2 unidades",
  createdAt: "2026-10-12T10:00:00Z",
  updatedAt: "2026-10-12T10:00:00Z",
  ...overrides,
});

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function renderPage(client = newClient()) {
  const NutritionPage = await loadPage();
  const view = render(
    <QueryClientProvider client={client}>
      <NutritionPage />
    </QueryClientProvider>,
  );
  return { ...view, client };
}

/** Asserts the four meal sections exist (queryByRole first) and are rendered in the approved order. */
function expectMealSectionsInOrder(): HTMLElement[] {
  for (const [, label] of MEALS) {
    expect(screen.queryByRole("region", { name: label }), `section ${label}`).toBeInTheDocument();
  }
  const regions = MEALS.map(([, label]) => screen.getByRole("region", { name: label }));
  for (let i = 0; i < regions.length - 1; i += 1) {
    expect(regions[i].compareDocumentPosition(regions[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
  return regions;
}

const itemTexts = (region: HTMLElement) => within(region).queryAllByRole("listitem").map((li) => li.textContent ?? "");

beforeEach(() => {
  vi.resetAllMocks();
  auth.owner = USER_A;
  api.all.mockResolvedValue([]);
  // Any request outside the mocked nutrition client (other health/focus APIs) would reach fetch.
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("S1 — quatro refeições: estrutura, carregamento e listagem", () => {
  it("keeps the four ordered meal sections while loading, without a false empty state", async () => {
    api.all.mockReturnValue(new Promise(() => undefined));
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Alimentação" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Carregando alimentos")).toBeInTheDocument();
    const regions = expectMealSectionsInOrder();
    expect(screen.queryByText(EMPTY_MEAL)).not.toBeInTheDocument();
    for (const region of regions) expect(itemTexts(region)).toEqual([]);
  });

  it("shows one empty state per meal only after an empty successful load, with no invented content", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await renderPage();
    expect(await screen.findAllByText(EMPTY_MEAL)).toHaveLength(4);
    expect(screen.queryByLabelText("Carregando alimentos")).not.toBeInTheDocument();
    for (const region of expectMealSectionsInOrder()) {
      expect(within(region).queryByText(EMPTY_MEAL)).toBeInTheDocument();
      expect(itemTexts(region)).toEqual([]);
    }
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(document.body.textContent ?? "").not.toMatch(/kcal|caloria|prote[íi]na|carboidrato|macro|conclu[íi]d/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("reports a load error with retry, keeps the sections and never shows the empty state", async () => {
    api.all
      .mockRejectedValueOnce(new ApiRequestError(503, { code: "UPSTREAM_UNAVAILABLE", message: "down" } as never))
      .mockResolvedValueOnce([food({ name: "Recuperado" })]);
    await renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Banco de dados indisponível");
    expect(screen.queryByText(EMPTY_MEAL)).not.toBeInTheDocument();
    expectMealSectionsInOrder();
    expect(within(alert).queryByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    const breakfast = screen.getByRole("region", { name: "Café da manhã" });
    expect(await within(breakfast).findByText("Recuperado")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.all).toHaveBeenCalledTimes(2);
  });

  it("groups every food from all() by meal in API order, with and without quantity", async () => {
    const cycle: NutritionMeal[] = ["LUNCH", "BREAKFAST", "AFTERNOON_SNACK"];
    // More than one 20-item page proves the screen consumes the full collection, not the first page.
    const foods = Array.from({ length: 27 }, (_, i) =>
      food({ id: i + 1, meal: cycle[i % 3], name: `Alimento ${String(i + 1).padStart(2, "0")}`, quantity: `${i + 1} g` }),
    );
    foods[1] = food({ id: 2, meal: "BREAKFAST", name: "Café preto", quantity: null });
    api.all.mockResolvedValue(foods);
    await renderPage();
    await screen.findByText("Alimento 27");
    const [breakfast, lunch, snack, dinner] = expectMealSectionsInOrder();
    const expectedNames = (meal: NutritionMeal) => foods.filter((f) => f.meal === meal).map((f) => f.name);
    for (const [region, meal] of [[breakfast, "BREAKFAST"], [lunch, "LUNCH"], [snack, "AFTERNOON_SNACK"]] as const) {
      const texts = itemTexts(region);
      expect(texts).toHaveLength(expectedNames(meal).length);
      expectedNames(meal).forEach((name, i) => expect(texts[i]).toContain(name));
      expect(within(region).queryByText(EMPTY_MEAL)).not.toBeInTheDocument();
    }
    expect(itemTexts(lunch)[0]).toContain("1 g");
    expect(itemTexts(breakfast)[0]).toContain("Café preto");
    expect(itemTexts(breakfast)[0]).not.toMatch(/null|undefined/);
    expect(itemTexts(dinner)).toEqual([]);
    expect(within(dinner).queryByText(EMPTY_MEAL)).toBeInTheDocument();
    expect(api.all).toHaveBeenCalledTimes(1);
    expect(api.list).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("caches foods only under the owner's health nutrition key", async () => {
    const { client } = await renderPage();
    await screen.findAllByText(EMPTY_MEAL);
    expect(client.getQueryCache().getAll().map((q) => q.queryKey)).toEqual([["health", "user-a", "nutrition", "foods"]]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not query anything without an authenticated owner", async () => {
    auth.owner = null;
    const { client } = await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Alimentação" })).toBeInTheDocument();
    expect(api.all).not.toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(screen.queryByText(EMPTY_MEAL)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

const FOODS_KEY = ["health", "user-a", "nutrition", "foods"];
const NUTRITION_KEY = ["health", "user-a", "nutrition"];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const region = (label: string) => screen.getByRole("region", { name: label });
const nameField = (form: HTMLElement) => within(form).getByRole("textbox", { name: "Nome do alimento" });
const quantityField = (form: HTMLElement) => within(form).getByRole("textbox", { name: "Quantidade" });
const mealField = (form: HTMLElement) => within(form).getByRole("combobox", { name: "Refeição" });
const createButton = (form: HTMLElement) => within(form).getByRole("button", { name: "Criar alimento" });

/** Asserts the creation form and its controls exist (queryByRole first), so a missing feature fails an assertion. */
function expectCreateForm(): HTMLElement {
  expect(screen.queryByRole("form", { name: "Novo alimento" }), "form Novo alimento").toBeInTheDocument();
  const form = screen.getByRole("form", { name: "Novo alimento" });
  expect(within(form).queryByRole("textbox", { name: "Nome do alimento" }), "Nome do alimento").toBeInTheDocument();
  expect(within(form).queryByRole("textbox", { name: "Quantidade" }), "Quantidade").toBeInTheDocument();
  expect(within(form).queryByRole("combobox", { name: "Refeição" }), "Refeição").toBeInTheDocument();
  expect(within(form).queryByRole("button", { name: "Criar alimento" }), "Criar alimento").toBeInTheDocument();
  return form;
}

async function fillFood(form: HTMLElement, values: { name: string; quantity: string; meal: string }) {
  fireEvent.change(nameField(form), { target: { value: values.name } });
  fireEvent.change(quantityField(form), { target: { value: values.quantity } });
  await userEvent.selectOptions(mealField(form), values.meal);
}

describe("S2 — criar alimento: validação, erro e bloqueio", () => {
  it("creates a food in the explicitly chosen meal with trimmed values, writing the confirmed response before owner-only invalidation", async () => {
    const saved = food({ id: 7, meal: "LUNCH", name: "Arroz integral", quantity: "1 prato" });
    api.create.mockResolvedValue(saved);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { client } = await renderPage();
    await screen.findAllByText(EMPTY_MEAL);
    const form = expectCreateForm();
    const options = within(mealField(form)).getAllByRole("option") as HTMLOptionElement[];
    expect(options.map((o) => o.textContent)).toEqual(MEALS.map(([, label]) => label));
    expect(options.map((o) => o.value)).toEqual(MEALS.map(([meal]) => meal));
    const cancel = vi.spyOn(client, "cancelQueries");
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    await fillFood(form, { name: "  Arroz integral  ", quantity: "  1 prato  ", meal: "Almoço" });
    fireEvent.submit(form);
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ meal: "LUNCH", name: "Arroz integral", quantity: "1 prato" }));
    const lunch = region("Almoço");
    expect(await within(lunch).findByText("Arroz integral")).toBeInTheDocument();
    expect(itemTexts(lunch)).toEqual([expect.stringContaining("1 prato")]);
    for (const label of ["Café da manhã", "Café da tarde", "Janta"]) expect(itemTexts(region(label))).toEqual([]);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ queryKey: FOODS_KEY }));
    expect(client.getQueryData(FOODS_KEY)).toEqual([saved]);
    expect(invalidate).toHaveBeenCalled();
    invalidate.mock.calls.forEach(([filters]) => expect(filters?.queryKey).toEqual(NUTRITION_KEY));
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(invalidate.mock.invocationCallOrder[0]);
    await waitFor(() => expect(nameField(form)).toHaveValue(""));
    expect(quantityField(form)).toHaveValue("");
    expect(within(form).queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("creates foods without quantity, sending null for empty or whitespace-only quantity", async () => {
    api.create
      .mockResolvedValueOnce(food({ id: 3, meal: "DINNER", name: "Sopa", quantity: null }))
      .mockResolvedValueOnce(food({ id: 4, meal: "AFTERNOON_SNACK", name: "Fruta", quantity: null }));
    const { client } = await renderPage();
    await screen.findAllByText(EMPTY_MEAL);
    const form = expectCreateForm();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    await fillFood(form, { name: "Sopa", quantity: "", meal: "Janta" });
    fireEvent.submit(form);
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ meal: "DINNER", name: "Sopa", quantity: null }));
    const dinner = region("Janta");
    expect(await within(dinner).findByText("Sopa")).toBeInTheDocument();
    await waitFor(() => expect(createButton(form)).toBeEnabled());
    await fillFood(form, { name: " Fruta ", quantity: "    ", meal: "Café da tarde" });
    fireEvent.submit(form);
    await waitFor(() => expect(api.create).toHaveBeenLastCalledWith({ meal: "AFTERNOON_SNACK", name: "Fruta", quantity: null }));
    const snack = region("Café da tarde");
    expect(await within(snack).findByText("Fruta")).toBeInTheDocument();
    for (const section of [dinner, snack]) {
      expect(itemTexts(section)).toHaveLength(1);
      expect(itemTexts(section)[0]).not.toMatch(/null|undefined/);
    }
    expect(api.create).toHaveBeenCalledTimes(2);
  });

  it("rejects blank or too long names and too long quantities without requests, accepting the exact 150 limits", async () => {
    api.create.mockResolvedValue(food({ id: 5, meal: "BREAKFAST", name: "x".repeat(150), quantity: "q".repeat(150) }));
    const { client } = await renderPage();
    await screen.findAllByText(EMPTY_MEAL);
    const form = expectCreateForm();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    expect(nameField(form)).toHaveAttribute("maxlength", "150");
    expect(quantityField(form)).toHaveAttribute("maxlength", "150");
    for (const [name, quantity] of [
      ["", ""],
      ["   ", "1 g"],
      ["x".repeat(151), ""],
      ["Pão", "q".repeat(151)],
      ["Pão", `  ${"q".repeat(151)}  `],
    ]) {
      await fillFood(form, { name, quantity, meal: "Café da manhã" });
      fireEvent.submit(form);
      expect(await within(form).findByRole("alert")).toBeInTheDocument();
      expect(api.create).not.toHaveBeenCalled();
      expect(nameField(form)).toHaveValue(name);
      expect(quantityField(form)).toHaveValue(quantity);
    }
    await fillFood(form, { name: `  ${"x".repeat(150)}  `, quantity: ` ${"q".repeat(150)} `, meal: "Café da manhã" });
    fireEvent.submit(form);
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ meal: "BREAKFAST", name: "x".repeat(150), quantity: "q".repeat(150) }));
    expect(api.create).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(form).queryByRole("alert")).not.toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the typed draft and shows the API error when creation fails, leaving the list untouched, then retries", async () => {
    const saved = food({ id: 8, meal: "AFTERNOON_SNACK", name: "Iogurte", quantity: "1 pote" });
    api.create
      .mockRejectedValueOnce(new ApiRequestError(503, { code: "UPSTREAM_UNAVAILABLE", message: "down" } as never))
      .mockResolvedValueOnce(saved);
    const { client } = await renderPage();
    await screen.findAllByText(EMPTY_MEAL);
    const form = expectCreateForm();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    await fillFood(form, { name: "  Iogurte ", quantity: "1 pote", meal: "Café da tarde" });
    fireEvent.submit(form);
    const alert = await within(form).findByRole("alert");
    expect(alert).toHaveTextContent("Banco de dados indisponível");
    // The failure belongs to the form; it is not presented as a list load error.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(nameField(form)).toHaveValue("  Iogurte ");
    expect(quantityField(form)).toHaveValue("1 pote");
    expect(mealField(form)).toHaveValue("AFTERNOON_SNACK");
    await waitFor(() => expect(createButton(form)).toBeEnabled());
    expect(nameField(form)).toBeEnabled();
    expect(client.getQueryData(FOODS_KEY)).toEqual([]);
    expect(screen.getAllByText(EMPTY_MEAL)).toHaveLength(4);
    fireEvent.submit(form);
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
    expect(api.create).toHaveBeenNthCalledWith(2, { meal: "AFTERNOON_SNACK", name: "Iogurte", quantity: "1 pote" });
    expect(await within(region("Café da tarde")).findByText("Iogurte")).toBeInTheDocument();
    await waitFor(() => expect(within(form).queryByRole("alert")).not.toBeInTheDocument());
  });

  it("locks synchronously against programmatic double submits, disables every field while pending and merges an already refreshed response without duplicates", async () => {
    const pending = deferred<NutritionFoodResponse>();
    api.create.mockReturnValue(pending.promise);
    const { client } = await renderPage();
    await screen.findAllByText(EMPTY_MEAL);
    const form = expectCreateForm();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    await fillFood(form, { name: "Pão", quantity: "2 fatias", meal: "Café da manhã" });
    // Both submits land before React re-renders, so only a synchronous guard (not `disabled`) can stop the second.
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    for (const role of ["textbox", "combobox", "button"]) within(form).getAllByRole(role).forEach((el) => expect(el).toBeDisabled());
    fireEvent.submit(form);
    await act(async () => undefined);
    expect(api.create).toHaveBeenCalledTimes(1);
    const saved = food({ id: 7, meal: "BREAKFAST", name: "Pão", quantity: "2 fatias" });
    const other = food({ id: 9, meal: "BREAKFAST", name: "Café preto", quantity: null });
    // A refresh finished while the create was in flight and already holds the created record (in API order).
    act(() => {
      client.setQueryData(FOODS_KEY, [saved, other]);
    });
    await act(async () => pending.resolve(saved));
    await waitFor(() => expect(createButton(form)).toBeEnabled());
    expect(client.getQueryData(FOODS_KEY)).toEqual([saved, other]);
    const breakfast = region("Café da manhã");
    expect(itemTexts(breakfast)).toHaveLength(2);
    expect(itemTexts(breakfast)[0]).toContain("Pão");
    expect(itemTexts(breakfast)[1]).toContain("Café preto");
    expect(nameField(form)).toBeEnabled();
    expect(quantityField(form)).toBeEnabled();
    expect(mealField(form)).toBeEnabled();
    expect(nameField(form)).toHaveValue("");
  });

  it("cancels a stale in-flight read, refetches the owner's list without duplicates and never invalidates other domains", async () => {
    // Mutable server-side records: the create appends, later reads return the current list in id order.
    let records: NutritionFoodResponse[] = [food({ id: 2, meal: "LUNCH", name: "Feijão", quantity: "1 concha" })];
    const stale = deferred<NutritionFoodResponse[]>();
    api.all.mockReturnValueOnce(stale.promise).mockImplementation(async () => records.map((r) => ({ ...r })));
    api.create.mockImplementation(async (body) => {
      const saved = food({ id: 3, meal: body.meal, name: body.name, quantity: body.quantity ?? null });
      records = [...records, saved];
      return saved;
    });
    const { client } = await renderPage();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    expect(screen.queryByLabelText("Carregando alimentos")).toBeInTheDocument();
    const form = expectCreateForm();
    await fillFood(form, { name: "Salada", quantity: "", meal: "Almoço" });
    fireEvent.submit(form);
    const lunch = region("Almoço");
    await waitFor(() => expect(itemTexts(lunch)).toHaveLength(2));
    expect(api.create).toHaveBeenCalledWith({ meal: "LUNCH", name: "Salada", quantity: null });
    await act(async () => stale.resolve([]));
    expect(itemTexts(lunch)).toEqual([expect.stringContaining("Feijão"), expect.stringContaining("Salada")]);
    expect(client.getQueryData(FOODS_KEY)).toEqual(records);
    expect(api.all).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalled();
    invalidate.mock.calls.forEach(([filters]) => expect(filters?.queryKey).toEqual(NUTRITION_KEY));
    expect(client.getQueryCache().getAll().map((q) => q.queryKey)).toEqual([FOODS_KEY]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

const upstreamDown = () => new ApiRequestError(503, { code: "UPSTREAM_UNAVAILABLE", message: "down" } as never);
const button = (container: HTMLElement, name: string) => within(container).getByRole("button", { name });
const rowActions = () => screen.queryAllByRole("button", { name: /^(Editar|Excluir) alimento / });

/** Asserts a food row action exists (queryByRole + not.toBeNull first), so a missing feature fails an assertion. */
function foodAction(action: "Editar" | "Excluir", name: string): HTMLElement {
  const label = `${action} alimento ${name}`;
  expect(screen.queryByRole("button", { name: label }), label).not.toBeNull();
  return screen.getByRole("button", { name: label });
}

function expectEditForm(): HTMLElement {
  expect(screen.queryByRole("form", { name: "Editar alimento" }), "form Editar alimento").not.toBeNull();
  const form = screen.getByRole("form", { name: "Editar alimento" });
  for (const [role, label] of [
    ["textbox", "Nome do alimento"],
    ["textbox", "Quantidade"],
    ["combobox", "Refeição"],
    ["button", "Salvar alimento"],
    ["button", "Cancelar"],
  ] as const) {
    expect(within(form).queryByRole(role, { name: label }), label).not.toBeNull();
  }
  return form;
}

function expectDeleteDialog(name: string): HTMLElement {
  const label = `Excluir alimento ${name}`;
  expect(screen.queryByRole("alertdialog", { name: label }), `alertdialog ${label}`).not.toBeNull();
  const dialog = screen.getByRole("alertdialog", { name: label });
  expect(within(dialog).queryByRole("button", { name: "Confirmar exclusão" }), "Confirmar exclusão").not.toBeNull();
  expect(within(dialog).queryByRole("button", { name: "Cancelar" }), "Cancelar").not.toBeNull();
  return dialog;
}

/** Every row action plus every field/button inside the given containers must be disabled. */
function expectEveryControlDisabled(...containers: HTMLElement[]) {
  const actions = rowActions();
  expect(actions.length).toBeGreaterThan(0);
  const controls = containers.flatMap((c) => ["textbox", "combobox", "button"].flatMap((role) => within(c).queryAllByRole(role)));
  for (const el of [...actions, ...controls]) expect(el).toBeDisabled();
}

/** Mutable server-side records: all() returns copies in id order; update/remove change them like the API does. */
function serverRecords(initial: NutritionFoodResponse[]) {
  const server = { records: initial };
  api.all.mockImplementation(async () => server.records.map((r) => ({ ...r })));
  api.update.mockImplementation(async (id, body) => {
    const current = server.records.find((r) => r.id === id);
    if (!current) throw new Error(`unknown food ${id}`);
    const saved: NutritionFoodResponse = {
      ...current,
      meal: body.meal ?? current.meal,
      name: body.name ?? current.name,
      quantity: body.quantity === undefined ? current.quantity : body.quantity,
      updatedAt: "2026-10-12T11:00:00Z",
    };
    server.records = server.records.map((r) => (r.id === id ? saved : r));
    return { ...saved };
  });
  api.remove.mockImplementation(async (id) => {
    server.records = server.records.filter((r) => r.id !== id);
  });
  return server;
}

describe("S3 — editar, mover e excluir alimento", () => {
  it("prefills the editor and saves trimmed values in place, clearing quantity with null and moving foods while keeping id and registration order", async () => {
    const server = serverRecords([
      food({ id: 1, meal: "LUNCH", name: "Arroz", quantity: "1 prato" }),
      food({ id: 2, meal: "BREAKFAST", name: "Pão", quantity: "2 fatias" }),
      food({ id: 3, meal: "LUNCH", name: "Feijão", quantity: "1 concha" }),
      food({ id: 4, meal: "BREAKFAST", name: "Ovos", quantity: "2 unidades" }),
    ]);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { client } = await renderPage();
    await screen.findByText("Pão");
    await userEvent.click(foodAction("Editar", "Pão"));
    let form = expectEditForm();
    expect(nameField(form)).toHaveValue("Pão");
    expect(quantityField(form)).toHaveValue("2 fatias");
    expect(mealField(form)).toHaveValue("BREAKFAST");
    const cancel = vi.spyOn(client, "cancelQueries");
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    await fillFood(form, { name: "  Pão francês  ", quantity: "   ", meal: "Almoço" });
    fireEvent.submit(form);
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(2, { meal: "LUNCH", name: "Pão francês", quantity: null }));
    const lunch = region("Almoço");
    const breakfast = region("Café da manhã");
    // Moving reflects immediately from the confirmed response, in registration (id) order, without a refetch.
    await waitFor(() => expect(itemTexts(lunch)).toHaveLength(3));
    expect(itemTexts(lunch)[0]).toContain("Arroz");
    expect(itemTexts(lunch)[1]).toContain("Pão francês");
    expect(itemTexts(lunch)[2]).toContain("Feijão");
    expect(itemTexts(lunch)[1]).not.toMatch(/2 fatias|null|undefined/);
    expect(within(lunch).queryByRole("button", { name: "Editar alimento Pão francês" })).not.toBeNull();
    expect(itemTexts(breakfast)).toEqual([expect.stringContaining("Ovos")]);
    expect(within(breakfast).queryByText("Pão")).toBeNull();
    await waitFor(() => expect(screen.queryByRole("form", { name: "Editar alimento" })).toBeNull());
    expect(client.getQueryData<NutritionFoodResponse[]>(FOODS_KEY)?.map((f) => f.id)).toEqual([1, 2, 3, 4]);
    expect(client.getQueryData(FOODS_KEY)).toEqual(server.records);
    expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ queryKey: FOODS_KEY }));
    expect(invalidate).toHaveBeenCalled();
    invalidate.mock.calls.forEach(([filters]) => expect(filters?.queryKey).toEqual(NUTRITION_KEY));
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(invalidate.mock.invocationCallOrder[0]);

    await waitFor(() => expect(foodAction("Editar", "Ovos")).toBeEnabled());
    await userEvent.click(foodAction("Editar", "Ovos"));
    form = expectEditForm();
    expect(nameField(form)).toHaveValue("Ovos");
    expect(quantityField(form)).toHaveValue("2 unidades");
    expect(mealField(form)).toHaveValue("BREAKFAST");
    await fillFood(form, { name: "Ovos", quantity: "  3 unidades ", meal: "Janta" });
    fireEvent.submit(form);
    await waitFor(() => expect(api.update).toHaveBeenLastCalledWith(4, { meal: "DINNER", name: "Ovos", quantity: "3 unidades" }));
    const dinner = region("Janta");
    await waitFor(() => expect(itemTexts(dinner)).toEqual([expect.stringContaining("Ovos")]));
    expect(itemTexts(dinner)[0]).toContain("3 unidades");
    expect(itemTexts(breakfast)).toEqual([]);
    expect(within(breakfast).queryByText(EMPTY_MEAL)).not.toBeNull();
    expect(client.getQueryData(FOODS_KEY)).toEqual(server.records);
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(api.all).toHaveBeenCalledTimes(1);
    expect(api.create).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("opens the editor focused on the name and cancels without requests, discarding the draft and restoring focus to its trigger", async () => {
    serverRecords([
      food({ id: 1, meal: "BREAKFAST", name: "Ovos", quantity: "2 unidades" }),
      food({ id: 2, meal: "DINNER", name: "Sopa", quantity: null }),
    ]);
    await renderPage();
    await screen.findByText("Ovos");
    await userEvent.click(foodAction("Editar", "Ovos"));
    let form = expectEditForm();
    expect(nameField(form)).toHaveFocus();
    expect(nameField(form)).toHaveValue("Ovos");
    await fillFood(form, { name: "Mudado", quantity: "9 g", meal: "Janta" });
    await userEvent.click(button(form, "Cancelar"));
    expect(screen.queryByRole("form", { name: "Editar alimento" })).toBeNull();
    expect(foodAction("Editar", "Ovos")).toHaveFocus();
    expect(itemTexts(region("Café da manhã"))).toEqual([expect.stringContaining("Ovos")]);
    expect(itemTexts(region("Janta"))).toEqual([expect.stringContaining("Sopa")]);
    expect(screen.queryByText("Mudado")).toBeNull();

    await userEvent.click(foodAction("Editar", "Ovos"));
    form = expectEditForm();
    expect(nameField(form)).toHaveValue("Ovos");
    expect(quantityField(form)).toHaveValue("2 unidades");
    expect(mealField(form)).toHaveValue("BREAKFAST");
    await userEvent.click(button(form, "Cancelar"));
    expect(foodAction("Editar", "Ovos")).toHaveFocus();

    // A food without quantity opens with an empty field, never a fake "null".
    await userEvent.click(foodAction("Editar", "Sopa"));
    form = expectEditForm();
    expect(nameField(form)).toHaveFocus();
    expect(quantityField(form)).toHaveValue("");
    expect(mealField(form)).toHaveValue("DINNER");
    await userEvent.click(button(form, "Cancelar"));
    expect(foodAction("Editar", "Sopa")).toHaveFocus();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.remove).not.toHaveBeenCalled();
    expect(api.all).toHaveBeenCalledTimes(1);
  });

  it("keeps the edited draft open with the error when saving is invalid or fails, leaving list and cache untouched, then retries", async () => {
    const server = serverRecords([food({ id: 1, meal: "BREAKFAST", name: "Ovos", quantity: "2 unidades" })]);
    const confirmed = server.records.map((r) => ({ ...r }));
    api.update.mockRejectedValueOnce(upstreamDown());
    const { client } = await renderPage();
    await screen.findByText("Ovos");
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    await userEvent.click(foodAction("Editar", "Ovos"));
    const form = expectEditForm();
    await fillFood(form, { name: "   ", quantity: "", meal: "Janta" });
    fireEvent.submit(form);
    expect(await within(form).findByRole("alert")).toBeInTheDocument();
    expect(api.update).not.toHaveBeenCalled();

    await fillFood(form, { name: " Ovos mexidos ", quantity: "", meal: "Janta" });
    fireEvent.submit(form);
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(within(form).getByRole("alert")).toHaveTextContent("Banco de dados indisponível"));
    // The failure belongs to the editor; it is not presented as a list load error.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByRole("form", { name: "Editar alimento" })).not.toBeNull();
    expect(nameField(form)).toHaveValue(" Ovos mexidos ");
    expect(quantityField(form)).toHaveValue("");
    expect(mealField(form)).toHaveValue("DINNER");
    await waitFor(() => expect(button(form, "Salvar alimento")).toBeEnabled());
    expect(nameField(form)).toBeEnabled();
    expect(client.getQueryData(FOODS_KEY)).toEqual(confirmed);
    expect(itemTexts(region("Café da manhã"))).toEqual([expect.stringContaining("Ovos")]);
    expect(itemTexts(region("Janta"))).toEqual([]);
    expect(within(region("Janta")).queryByText(EMPTY_MEAL)).not.toBeNull();

    fireEvent.submit(form);
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
    expect(api.update).toHaveBeenNthCalledWith(1, 1, { meal: "DINNER", name: "Ovos mexidos", quantity: null });
    expect(api.update).toHaveBeenNthCalledWith(2, 1, { meal: "DINNER", name: "Ovos mexidos", quantity: null });
    expect(await within(region("Janta")).findByText("Ovos mexidos")).toBeInTheDocument();
    expect(within(region("Café da manhã")).queryByText(EMPTY_MEAL)).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole("form", { name: "Editar alimento" })).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(client.getQueryData(FOODS_KEY)).toEqual(server.records);
  });

  it("asks for an inline confirmation focused on Cancelar, cancels without requests and keeps the confirmation open to retry a failed deletion", async () => {
    const server = serverRecords([
      food({ id: 1, meal: "BREAKFAST", name: "Ovos", quantity: "2 unidades" }),
      food({ id: 2, meal: "BREAKFAST", name: "Pão", quantity: "2 fatias" }),
    ]);
    const confirmed = server.records.map((r) => ({ ...r }));
    api.remove.mockRejectedValueOnce(upstreamDown());
    const { client } = await renderPage();
    await screen.findByText("Ovos");
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    await userEvent.click(foodAction("Excluir", "Ovos"));
    let dialog = expectDeleteDialog("Ovos");
    expect(button(dialog, "Cancelar")).toHaveFocus();
    await userEvent.click(button(dialog, "Cancelar"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.remove).not.toHaveBeenCalled();
    expect(foodAction("Excluir", "Ovos")).toHaveFocus();
    expect(itemTexts(region("Café da manhã"))).toHaveLength(2);

    await userEvent.click(foodAction("Excluir", "Ovos"));
    dialog = expectDeleteDialog("Ovos");
    await userEvent.click(button(dialog, "Confirmar exclusão"));
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Banco de dados indisponível"));
    expect(api.remove).toHaveBeenCalledWith(1);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByRole("alertdialog", { name: "Excluir alimento Ovos" })).not.toBeNull();
    await waitFor(() => expect(button(dialog, "Confirmar exclusão")).toBeEnabled());
    expect(client.getQueryData(FOODS_KEY)).toEqual(confirmed);
    const breakfast = region("Café da manhã");
    expect(itemTexts(breakfast)).toHaveLength(2);
    expect(itemTexts(breakfast)[0]).toContain("Ovos");
    expect(itemTexts(breakfast)[1]).toContain("Pão");

    await userEvent.click(button(dialog, "Confirmar exclusão"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.remove).toHaveBeenCalledTimes(2);
    expect(api.remove).toHaveBeenNthCalledWith(2, 1);
    expect(itemTexts(breakfast)).toEqual([expect.stringContaining("Pão")]);
    expect(client.getQueryData(FOODS_KEY)).toEqual(server.records);
    expect(api.update).not.toHaveBeenCalled();
    expect(api.all).toHaveBeenCalledTimes(1);
  });

  it("removes a confirmed deletion from the owner's cache before refreshing, cancelling a stale read, invalidating only nutrition and focusing the meal heading", async () => {
    const server = serverRecords([
      food({ id: 1, meal: "BREAKFAST", name: "Ovos", quantity: "2 unidades" }),
      food({ id: 2, meal: "LUNCH", name: "Arroz", quantity: "1 prato" }),
    ]);
    const before = server.records.map((r) => ({ ...r }));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { client } = await renderPage();
    await screen.findByText("Ovos");
    const breakfast = region("Café da manhã");
    // A refresh started before the deletion still carries the deleted food; the post-delete refresh is held open.
    const stale = deferred<NutritionFoodResponse[]>();
    const refresh = deferred<NutritionFoodResponse[]>();
    api.all.mockReturnValueOnce(stale.promise).mockReturnValueOnce(refresh.promise);
    act(() => {
      void client.refetchQueries({ queryKey: FOODS_KEY });
    });
    await waitFor(() => expect(api.all).toHaveBeenCalledTimes(2));
    const cancel = vi.spyOn(client, "cancelQueries");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await userEvent.click(foodAction("Excluir", "Ovos"));
    const dialog = expectDeleteDialog("Ovos");
    await userEvent.click(button(dialog, "Confirmar exclusão"));
    await waitFor(() => expect(api.all).toHaveBeenCalledTimes(3));
    expect(api.remove).toHaveBeenCalledTimes(1);
    expect(api.remove).toHaveBeenCalledWith(1);
    // The confirmed removal is already on screen while the refresh is still in flight.
    expect(itemTexts(breakfast)).toEqual([]);
    expect(client.getQueryData(FOODS_KEY)).toEqual([before[1]]);
    await act(async () => stale.resolve(before.map((r) => ({ ...r }))));
    expect(itemTexts(breakfast)).toEqual([]);
    expect(screen.queryByText("Ovos")).toBeNull();
    await act(async () => refresh.resolve(server.records.map((r) => ({ ...r }))));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(within(breakfast).getByRole("heading", { level: 2, name: "Café da manhã" })).toHaveFocus());
    expect(within(breakfast).queryByText(EMPTY_MEAL)).not.toBeNull();
    expect(itemTexts(region("Almoço"))).toEqual([expect.stringContaining("Arroz")]);
    expect(client.getQueryData(FOODS_KEY)).toEqual(server.records);
    expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ queryKey: FOODS_KEY }));
    expect(invalidate).toHaveBeenCalled();
    invalidate.mock.calls.forEach(([filters]) => expect(filters?.queryKey).toEqual(NUTRITION_KEY));
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(invalidate.mock.invocationCallOrder[0]);
    expect(client.getQueryCache().getAll().map((q) => q.queryKey)).toEqual([FOODS_KEY]);
    expect(api.all).toHaveBeenCalledTimes(3);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("shares one synchronous lock across create, edit and delete, disabling every control while any of them is pending", async () => {
    serverRecords([
      food({ id: 1, meal: "BREAKFAST", name: "Ovos", quantity: "2 unidades" }),
      food({ id: 2, meal: "LUNCH", name: "Arroz", quantity: "1 prato" }),
    ]);
    const created = deferred<NutritionFoodResponse>();
    const updated = deferred<NutritionFoodResponse>();
    const removed = deferred<void>();
    api.create.mockReturnValue(created.promise);
    api.update.mockReturnValue(updated.promise);
    api.remove.mockReturnValue(removed.promise);
    const { client } = await renderPage();
    await screen.findByText("Arroz");
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const createForm = expectCreateForm();
    await userEvent.click(foodAction("Editar", "Arroz"));
    let editForm = expectEditForm();
    await fillFood(editForm, { name: "Arroz integral", quantity: "1 prato", meal: "Almoço" });
    await fillFood(createForm, { name: "Pão", quantity: "2 fatias", meal: "Café da manhã" });

    // Create and edit submitted in the same tick: only the first one reaches the API.
    act(() => {
      fireEvent.submit(createForm);
      fireEvent.submit(editForm);
    });
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.update).not.toHaveBeenCalled();
    expectEveryControlDisabled(createForm, editForm);
    await act(async () => created.resolve(food({ id: 3, meal: "BREAKFAST", name: "Pão", quantity: "2 fatias" })));
    await waitFor(() => expect(button(createForm, "Criar alimento")).toBeEnabled());
    // The ignored edit keeps its draft open.
    editForm = expectEditForm();
    expect(nameField(editForm)).toHaveValue("Arroz integral");
    expect(button(editForm, "Salvar alimento")).toBeEnabled();
    expect(foodAction("Editar", "Pão")).toBeEnabled();

    // Double edit submit plus a create in the same tick: a single update, no create.
    await fillFood(createForm, { name: "Banana", quantity: "", meal: "Café da tarde" });
    act(() => {
      fireEvent.submit(editForm);
      fireEvent.submit(editForm);
      fireEvent.submit(createForm);
    });
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    expect(api.update).toHaveBeenCalledWith(2, { meal: "LUNCH", name: "Arroz integral", quantity: "1 prato" });
    expect(api.create).toHaveBeenCalledTimes(1);
    expectEveryControlDisabled(createForm, editForm);
    expect(button(editForm, "Cancelar")).toBeDisabled();
    await act(async () => updated.resolve(food({ id: 2, meal: "LUNCH", name: "Arroz integral", quantity: "1 prato" })));
    await waitFor(() => expect(screen.queryByRole("form", { name: "Editar alimento" })).toBeNull());
    expect(nameField(createForm)).toHaveValue("Banana");

    // Double confirmation plus a create in the same tick: a single delete, no create.
    await waitFor(() => expect(foodAction("Excluir", "Ovos")).toBeEnabled());
    await userEvent.click(foodAction("Excluir", "Ovos"));
    const dialog = expectDeleteDialog("Ovos");
    act(() => {
      fireEvent.click(button(dialog, "Confirmar exclusão"));
      fireEvent.click(button(dialog, "Confirmar exclusão"));
      fireEvent.submit(createForm);
    });
    await waitFor(() => expect(api.remove).toHaveBeenCalledTimes(1));
    expect(api.remove).toHaveBeenCalledWith(1);
    expect(api.create).toHaveBeenCalledTimes(1);
    expectEveryControlDisabled(createForm, dialog);
    expect(button(dialog, "Cancelar")).toBeDisabled();
    await act(async () => removed.resolve());
    await waitFor(() => expect(screen.queryByText("Ovos")).toBeNull());
    await waitFor(() => expect(button(createForm, "Criar alimento")).toBeEnabled());
    for (const action of rowActions()) expect(action).toBeEnabled();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.remove).toHaveBeenCalledTimes(1);
  });
});

const USER_B: OwnerResponse = { id: "user-b", email: null, healthAccess: true };
const B_FOODS_KEY = ["health", "user-b", "nutrition", "foods"];

describe("S4 — regressões: isolamento entre contas, respostas tardias e refresh falho", () => {
  const byOwner: Record<string, NutritionFoodResponse[]> = {};
  beforeEach(() => {
    byOwner["user-a"] = [
      food({ id: 1, meal: "BREAKFAST", name: "Ovos", quantity: "2 unidades" }),
      food({ id: 2, meal: "LUNCH", name: "Arroz", quantity: "1 prato" }),
    ];
    // Same id 1 as the first account's food: isolation must come from the owner key, not from ids.
    byOwner["user-b"] = [food({ id: 1, meal: "BREAKFAST", name: "Pão", quantity: "2 fatias" })];
    api.all.mockImplementation(async () => (byOwner[auth.owner?.id ?? ""] ?? []).map((r) => ({ ...r })));
  });

  /** Renders the page and returns a switch that re-renders it for another authenticated account. */
  async function renderSwitchable(client = newClient()) {
    const NutritionPage = await loadPage();
    const tree = () => (
      <QueryClientProvider client={client}>
        <NutritionPage />
      </QueryClientProvider>
    );
    const view = render(tree());
    const switchTo = (owner: OwnerResponse) => {
      auth.owner = owner;
      act(() => view.rerender(tree()));
    };
    return { client, switchTo };
  }

  /** Switches to the second account and waits for its confirmed list. */
  async function switchToB(switchTo: (owner: OwnerResponse) => void) {
    switchTo(USER_B);
    expect(await screen.findByText("Pão")).toBeInTheDocument();
  }

  it("resets the create draft, the open editor, the open confirmation and their errors when the account changes", async () => {
    api.create.mockRejectedValue(upstreamDown());
    api.update.mockRejectedValue(upstreamDown());
    api.remove.mockRejectedValue(upstreamDown());
    const { client, switchTo } = await renderSwitchable();
    await screen.findByText("Ovos");
    await userEvent.click(foodAction("Excluir", "Ovos"));
    const dialog = expectDeleteDialog("Ovos");
    await userEvent.click(button(dialog, "Confirmar exclusão"));
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Banco de dados indisponível"));
    await waitFor(() => expect(foodAction("Editar", "Arroz")).toBeEnabled());
    await userEvent.click(foodAction("Editar", "Arroz"));
    const editForm = expectEditForm();
    await fillFood(editForm, { name: "Arroz da A", quantity: "3 colheres", meal: "Janta" });
    fireEvent.submit(editForm);
    await waitFor(() => expect(within(editForm).getByRole("alert")).toHaveTextContent("Banco de dados indisponível"));
    const createForm = expectCreateForm();
    await waitFor(() => expect(createButton(createForm)).toBeEnabled());
    await fillFood(createForm, { name: "Rascunho da A", quantity: "1 g", meal: "Janta" });
    fireEvent.submit(createForm);
    await waitFor(() => expect(within(createForm).getByRole("alert")).toHaveTextContent("Banco de dados indisponível"));
    // Precondition: the first account has a draft, an editor and a confirmation, each with its own error.
    expect(screen.getAllByRole("alert")).toHaveLength(3);

    await switchToB(switchTo);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("form", { name: "Editar alimento" })).toBeNull();
    expect(screen.queryByText(/Ovos|Arroz/)).toBeNull();
    const form = expectCreateForm();
    expect(nameField(form)).toHaveValue("");
    expect(quantityField(form)).toHaveValue("");
    expect(mealField(form)).toHaveValue("BREAKFAST");
    expect(createButton(form)).toBeEnabled();
    expect(itemTexts(region("Café da manhã"))).toEqual([expect.stringContaining("Pão")]);
    for (const label of ["Almoço", "Café da tarde", "Janta"]) expect(itemTexts(region(label))).toEqual([]);
    expect(foodAction("Editar", "Pão")).toBeEnabled();
    expect(foodAction("Excluir", "Pão")).toBeEnabled();
    expect(client.getQueryData(B_FOODS_KEY)).toEqual(byOwner["user-b"]);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.remove).toHaveBeenCalledTimes(1);
  });

  it("applies a late create success only to the previous account's cache, without refreshing, clearing or focusing the new account", async () => {
    const pendingA = deferred<NutritionFoodResponse>();
    api.create.mockReturnValueOnce(pendingA.promise);
    const { client, switchTo } = await renderSwitchable();
    await screen.findByText("Ovos");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await fillFood(expectCreateForm(), { name: "Nova da A", quantity: "", meal: "Janta" });
    fireEvent.submit(expectCreateForm());
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ meal: "DINNER", name: "Nova da A", quantity: null }));

    await switchToB(switchTo);
    const form = expectCreateForm();
    // The new account is not blocked by the previous account's pending save.
    expect(createButton(form)).toBeEnabled();
    fireEvent.change(nameField(form), { target: { value: "Rascunho da B" } });
    act(() => nameField(form).focus());
    const loads = api.all.mock.calls.length;

    const saved = food({ id: 3, meal: "DINNER", name: "Nova da A", quantity: null });
    byOwner["user-a"].push(saved);
    await act(async () => pendingA.resolve(saved));
    await waitFor(() => expect(invalidate).toHaveBeenCalled());

    expect(screen.queryByText("Nova da A")).toBeNull();
    expect(itemTexts(region("Janta"))).toEqual([]);
    expect(client.getQueryData(B_FOODS_KEY)).toEqual(byOwner["user-b"]);
    expect(client.getQueryData<NutritionFoodResponse[]>(FOODS_KEY)).toContainEqual(saved);
    invalidate.mock.calls.forEach(([filters]) => expect(filters?.queryKey).toEqual(NUTRITION_KEY));
    expect(api.all.mock.calls.length).toBe(loads);
    expect(nameField(form)).toHaveFocus();
    expect(nameField(form)).toHaveValue("Rascunho da B");
    expect(createButton(form)).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("applies a late edit of a food with the same id only to the previous account, keeping the new account's food and focus", async () => {
    const pendingA = deferred<NutritionFoodResponse>();
    api.update.mockReturnValueOnce(pendingA.promise);
    const { client, switchTo } = await renderSwitchable();
    await screen.findByText("Ovos");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await userEvent.click(foodAction("Editar", "Ovos"));
    const editForm = expectEditForm();
    await fillFood(editForm, { name: "Ovos mexidos", quantity: "", meal: "Janta" });
    fireEvent.submit(editForm);
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(1, { meal: "DINNER", name: "Ovos mexidos", quantity: null }));

    await switchToB(switchTo);
    expect(screen.queryByRole("form", { name: "Editar alimento" })).toBeNull();
    const editB = foodAction("Editar", "Pão");
    expect(editB).toBeEnabled();
    act(() => editB.focus());
    const loads = api.all.mock.calls.length;

    const updated = food({ ...byOwner["user-a"][0], meal: "DINNER", name: "Ovos mexidos", quantity: null });
    await act(async () => pendingA.resolve(updated));
    await waitFor(() => expect(invalidate).toHaveBeenCalled());

    expect(screen.queryByText("Ovos mexidos")).toBeNull();
    expect(itemTexts(region("Café da manhã"))).toEqual([expect.stringContaining("Pão")]);
    expect(itemTexts(region("Janta"))).toEqual([]);
    expect(within(region("Janta")).queryByText(EMPTY_MEAL)).not.toBeNull();
    expect(client.getQueryData(B_FOODS_KEY)).toEqual(byOwner["user-b"]);
    expect(client.getQueryData<NutritionFoodResponse[]>(FOODS_KEY)?.find((f) => f.id === 1)).toEqual(updated);
    invalidate.mock.calls.forEach(([filters]) => expect(filters?.queryKey).toEqual(NUTRITION_KEY));
    expect(api.all.mock.calls.length).toBe(loads);
    expect(foodAction("Editar", "Pão")).toHaveFocus();
    expect(screen.queryByRole("form", { name: "Editar alimento" })).toBeNull();
  });

  it("applies a late deletion of a food with the same id only to the previous account, without moving focus to a meal heading", async () => {
    const pendingA = deferred<void>();
    api.remove.mockReturnValueOnce(pendingA.promise);
    const { client, switchTo } = await renderSwitchable();
    await screen.findByText("Ovos");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await userEvent.click(foodAction("Excluir", "Ovos"));
    await userEvent.click(button(expectDeleteDialog("Ovos"), "Confirmar exclusão"));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(1));

    await switchToB(switchTo);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    const form = expectCreateForm();
    act(() => nameField(form).focus());
    const loads = api.all.mock.calls.length;

    await act(async () => pendingA.resolve());
    await waitFor(() => expect(invalidate).toHaveBeenCalled());

    const breakfast = region("Café da manhã");
    expect(itemTexts(breakfast)).toEqual([expect.stringContaining("Pão")]);
    expect(foodAction("Excluir", "Pão")).toBeEnabled();
    expect(client.getQueryData(B_FOODS_KEY)).toEqual(byOwner["user-b"]);
    expect(client.getQueryData<NutritionFoodResponse[]>(FOODS_KEY)?.map((f) => f.id)).toEqual([2]);
    invalidate.mock.calls.forEach(([filters]) => expect(filters?.queryKey).toEqual(NUTRITION_KEY));
    expect(api.all.mock.calls.length).toBe(loads);
    expect(nameField(form)).toHaveFocus();
    expect(within(breakfast).getByRole("heading", { level: 2, name: "Café da manhã" })).not.toHaveFocus();
  });

  it("never shows the previous account's late save failure or its draft in the new account", async () => {
    const pendingA = deferred<NutritionFoodResponse>();
    api.update.mockReturnValueOnce(pendingA.promise);
    const { client, switchTo } = await renderSwitchable();
    await screen.findByText("Ovos");
    const confirmedA = byOwner["user-a"].map((r) => ({ ...r }));
    await userEvent.click(foodAction("Editar", "Ovos"));
    const editForm = expectEditForm();
    await fillFood(editForm, { name: "Ovos da A", quantity: "9 g", meal: "Janta" });
    fireEvent.submit(editForm);
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));

    await switchToB(switchTo);
    await act(async () => pendingA.reject(upstreamDown()));
    await act(async () => undefined);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Banco de dados indisponível/)).toBeNull();
    expect(screen.queryByRole("form", { name: "Editar alimento" })).toBeNull();
    expect(screen.queryByDisplayValue("Ovos da A")).toBeNull();
    expect(screen.queryByDisplayValue("9 g")).toBeNull();
    expect(client.getQueryData(FOODS_KEY)).toEqual(confirmedA);
    expect(client.getQueryData(B_FOODS_KEY)).toEqual(byOwner["user-b"]);
    expect(itemTexts(region("Café da manhã"))).toEqual([expect.stringContaining("Pão")]);
    expect(createButton(expectCreateForm())).toBeEnabled();
    expect(foodAction("Editar", "Pão")).toBeEnabled();
  });

  it("keeps a previous account's late list response out of the new account's screen and cache", async () => {
    const listA = deferred<NutritionFoodResponse[]>();
    api.all.mockImplementation(async () =>
      auth.owner?.id === USER_A.id ? listA.promise : byOwner["user-b"].map((r) => ({ ...r })),
    );
    const { client, switchTo } = await renderSwitchable();
    expect(screen.queryByLabelText("Carregando alimentos")).toBeInTheDocument();

    await switchToB(switchTo);
    await act(async () => listA.resolve(byOwner["user-a"].map((r) => ({ ...r }))));
    await act(async () => undefined);

    expect(screen.queryByText(/Ovos|Arroz/)).toBeNull();
    expect(itemTexts(region("Café da manhã"))).toEqual([expect.stringContaining("Pão")]);
    for (const label of ["Almoço", "Café da tarde", "Janta"]) {
      expect(itemTexts(region(label))).toEqual([]);
      expect(within(region(label)).queryByText(EMPTY_MEAL)).not.toBeNull();
    }
    expect(screen.queryByLabelText("Carregando alimentos")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(client.getQueryData(B_FOODS_KEY)).toEqual(byOwner["user-b"]);
    expect(api.all).toHaveBeenCalledTimes(2);
  });

  it("reports a failed refresh after a confirmed create as a list error, not a save failure, keeping the confirmed food cached until retry recovers", async () => {
    const saved = food({ id: 8, meal: "AFTERNOON_SNACK", name: "Iogurte", quantity: "1 pote" });
    api.all.mockResolvedValueOnce([]).mockRejectedValueOnce(upstreamDown()).mockResolvedValueOnce([saved]);
    api.create.mockResolvedValue(saved);
    const { client } = await renderSwitchable();
    await screen.findAllByText(EMPTY_MEAL);
    const form = expectCreateForm();
    await fillFood(form, { name: "Iogurte", quantity: "1 pote", meal: "Café da tarde" });
    fireEvent.submit(form);
    await waitFor(() => expect(api.all).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(createButton(form)).toBeEnabled());

    // The write was confirmed: the form clears its draft and shows no save error; the list reports its own error.
    expect(nameField(form)).toHaveValue("");
    expect(quantityField(form)).toHaveValue("");
    expect(within(form).queryByRole("alert")).toBeNull();
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    const listAlert = alerts[0];
    expect(form).not.toContainElement(listAlert);
    expect(listAlert).toHaveTextContent("Banco de dados indisponível");
    expect(within(listAlert).queryByRole("button", { name: "Tentar novamente" })).not.toBeNull();
    // A failed refresh is never presented as "no foods", and the confirmed record stays cached.
    expect(screen.queryByText(EMPTY_MEAL)).toBeNull();
    expect(client.getQueryData(FOODS_KEY)).toEqual([saved]);
    expect(api.create).toHaveBeenCalledTimes(1);

    await userEvent.click(within(listAlert).getByRole("button", { name: "Tentar novamente" }));
    expect(await within(region("Café da tarde")).findByText("Iogurte")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(client.getQueryData(FOODS_KEY)).toEqual([saved]);
    expect(api.all).toHaveBeenCalledTimes(3);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(nameField(form)).toHaveValue("");
  });

  it("keeps narrow-layout guards for long food names, quantities and the inline editor and confirmation", () => {
    expect(nutritionCss).toMatch(/\.name\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(nutritionCss).toMatch(/\.quantity\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(nutritionCss).toMatch(/\.confirm\s*\{[^}]*flex:\s*1 1 100%/);
    expect(nutritionCss).toMatch(/\.confirm\s*\{[^}]*min-width:\s*0/);
  });
});
