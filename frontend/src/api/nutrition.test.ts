import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tokens = vi.hoisted(() => ({
  getAccessToken: vi.fn<() => Promise<string | null>>(),
  refreshAccessToken: vi.fn<() => Promise<string | null>>(),
}));
vi.mock("./supabase", () => tokens);

import { ApiRequestError, setUnauthorizedHandler } from "./client";
import { nutritionApi } from "./nutrition";
import type { NutritionFoodResponse, Page } from "./types";

type Reply = { status: number; body?: unknown };

function stubFetch(...replies: Reply[]) {
  const queue = [...replies];
  const fetchMock = vi.fn((_url: string, _init: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected fetch call");
    return Promise.resolve({
      status: next.status,
      ok: next.status >= 200 && next.status < 300,
      text: () => Promise.resolve(next.body === undefined ? "" : JSON.stringify(next.body)),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function call(fetchMock: ReturnType<typeof stubFetch>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index] as unknown as [string, RequestInit];
  return { url, init, headers: (init.headers ?? {}) as Record<string, string> };
}

function page<T>(content: T[], number: number, totalElements: number, size: number): Page<T> {
  const totalPages = Math.ceil(totalElements / size);
  return {
    content,
    totalElements,
    totalPages,
    size,
    number,
    numberOfElements: content.length,
    first: number === 0,
    last: number + 1 >= totalPages,
    empty: content.length === 0,
  };
}

function food(id: number, overrides: Partial<NutritionFoodResponse> = {}): NutritionFoodResponse {
  return {
    id,
    meal: "BREAKFAST",
    name: `Alimento ${id}`,
    quantity: null,
    createdAt: "2026-10-12T10:00:00Z",
    updatedAt: "2026-10-12T10:00:00Z",
    ...overrides,
  };
}

const errorBody = (code: string, message: string) => ({ code, message, timestamp: "2026-10-12T10:00:00Z" });

beforeEach(() => {
  tokens.getAccessToken.mockResolvedValue("access-1");
  tokens.refreshAccessToken.mockResolvedValue("access-2");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe("nutritionApi", () => {
  it("lists a food page with the Worker default size, the Bearer token and nullable quantity", async () => {
    const body = page([food(1, { quantity: "2 ovos" }), food(2, { meal: "DINNER" })], 0, 2, 20);
    const fetchMock = stubFetch({ status: 200, body });

    const pending = nutritionApi.list();
    await expect(pending).resolves.toEqual(body);
    const result = await pending;

    expect(result.content[0].quantity).toBe("2 ovos");
    expect(result.content[1]).toMatchObject({ meal: "DINNER", quantity: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = call(fetchMock);
    expect(url).toBe("/api/nutrition/foods?page=0&size=20");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("omit");
    expect(headers.Authorization).toBe("Bearer access-1");
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("forwards explicit page and size", async () => {
    const fetchMock = stubFetch({ status: 200, body: page([], 2, 0, 30) });

    await expect(nutritionApi.list(2, 30)).resolves.toMatchObject({ number: 2, size: 30 });

    expect(call(fetchMock).url).toBe("/api/nutrition/foods?page=2&size=30");
  });

  it("loads every food page across all meals in order with the maximum page size", async () => {
    const meals = ["BREAKFAST", "LUNCH", "AFTERNOON_SNACK", "DINNER"] as const;
    const firstPage = Array.from({ length: 100 }, (_, i) => food(i + 1, { meal: meals[i % 4] }));
    const secondPage = Array.from({ length: 100 }, (_, i) => food(i + 101));
    const fetchMock = stubFetch(
      { status: 200, body: page(firstPage, 0, 201, 100) },
      { status: 200, body: page(secondPage, 1, 201, 100) },
      { status: 200, body: page([food(201, { meal: "DINNER", quantity: "1 prato" })], 2, 201, 100) },
    );

    const result = nutritionApi.all();
    await expect(result).resolves.toHaveLength(201);
    const all = await result;

    expect(all.map((f) => f.id)).toEqual(Array.from({ length: 201 }, (_, i) => i + 1));
    expect(all[200]).toMatchObject({ meal: "DINNER", quantity: "1 prato" });
    expect(new Set(all.map((f) => f.meal))).toEqual(new Set(meals));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(call(fetchMock, 0).url).toBe("/api/nutrition/foods?page=0&size=100");
    expect(call(fetchMock, 1).url).toBe("/api/nutrition/foods?page=1&size=100");
    expect(call(fetchMock, 2).url).toBe("/api/nutrition/foods?page=2&size=100");
  });

  it("rejects the full food listing when a later page fails instead of returning a partial list", async () => {
    const fetchMock = stubFetch(
      { status: 200, body: page([food(1)], 0, 101, 100) },
      { status: 403, body: errorBody("HEALTH_ACCESS_DENIED", "Health access is not enabled for this account.") },
    );

    const error = await nutritionApi.all().then(
      (value) => ({ resolved: value }),
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 403, code: "HEALTH_ACCESS_DENIED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gets one food by id", async () => {
    const body = food(5, { meal: "AFTERNOON_SNACK", quantity: "1 fruta" });
    const fetchMock = stubFetch({ status: 200, body });

    await expect(nutritionApi.get(5)).resolves.toEqual(body);

    const { url, init } = call(fetchMock);
    expect(url).toBe("/api/nutrition/foods/5");
    expect(init.method).toBe("GET");
  });

  it("creates a food with meal, name and quantity as JSON", async () => {
    const created = food(6, { meal: "LUNCH", name: "Arroz", quantity: "4 colheres" });
    const fetchMock = stubFetch({ status: 201, body: created });

    await expect(nutritionApi.create({ meal: "LUNCH", name: "Arroz", quantity: "4 colheres" })).resolves.toEqual(
      created,
    );

    const { url, init, headers } = call(fetchMock);
    expect(url).toBe("/api/nutrition/foods");
    expect(init.method).toBe("POST");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe("Bearer access-1");
    expect(init.body).toBe('{"meal":"LUNCH","name":"Arroz","quantity":"4 colheres"}');
  });

  it("creates a food without quantity by omitting the optional key", async () => {
    const created = food(7, { meal: "DINNER", name: "Sopa" });
    const fetchMock = stubFetch({ status: 201, body: created });

    await expect(nutritionApi.create({ meal: "DINNER", name: "Sopa" })).resolves.toEqual(created);

    expect(call(fetchMock).init.body).toBe('{"meal":"DINNER","name":"Sopa"}');
  });

  it("patches a food clearing quantity with explicit null and moving meal while omitting undefined keys", async () => {
    const fetchMock = stubFetch(
      { status: 200, body: food(5, { quantity: null }) },
      { status: 200, body: food(5, { meal: "LUNCH", quantity: "1 fruta" }) },
    );

    await expect(nutritionApi.update(5, { quantity: null })).resolves.toMatchObject({ quantity: null });
    await expect(nutritionApi.update(5, { meal: "LUNCH", name: undefined, quantity: undefined })).resolves.toMatchObject(
      { meal: "LUNCH", quantity: "1 fruta" },
    );

    expect(call(fetchMock, 0).url).toBe("/api/nutrition/foods/5");
    expect(call(fetchMock, 0).init.method).toBe("PATCH");
    expect(call(fetchMock, 0).init.body).toBe('{"quantity":null}');
    expect(call(fetchMock, 1).init.body).toBe('{"meal":"LUNCH"}');
  });

  it("removes a food and resolves undefined on 204", async () => {
    const fetchMock = stubFetch({ status: 204 });

    await expect(nutritionApi.remove(5)).resolves.toBeUndefined();

    const { url, init } = call(fetchMock);
    expect(url).toBe("/api/nutrition/foods/5");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("propagates food not found with the error envelope", async () => {
    stubFetch({ status: 404, body: errorBody("NUTRITION_FOOD_NOT_FOUND", "Nutrition food not found.") });

    const error = await nutritionApi.get(999).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 404, code: "NUTRITION_FOOD_NOT_FOUND", message: "Nutrition food not found." });
  });

  it("propagates validation errors from mutations", async () => {
    stubFetch({ status: 400, body: errorBody("VALIDATION_ERROR", "name: is required") });

    const error = await nutritionApi.create({ meal: "BREAKFAST", name: " " }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("retries once with a refreshed token after a 401 and notifies when it still fails", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const fetchMock = stubFetch(
      { status: 401, body: errorBody("UNAUTHORIZED", "Authentication required.") },
      { status: 401, body: errorBody("UNAUTHORIZED", "Authentication required.") },
    );

    const error = await nutritionApi.list().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(call(fetchMock, 0).headers.Authorization).toBe("Bearer access-1");
    expect(call(fetchMock, 1).headers.Authorization).toBe("Bearer access-2");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
