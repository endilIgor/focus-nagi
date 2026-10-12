import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mapDatabaseError } from "../src/db";
import { ApiError } from "../src/errors";
import { MIGRATIONS_DIR, asUser } from "./support/database";
import { createHarness, type Harness, type TestClient, type TestResponse } from "./support/harness";

const MIGRATION = "20261010122000_meal_catalog.sql";

const RPCS = [
  "public.api_nutrition_food_create(text, text, text)",
  "public.api_nutrition_food_list(integer, integer)",
  "public.api_nutrition_food_get(bigint)",
  "public.api_nutrition_food_update(bigint, jsonb)",
  "public.api_nutrition_food_delete(bigint)",
];

const FOODS = "/api/nutrition/foods";
const MEALS = ["BREAKFAST", "LUNCH", "AFTERNOON_SNACK", "DINNER"] as const;
const NOW = "2026-10-10T12:00:00Z";
const NOW_ISO = "2026-10-10T12:00:00.000Z";
const LATER = "2026-10-11T08:30:00Z";
const LATER_ISO = "2026-10-11T08:30:00.000Z";

interface Food {
  id: number;
  meal: (typeof MEALS)[number];
  name: string;
  quantity: string | null;
  createdAt: string;
  updatedAt: string;
}

let h: Harness;
let owner: TestClient;
let peer: TestClient;
let blocked: TestClient;

/** Administrative enablement: a direct database session (task 4 table), never a client role. */
async function enable(client: TestClient): Promise<void> {
  await h.db.query("insert into app_private.health_access (user_id) values ($1)", [client.userId]);
}

async function revoke(client: TestClient): Promise<void> {
  await h.db.query("delete from app_private.health_access where user_id = $1", [client.userId]);
}

async function enabledUser(): Promise<TestClient> {
  const client = await h.newUser();
  await enable(client);
  return client;
}

/** Asserts the task 7 schema before any nutrition request, so a missing migration fails as an assertion. */
async function expectNutritionRpcs(): Promise<void> {
  expect(existsSync(join(MIGRATIONS_DIR, MIGRATION)), `migration ${MIGRATION}`).toBe(true);
  const res = await h.db.query<{ name: string }>(
    "select f.name from jsonb_array_elements_text($1::jsonb) f(name) where to_regprocedure(f.name) is null",
    [JSON.stringify(RPCS)],
  );
  expect(res.rows.map((r) => r.name), "missing nutrition RPCs").toEqual([]);
}

beforeAll(async () => {
  h = await createHarness();
  owner = await h.newUser("owner@example.test");
  peer = await h.newUser("peer@example.test");
  blocked = await h.newUser("blocked@example.test");
  await enable(owner);
  await enable(peer);
});

beforeEach(async () => {
  await expectNutritionRpcs();
});

afterEach(() => h.setNow(null));

async function createFood(client: TestClient, body: unknown = { meal: "LUNCH", name: "Arroz" }): Promise<Food> {
  const res = await client.post(FOODS, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as Food;
}

function expectError(res: TestResponse, status: number, code: string): void {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  expect(res.body).toMatchObject({ code, message: expect.any(String), timestamp: expect.any(String) });
}

async function foodRows(client: TestClient): Promise<number> {
  const res = await h.db.query<{ n: number }>(
    "select count(*)::int as n from public.nutrition_food where user_id = $1",
    [client.userId],
  );
  return res.rows[0]!.n;
}

describe("nutrition foods: create and get (HTTP + real SQL)", () => {
  it("creates a food with 201, trimmed text and the food envelope, readable by id", async () => {
    h.setNow(NOW);
    const res = await owner.post(FOODS, { meal: "BREAKFAST", name: "  Pão integral  ", quantity: "  2 fatias " });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      meal: "BREAKFAST",
      name: "Pão integral",
      quantity: "2 fatias",
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    });
    const read = await owner.get(`${FOODS}/${res.body.id}`);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(res.body);
  });

  it.each(MEALS)("accepts the %s meal", async (meal) => {
    const client = await enabledUser();
    expect((await createFood(client, { meal, name: "Fruta" })).meal).toBe(meal);
  });

  it.each([
    ["omitted", {}],
    ["null", { quantity: null }],
    ["empty", { quantity: "" }],
    ["blank", { quantity: "   " }],
  ])("stores an %s quantity as null", async (_label, extra) => {
    const food = await createFood(owner, { meal: "DINNER", name: "Sopa", ...extra });
    expect(food.quantity).toBeNull();
    expect((await owner.get(`${FOODS}/${food.id}`)).body.quantity).toBeNull();
  });

  it("accepts 150 characters for name and quantity", async () => {
    const name = "n".repeat(150);
    const quantity = "q".repeat(150);
    expect(await createFood(owner, { meal: "LUNCH", name, quantity })).toMatchObject({ name, quantity });
  });

  it.each([
    ["missing meal", { name: "Arroz" }],
    ["null meal", { meal: null, name: "Arroz" }],
    ["unknown meal", { meal: "SUPPER", name: "Arroz" }],
    ["lower-case meal", { meal: "lunch", name: "Arroz" }],
    ["padded meal", { meal: " LUNCH ", name: "Arroz" }],
    ["numeric meal", { meal: 1, name: "Arroz" }],
    ["missing name", { meal: "LUNCH" }],
    ["null name", { meal: "LUNCH", name: null }],
    ["empty name", { meal: "LUNCH", name: "" }],
    ["blank name", { meal: "LUNCH", name: "   " }],
    ["name over 150 characters", { meal: "LUNCH", name: "x".repeat(151) }],
    ["numeric name", { meal: "LUNCH", name: 42 }],
    ["quantity over 150 characters", { meal: "LUNCH", name: "Arroz", quantity: "x".repeat(151) }],
    ["numeric quantity", { meal: "LUNCH", name: "Arroz", quantity: 100 }],
    ["object quantity", { meal: "LUNCH", name: "Arroz", quantity: { grams: 100 } }],
  ])("rejects a food with %s as 400 VALIDATION_ERROR without persisting", async (_label, body) => {
    const client = await enabledUser();
    expectError(await client.post(FOODS, body), 400, "VALIDATION_ERROR");
    expect(await foodRows(client)).toBe(0);
  });

  it("names the invalid fields in the validation message", async () => {
    const res = await owner.post(FOODS, { meal: "x", name: "", quantity: "q".repeat(151) });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("meal");
    expect(res.body.message).toContain("name");
    expect(res.body.message).toContain("quantity");
  });

  it.each([
    ["a JSON array", "[]"],
    ["invalid JSON", "{"],
    ["a JSON string", '"Arroz"'],
  ])("rejects %s as the body with 400 MALFORMED_REQUEST", async (_label, raw) => {
    const client = await enabledUser();
    expectError(await client.post(FOODS, raw), 400, "MALFORMED_REQUEST");
    expect(await foodRows(client)).toBe(0);
  });

  it("never takes the owner or id from the payload", async () => {
    const food = await createFood(owner, { meal: "LUNCH", name: "Feijão", id: 1, userId: peer.userId, user_id: peer.userId });
    expect((await owner.get(`${FOODS}/${food.id}`)).status).toBe(200);
    expectError(await peer.get(`${FOODS}/${food.id}`), 404, "NUTRITION_FOOD_NOT_FOUND");
    const row = await h.db.query<{ user_id: string }>("select user_id from public.nutrition_food where id = $1", [food.id]);
    expect(row.rows[0]!.user_id).toBe(owner.userId);
  });

  it("answers 404 NUTRITION_FOOD_NOT_FOUND with its message for an unknown or foreign id", async () => {
    const foreign = await createFood(peer, { meal: "LUNCH", name: "Do peer" });
    for (const res of [await owner.get(`${FOODS}/999999999`), await owner.get(`${FOODS}/${foreign.id}`)]) {
      expectError(res, 404, "NUTRITION_FOOD_NOT_FOUND");
      expect(res.body.message).toBe("Nutrition food not found.");
    }
    expect((await peer.get(`${FOODS}/${foreign.id}`)).body).toEqual(foreign);
  });

  it.each([`${FOODS}/abc`, `${FOODS}/1.5`, `${FOODS}/-1`, `${FOODS}/1e3`])(
    "rejects the malformed id in %s with 400 MALFORMED_REQUEST",
    async (path) => {
      expectError(await owner.get(path), 400, "MALFORMED_REQUEST");
    },
  );

  it("answers 403 HEALTH_ACCESS_DENIED on create and get for an account that is not enabled", async () => {
    const food = await createFood(owner, { meal: "LUNCH", name: "Alvo" });
    for (const res of [await blocked.post(FOODS, { meal: "LUNCH", name: "Nova" }), await blocked.get(`${FOODS}/${food.id}`)]) {
      expectError(res, 403, "HEALTH_ACCESS_DENIED");
      expect(res.body.message).toBe("Health access is not enabled for this account.");
    }
    expect(await foodRows(blocked)).toBe(0);
  });
});

describe("nutrition foods: list (HTTP + real SQL)", () => {
  it("lists every meal's foods in creation order inside the paginated envelope", async () => {
    const client = await enabledUser();
    const empty = await client.get(FOODS);
    expect(empty.status, JSON.stringify(empty.body)).toBe(200);
    expect(empty.body).toEqual({
      content: [],
      totalElements: 0,
      totalPages: 0,
      size: 20,
      number: 0,
      numberOfElements: 0,
      first: true,
      last: true,
      empty: true,
    });

    const a = await createFood(client, { meal: "DINNER", name: "Z primeiro" });
    const b = await createFood(client, { meal: "BREAKFAST", name: "A segundo", quantity: "1 xícara" });
    const c = await createFood(client, { meal: "LUNCH", name: "M terceiro" });

    const first = await client.get(`${FOODS}?page=0&size=2`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      content: [a, b],
      totalElements: 3,
      totalPages: 2,
      size: 2,
      number: 0,
      numberOfElements: 2,
      first: true,
      last: false,
      empty: false,
    });
    const second = await client.get(`${FOODS}?page=1&size=2`);
    expect(second.body).toMatchObject({ content: [c], number: 1, numberOfElements: 1, first: false, last: true });

    const all = await client.get(FOODS);
    expect(all.body.content).toEqual([a, b, c]);
    expect(all.body.size).toBe(20);
  });

  it("defaults to 20 per page and clamps size to 1..100 and page to 0", async () => {
    const client = await enabledUser();
    for (let i = 0; i < 21; i += 1) await createFood(client, { meal: MEALS[i % 4], name: `Item ${i}` });

    const page = await client.get(FOODS);
    expect(page.body).toMatchObject({ size: 20, numberOfElements: 20, totalElements: 21, totalPages: 2, last: false });
    expect((await client.get(`${FOODS}?page=1`)).body).toMatchObject({ numberOfElements: 1, last: true });
    expect((await client.get(`${FOODS}?size=500`)).body).toMatchObject({ size: 100, numberOfElements: 21, last: true });
    expect((await client.get(`${FOODS}?size=0`)).body).toMatchObject({ size: 1, numberOfElements: 1, totalPages: 21 });
    expect((await client.get(`${FOODS}?page=-3&size=5`)).body).toMatchObject({ number: 0, first: true });
  });

  it("rejects malformed pagination with 400 MALFORMED_REQUEST", async () => {
    expectError(await owner.get(`${FOODS}?page=abc`), 400, "MALFORMED_REQUEST");
    expectError(await owner.get(`${FOODS}?size=1.5`), 400, "MALFORMED_REQUEST");
  });

  it("lists only the caller's foods", async () => {
    const mine = await enabledUser();
    const other = await enabledUser();
    const own = await createFood(mine, { meal: "LUNCH", name: "Meu" });
    await createFood(other, { meal: "LUNCH", name: "Do outro" });
    const res = await mine.get(FOODS);
    expect(res.body).toMatchObject({ content: [own], totalElements: 1 });
  });

  it("answers 403 HEALTH_ACCESS_DENIED on the list for an account that is not enabled", async () => {
    const res = await blocked.get(FOODS);
    expectError(res, 403, "HEALTH_ACCESS_DENIED");
    expect(res.body.message).toBe("Health access is not enabled for this account.");
  });
});

describe("nutrition foods: PATCH (HTTP + real SQL)", () => {
  it("keeps omitted fields, trims sent text and refreshes only updatedAt", async () => {
    h.setNow(NOW);
    const food = await createFood(owner, { meal: "LUNCH", name: "Arroz", quantity: "4 colheres" });
    const url = `${FOODS}/${food.id}`;

    h.setNow(LATER);
    const renamed = await owner.patch(url, { name: "  Arroz integral " });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect(renamed.body).toEqual({ ...food, name: "Arroz integral", updatedAt: LATER_ISO });

    const quantity = await owner.patch(url, { quantity: " 5 colheres  " });
    expect(quantity.body).toEqual({ ...renamed.body, quantity: "5 colheres" });
    expect((await owner.get(url)).body).toEqual(quantity.body);
  });

  it("clears only the quantity with null, empty or blank and keeps it when omitted", async () => {
    for (const cleared of [null, "", "   "]) {
      const food = await createFood(owner, { meal: "DINNER", name: "Salada", quantity: "1 prato" });
      const url = `${FOODS}/${food.id}`;
      const kept = await owner.patch(url, { name: "Salada verde" });
      expect(kept.body).toMatchObject({ meal: "DINNER", name: "Salada verde", quantity: "1 prato" });
      const res = await owner.patch(url, { quantity: cleared });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ id: food.id, meal: "DINNER", name: "Salada verde", quantity: null });
    }
  });

  it("moves a food to another meal keeping its id and creation-order position", async () => {
    const client = await enabledUser();
    const a = await createFood(client, { meal: "BREAKFAST", name: "Café" });
    const b = await createFood(client, { meal: "BREAKFAST", name: "Pão", quantity: "1 unidade" });
    const c = await createFood(client, { meal: "LUNCH", name: "Arroz" });

    for (const meal of ["LUNCH", "AFTERNOON_SNACK", "DINNER", "BREAKFAST"] as const) {
      const moved = await client.patch(`${FOODS}/${b.id}`, { meal });
      expect(moved.status, JSON.stringify(moved.body)).toBe(200);
      expect(moved.body).toMatchObject({ id: b.id, meal, name: "Pão", quantity: "1 unidade", createdAt: b.createdAt });
    }
    await client.patch(`${FOODS}/${b.id}`, { meal: "LUNCH" });
    const list = (await client.get(FOODS)).body.content as Food[];
    expect(list.map((f) => [f.id, f.meal])).toEqual([
      [a.id, "BREAKFAST"],
      [b.id, "LUNCH"],
      [c.id, "LUNCH"],
    ]);
  });

  it("PATCH with {} or only unknown keys succeeds without changing fields", async () => {
    h.setNow(NOW);
    const food = await createFood(owner, { meal: "LUNCH", name: "Feijão", quantity: "1 concha" });
    h.setNow(LATER);
    const res = await owner.patch(`${FOODS}/${food.id}`, {});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ ...food, updatedAt: LATER_ISO });
    const unknown = await owner.patch(`${FOODS}/${food.id}`, { id: 1, userId: peer.userId, calories: 300 });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ ...food, updatedAt: LATER_ISO });
    const row = await h.db.query<{ user_id: string }>("select user_id from public.nutrition_food where id = $1", [food.id]);
    expect(row.rows[0]!.user_id).toBe(owner.userId);
  });

  it.each([
    ["null meal", { meal: null }],
    ["unknown meal", { meal: "SUPPER" }],
    ["lower-case meal", { meal: "dinner" }],
    ["numeric meal", { meal: 2 }],
    ["null name", { name: null }],
    ["empty name", { name: "" }],
    ["blank name", { name: "  " }],
    ["name over 150 characters", { name: "x".repeat(151) }],
    ["numeric name", { name: 7 }],
    ["quantity over 150 characters", { quantity: "x".repeat(151) }],
    ["numeric quantity", { quantity: 3 }],
    ["valid name with invalid meal", { name: "Novo", meal: "BRUNCH" }],
  ])("rejects a PATCH with %s as 400 VALIDATION_ERROR without changing the food", async (_label, body) => {
    const food = await createFood(owner, { meal: "LUNCH", name: "Original", quantity: "100 g" });
    const url = `${FOODS}/${food.id}`;
    expectError(await owner.patch(url, body), 400, "VALIDATION_ERROR");
    expect((await owner.get(url)).body).toEqual(food);
  });

  it("accepts 150 characters for name and quantity", async () => {
    const food = await createFood(owner);
    const res = await owner.patch(`${FOODS}/${food.id}`, { name: "n".repeat(150), quantity: "q".repeat(150) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "n".repeat(150), quantity: "q".repeat(150) });
  });

  it.each([
    ["a JSON array", "[]"],
    ["invalid JSON", "{"],
  ])("rejects %s as the PATCH body with 400 MALFORMED_REQUEST", async (_label, raw) => {
    const food = await createFood(owner);
    expectError(await owner.patch(`${FOODS}/${food.id}`, raw), 400, "MALFORMED_REQUEST");
  });

  it("answers 404 for an unknown or foreign id and leaves the foreign food untouched", async () => {
    const foreign = await createFood(peer, { meal: "LUNCH", name: "Do peer", quantity: "1" });
    for (const res of [
      await owner.patch(`${FOODS}/999999999`, { name: "x" }),
      await owner.patch(`${FOODS}/${foreign.id}`, { name: "Roubado", quantity: null, meal: "DINNER" }),
    ]) {
      expectError(res, 404, "NUTRITION_FOOD_NOT_FOUND");
      expect(res.body.message).toBe("Nutrition food not found.");
    }
    expect((await peer.get(`${FOODS}/${foreign.id}`)).body).toEqual(foreign);
    expectError(await owner.patch(`${FOODS}/abc`, { name: "x" }), 400, "MALFORMED_REQUEST");
  });

  it("answers 403 HEALTH_ACCESS_DENIED on PATCH for an account that is not enabled", async () => {
    const food = await createFood(owner, { meal: "LUNCH", name: "Alvo" });
    expectError(await blocked.patch(`${FOODS}/${food.id}`, { name: "Outro" }), 403, "HEALTH_ACCESS_DENIED");
    expect((await owner.get(`${FOODS}/${food.id}`)).body).toEqual(food);
  });
});

describe("nutrition foods: DELETE (HTTP + real SQL)", () => {
  it("returns 204 without body and removes only that food", async () => {
    const client = await enabledUser();
    const gone = await createFood(client, { meal: "LUNCH", name: "Descartável" });
    const kept = await createFood(client, { meal: "LUNCH", name: "Fica" });
    const url = `${FOODS}/${gone.id}`;

    const res = await client.delete(url);
    expect(res.status, JSON.stringify(res.body)).toBe(204);
    expect(res.body).toBeUndefined();
    expect(await foodRows(client)).toBe(1);
    expectError(await client.get(url), 404, "NUTRITION_FOOD_NOT_FOUND");
    expectError(await client.patch(url, { name: "x" }), 404, "NUTRITION_FOOD_NOT_FOUND");
    expectError(await client.delete(url), 404, "NUTRITION_FOOD_NOT_FOUND");
    expect((await client.get(FOODS)).body).toMatchObject({ content: [kept], totalElements: 1 });
  });

  it("answers 404 for an unknown or foreign id without deleting the foreign food", async () => {
    const foreign = await createFood(peer, { meal: "DINNER", name: "Do peer" });
    for (const res of [await owner.delete(`${FOODS}/999999999`), await owner.delete(`${FOODS}/${foreign.id}`)]) {
      expectError(res, 404, "NUTRITION_FOOD_NOT_FOUND");
      expect(res.body.message).toBe("Nutrition food not found.");
    }
    expect((await peer.get(`${FOODS}/${foreign.id}`)).body).toEqual(foreign);
    expectError(await owner.delete(`${FOODS}/abc`), 400, "MALFORMED_REQUEST");
  });
});

/** One valid request per nutrition route, addressed at the owner's real records. */
async function everyRoute(): Promise<Array<[string, (client: TestClient) => Promise<TestResponse>]>> {
  const food = await createFood(owner, { meal: "LUNCH", name: "Alvo", quantity: "1" });
  const f = `${FOODS}/${food.id}`;
  return [
    ["POST foods", (c) => c.post(FOODS, { meal: "DINNER", name: "Nova" })],
    ["GET foods", (c) => c.get(FOODS)],
    ["GET food", (c) => c.get(f)],
    ["PATCH food", (c) => c.patch(f, { quantity: null })],
    ["DELETE food", (c) => c.delete(f)],
  ];
}

function anonymous(): TestClient {
  const send = (method: string, path: string, body?: unknown) =>
    h.request(path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return {
    userId: "",
    token: "",
    get: (path) => send("GET", path),
    post: (path, body) => send("POST", path, body),
    patch: (path, body) => send("PATCH", path, body),
    delete: (path) => send("DELETE", path),
  };
}

describe("nutrition capability", () => {
  it("answers 403 HEALTH_ACCESS_DENIED on all five routes for an account that is not enabled", async () => {
    const routes = await everyRoute();
    expect(routes).toHaveLength(5);
    for (const [label, send] of routes) {
      const res = await send(blocked);
      expect(res.status, `${label}: ${JSON.stringify(res.body)}`).toBe(403);
      expect(res.body, label).toMatchObject({
        code: "HEALTH_ACCESS_DENIED",
        message: "Health access is not enabled for this account.",
      });
    }
    expect(await foodRows(blocked)).toBe(0);
  });

  it("closes all five routes as soon as enablement is revoked and keeps the data for re-enablement", async () => {
    const client = await enabledUser();
    const food = await createFood(client, { meal: "AFTERNOON_SNACK", name: "Persistente", quantity: "1 pote" });
    const url = `${FOODS}/${food.id}`;
    await revoke(client);
    for (const res of [
      await client.post(FOODS, { meal: "LUNCH", name: "Nova" }),
      await client.get(FOODS),
      await client.get(url),
      await client.patch(url, { quantity: null }),
      await client.delete(url),
    ]) {
      expectError(res, 403, "HEALTH_ACCESS_DENIED");
    }
    expect(await foodRows(client)).toBe(1);
    await enable(client);
    expect((await client.get(url)).body).toEqual(food);
    expect((await client.delete(url)).status).toBe(204);
  });

  // Regression guard: the existing /api/* middleware answers 401 before routing.
  it("answers 401 UNAUTHENTICATED on all five routes without a token", async () => {
    const anon = anonymous();
    for (const [label, send] of await everyRoute()) {
      const res = await send(anon);
      expect(res.status, label).toBe(401);
      expect(res.body.code, label).toBe("UNAUTHENTICATED");
    }
  });
});

describe("nutrition RPCs called directly (real SQL, regression guards)", () => {
  const directCalls: Array<[string, string, unknown[]]> = [
    ["food_create", "select public.api_nutrition_food_create($1, $2, $3)", ["BAD", "", "x".repeat(151)]],
    ["food_list", "select public.api_nutrition_food_list($1, $2)", [-1, 0]],
    ["food_get", "select public.api_nutrition_food_get($1)", [1]],
    ["food_update", "select public.api_nutrition_food_update($1, $2::jsonb)", [1, '{"bogus": true}']],
    ["food_delete", "select public.api_nutrition_food_delete($1)", [1]],
  ];

  it.each(directCalls)(
    "%s denies an account that is not enabled before validating its payload",
    async (_name, statement, params) => {
      await expect(asUser(h.db, blocked.userId, (tx) => tx.query(statement, params))).rejects.toThrow(
        /HEALTH_ACCESS_DENIED/,
      );
    },
  );

  it.each(directCalls)("%s is not executable by the anon role", async (_name, statement, params) => {
    await expect(asUser(h.db, null, (tx) => tx.query(statement, params))).rejects.toThrow(/permission denied/);
  });

  it("persists HTTP writes in the real table, readable by the owner's direct RPC call", async () => {
    const food = await createFood(owner, { meal: "BREAKFAST", name: "Ovos", quantity: "2 unidades" });
    const direct = await asUser(h.db, owner.userId, (tx) =>
      tx.query<{ result: Food }>("select public.api_nutrition_food_get($1) as result", [food.id]),
    );
    expect(direct.rows[0]!.result).toEqual(food);
    const row = await h.db.query("select meal, name, quantity from public.nutrition_food where id = $1", [food.id]);
    expect(row.rows[0]).toEqual({ meal: "BREAKFAST", name: "Ovos", quantity: "2 unidades" });
  });
});

describe("nutrition error mapping", () => {
  it("maps NUTRITION_FOOD_NOT_FOUND to 404 with its default message", () => {
    const err = mapDatabaseError({ code: "P0001", message: "NUTRITION_FOOD_NOT_FOUND", details: "" });
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: "NUTRITION_FOOD_NOT_FOUND", message: "Nutrition food not found." });
  });
});
