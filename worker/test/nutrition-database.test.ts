import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, asUser, createAuthUser, createTestDatabase } from "./support/database";

const MIGRATION = "20261010122000_meal_catalog.sql";

const TABLE = "public.nutrition_food";

const RPC = {
  create: "public.api_nutrition_food_create(text, text, text)",
  get: "public.api_nutrition_food_get(bigint)",
  list: "public.api_nutrition_food_list(integer, integer)",
  update: "public.api_nutrition_food_update(bigint, jsonb)",
  delete: "public.api_nutrition_food_delete(bigint)",
} as const;

const MEALS = ["BREAKFAST", "LUNCH", "AFTERNOON_SNACK", "DINNER"] as const;

interface Food {
  id: number;
  meal: (typeof MEALS)[number];
  name: string;
  quantity: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

type CallOptions = { now?: string | null; role?: "authenticated" | "anon" };

let db: PGlite | undefined;
let enabledA: string;
let enabledB: string;
let blocked: string;

function sql(): PGlite {
  if (!db) throw new Error("test database not initialised");
  return db;
}

/**
 * Asserts the migration file and the given nutrition objects before any seed, so a missing
 * migration or RPC fails as an assertion instead of a setup error.
 */
async function expectNutritionObjects(rpcs: readonly string[] = []): Promise<void> {
  expect(existsSync(join(MIGRATIONS_DIR, MIGRATION)), `migration ${MIGRATION}`).toBe(true);
  const res = await sql().query<{ name: string }>(
    `select t.name from jsonb_array_elements_text($1::jsonb) t(name) where to_regclass(t.name) is null
     union all
     select f.name from jsonb_array_elements_text($2::jsonb) f(name) where to_regprocedure(f.name) is null`,
    [JSON.stringify([TABLE]), JSON.stringify(rpcs)],
  );
  expect(res.rows.map((r) => r.name), "missing nutrition objects").toEqual([]);
}

/** Administrative enablement (direct database session; table created by the task 4 migration). */
async function enable(userId: string): Promise<void> {
  await sql().query("insert into app_private.health_access (user_id) values ($1)", [userId]);
}

beforeAll(async () => {
  db = await createTestDatabase();
  enabledA = randomUUID();
  enabledB = randomUUID();
  blocked = randomUUID();
  await createAuthUser(db, enabledA, "enabled-a@example.test");
  await createAuthUser(db, enabledB, "enabled-b@example.test");
  await createAuthUser(db, blocked, "blocked@example.test");
  await enable(enabledA);
  await enable(enabledB);
});

async function newUser(enabled = true): Promise<string> {
  const id = randomUUID();
  await createAuthUser(sql(), id, `${id}@example.test`);
  if (enabled) await enable(id);
  return id;
}

async function call<T>(userId: string | null, text: string, params: unknown[], options: CallOptions = {}): Promise<T> {
  return asUser(sql(), userId, async (tx) => (await tx.query<{ result: T }>(text, params)).rows[0]!.result, options);
}

const createFood = (
  uid: string | null,
  meal: string | null,
  name: string | null,
  quantity: string | null = null,
  options?: CallOptions,
) => call<Food>(uid, "select public.api_nutrition_food_create($1, $2, $3) as result", [meal, name, quantity], options);

const getFood = (uid: string | null, id: number, options?: CallOptions) =>
  call<Food>(uid, "select public.api_nutrition_food_get($1) as result", [id], options);

const listFoods = (uid: string | null, page: number | null = 0, size: number | null = 20, options?: CallOptions) =>
  call<Page<Food>>(uid, "select public.api_nutrition_food_list($1, $2) as result", [page, size], options);

const updateFood = (uid: string | null, id: number, patch: unknown, options?: CallOptions) =>
  call<Food>(
    uid,
    "select public.api_nutrition_food_update($1, $2::jsonb) as result",
    [id, patch === undefined ? null : JSON.stringify(patch)],
    options,
  );

const deleteFood = (uid: string | null, id: number, options?: CallOptions) =>
  call<unknown>(uid, "select public.api_nutrition_food_delete($1) as result", [id], options);

async function expectDomainError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code: "P0001", message: code });
}

const expectInvalid = (promise: Promise<unknown>) => expectDomainError(promise, "VALIDATION_ERROR");

async function rowCount(where: string, params: unknown[]): Promise<number> {
  const res = await sql().query<{ n: number }>(`select count(*)::int as n from public.nutrition_food where ${where}`, params);
  return res.rows[0]!.n;
}

/** Asserts SECURITY DEFINER, an empty search_path and execute only for authenticated. */
async function expectSecuredRpc(signature: string): Promise<void> {
  const res = await sql().query<{ auth: boolean; anon: boolean; pub: boolean; prosecdef: boolean; proconfig: string[] | null }>(
    `select has_function_privilege('authenticated', $1::regprocedure, 'execute') as auth,
            has_function_privilege('anon', $1::regprocedure, 'execute') as anon,
            has_function_privilege('public', $1::regprocedure, 'execute') as pub,
            p.prosecdef, p.proconfig
     from pg_proc p where p.oid = $1::regprocedure`,
    [signature],
  );
  expect(res.rows[0], signature).toMatchObject({ auth: true, anon: false, pub: false, prosecdef: true });
  expect(res.rows[0]!.proconfig ?? [], signature).toContain('search_path=""');
}

/** Direct (administrative) insert, bypassing the RPCs, to exercise the table constraints. */
const insertDirect = (userId: string, meal: string | null, name: string | null, quantity: string | null = null) =>
  sql().query<{ id: number }>(
    "insert into public.nutrition_food (user_id, meal, name, quantity) values ($1, $2, $3, $4) returning id",
    [userId, meal, name, quantity],
  );

describe("meal catalog migration: structure (tracer)", () => {
  beforeEach(async () => {
    await expectNutritionObjects();
  });

  it("ships the migration with the nutrition_food table", async () => {
    await expectNutritionObjects();
  });

  it("stores only the catalog columns: no daily log, date or completion fields", async () => {
    const res = await sql().query<{ column_name: string; data_type: string; is_nullable: string; max: number | null }>(
      `select column_name, data_type, is_nullable, character_maximum_length as max
       from information_schema.columns
       where table_schema = 'public' and table_name = 'nutrition_food' order by ordinal_position`,
    );
    expect(res.rows).toEqual([
      { column_name: "id", data_type: "bigint", is_nullable: "NO", max: null },
      { column_name: "user_id", data_type: "uuid", is_nullable: "NO", max: null },
      { column_name: "meal", data_type: "character varying", is_nullable: "NO", max: 20 },
      { column_name: "name", data_type: "character varying", is_nullable: "NO", max: 150 },
      { column_name: "quantity", data_type: "character varying", is_nullable: "YES", max: 150 },
      { column_name: "created_at", data_type: "timestamp with time zone", is_nullable: "NO", max: null },
      { column_name: "updated_at", data_type: "timestamp with time zone", is_nullable: "NO", max: null },
    ]);
    const others = await sql().query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and (c.relname like '%meal%' or c.relname like '%nutrition%' or c.relname like '%food%')`,
    );
    expect(others.rows.map((r) => r.relname)).toEqual(["nutrition_food"]);
  });

  it("accepts each of the four meals through a direct database session", async () => {
    for (const meal of ["BREAKFAST", "LUNCH", "AFTERNOON_SNACK", "DINNER"]) {
      await expect(insertDirect(enabledA, meal, `Direto ${meal}`, null), meal).resolves.toBeTruthy();
    }
    await expect(insertDirect(enabledA, "LUNCH", "a".repeat(150), "q".repeat(150))).resolves.toBeTruthy();
  });

  it.each([
    ["an unknown meal", "SUPPER", "x", null, "23514"],
    ["a lowercase meal", "lunch", "x", null, "23514"],
    ["a null meal", null, "x", null, "23502"],
    ["a blank name", "LUNCH", "   ", null, "23514"],
    ["a null name", "LUNCH", null, null, "23502"],
    ["a 151-character name", "LUNCH", "a".repeat(151), null, "22001"],
    ["a blank quantity", "LUNCH", "x", "  ", "23514"],
    ["an empty quantity", "LUNCH", "x", "", "23514"],
    ["a 151-character quantity", "LUNCH", "x", "q".repeat(151), "22001"],
  ] as [string, string | null, string | null, string | null, string][])(
    "rejects %s at the table level",
    async (_label, meal, name, quantity, code) => {
      await expect(insertDirect(enabledA, meal, name, quantity)).rejects.toMatchObject({ code });
    },
  );

  it("closes the table and its sequence to every client role, with RLS and owner policies", async () => {
    const res = await sql().query<{ role: string; sel: boolean; ins: boolean; upd: boolean; del: boolean; seq: boolean }>(
      `select r as role,
              has_table_privilege(r, $1::regclass, 'select') as sel,
              has_table_privilege(r, $1::regclass, 'insert') as ins,
              has_table_privilege(r, $1::regclass, 'update') as upd,
              has_table_privilege(r, $1::regclass, 'delete') as del,
              has_sequence_privilege(r, pg_get_serial_sequence($2::text, 'id'), 'usage,select,update') as seq
       from unnest(array['anon', 'authenticated', 'public']) as r`,
      [TABLE, TABLE],
    );
    expect(res.rows).toHaveLength(3);
    for (const row of res.rows) {
      expect(row, row.role).toMatchObject({ sel: false, ins: false, upd: false, del: false, seq: false });
    }
    const rls = await sql().query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where oid = $1::regclass", [
      TABLE,
    ]);
    expect(rls.rows).toEqual([{ relrowsecurity: true }]);
    const policies = await sql().query<{ policyname: string; roles: string[]; qual: string | null }>(
      `select policyname, roles, coalesce(qual, with_check) as qual from pg_policies
       where schemaname = 'public' and tablename = 'nutrition_food' order by policyname`,
    );
    expect(policies.rows.map((p) => p.policyname)).toEqual(
      ["delete", "insert", "select", "update"].map((op) => `nutrition_food_owner_${op}`),
    );
    for (const policy of policies.rows) {
      expect(policy.roles, policy.policyname).toEqual(["authenticated"]);
      expect(policy.qual, policy.policyname).toMatch(/auth\.uid\(\)/);
    }
  });

  it.each([
    ["select", "select * from public.nutrition_food"],
    ["insert", "insert into public.nutrition_food (meal, name) values ('LUNCH', 'direta')"],
    ["update", "update public.nutrition_food set name = 'direta'"],
    ["delete", "delete from public.nutrition_food"],
  ])("denies direct %s for enabled, blocked and anon callers", async (_op, statement) => {
    for (const uid of [enabledA, blocked, null]) {
      await expect(asUser(sql(), uid, (tx) => tx.query(statement)), String(uid)).rejects.toThrow(/permission denied/);
    }
  });

  it("inserts no catalog rows and enables no account by itself", async () => {
    const res = await sql().query<{ orphan: number; enabled: number }>(
      `select (select count(*) from public.nutrition_food f
               where not exists (select 1 from app_private.health_access a where a.user_id = f.user_id))::int as orphan,
              (select count(*) from app_private.health_access)::int as enabled`,
    );
    expect(res.rows[0]).toEqual({ orphan: 0, enabled: 2 });
  });

  it("is idempotent and keeps existing rows and policies", async () => {
    const inserted = await insertDirect(enabledB, "DINNER", "Idempotente", "1 prato");
    await sql().exec(readFileSync(join(MIGRATIONS_DIR, MIGRATION), "utf8"));
    const kept = await sql().query("select meal, name, quantity from public.nutrition_food where id = $1", [
      inserted.rows[0]!.id,
    ]);
    expect(kept.rows).toEqual([{ meal: "DINNER", name: "Idempotente", quantity: "1 prato" }]);
    const policies = await sql().query<{ n: number }>(
      "select count(*)::int as n from pg_policies where schemaname = 'public' and tablename = 'nutrition_food'",
    );
    expect(policies.rows[0]!.n).toBe(4);
  });
});

describe("create and get foods (real SQL)", () => {
  beforeEach(async () => {
    await expectNutritionObjects([RPC.create, RPC.get]);
  });

  it("creates a food in each of the four meals for the caller, trimmed, with server timestamps", async () => {
    const uid = await newUser();
    for (const meal of MEALS) {
      const food = await createFood(uid, meal, `  Ovo ${meal}  `, "  2 unidades  ", { now: "2026-10-10T07:30:00Z" });
      expect(food).toEqual({
        id: expect.any(Number),
        meal,
        name: `Ovo ${meal}`,
        quantity: "2 unidades",
        createdAt: "2026-10-10T07:30:00.000Z",
        updatedAt: "2026-10-10T07:30:00.000Z",
      });
      await expect(getFood(uid, food.id)).resolves.toEqual(food);
    }
    const stored = await sql().query<{ user_id: string; meal: string }>(
      "select user_id, meal from public.nutrition_food where user_id = $1 order by id",
      [uid],
    );
    expect(stored.rows).toEqual(MEALS.map((meal) => ({ user_id: uid, meal })));
  });

  it.each([
    ["omitted (null)", null],
    ["empty", ""],
    ["blank", "   "],
  ])("treats a %s quantity as no quantity", async (_label, quantity) => {
    const uid = await newUser();
    const food = await createFood(uid, "LUNCH", "Arroz", quantity);
    expect(food.quantity).toBeNull();
    await expect(getFood(uid, food.id)).resolves.toMatchObject({ name: "Arroz", quantity: null });
  });

  it("accepts 150-character name and quantity", async () => {
    const uid = await newUser();
    await expect(createFood(uid, "DINNER", "a".repeat(150), "q".repeat(150))).resolves.toMatchObject({
      name: "a".repeat(150),
      quantity: "q".repeat(150),
    });
  });

  it.each([
    ["a 151-character name", "LUNCH", "a".repeat(151), null],
    ["a name over 150 characters before trimming", "LUNCH", ` ${"a".repeat(150)} `, null],
    ["a blank name", "LUNCH", "   ", null],
    ["an empty name", "LUNCH", "", null],
    ["a null name", "LUNCH", null, null],
    ["a 151-character quantity", "LUNCH", "Feijão", "q".repeat(151)],
    ["an unknown meal", "SUPPER", "Feijão", null],
    ["a lowercase meal", "lunch", "Feijão", null],
    ["a padded meal", " LUNCH ", "Feijão", null],
    ["a Portuguese meal label", "Almoço", "Feijão", null],
    ["a null meal", null, "Feijão", null],
  ] as [string, string | null, string | null, string | null][])(
    "rejects %s without storing anything",
    async (_label, meal, name, quantity) => {
      const uid = await newUser();
      await expectInvalid(createFood(uid, meal, name, quantity));
      expect(await rowCount("user_id = $1", [uid])).toBe(0);
    },
  );

  it("returns NUTRITION_FOOD_NOT_FOUND for unknown ids and another account's food", async () => {
    const food = await createFood(enabledA, "BREAKFAST", "Pão");
    await expectDomainError(getFood(enabledA, 999_999_999), "NUTRITION_FOOD_NOT_FOUND");
    await expectDomainError(getFood(enabledB, food.id), "NUTRITION_FOOD_NOT_FOUND");
    await expect(getFood(enabledA, food.id)).resolves.toEqual(food);
  });

  it("denies create and get to an enabled-less account before validating input", async () => {
    const food = await createFood(enabledA, "LUNCH", "Protegido");
    await expectDomainError(createFood(blocked, "LUNCH", "Bloqueado"), "HEALTH_ACCESS_DENIED");
    await expectDomainError(createFood(blocked, "INVALID", null, "q".repeat(151)), "HEALTH_ACCESS_DENIED");
    await expectDomainError(getFood(blocked, food.id), "HEALTH_ACCESS_DENIED");
    expect(await rowCount("user_id = $1", [blocked])).toBe(0);
  });

  it("denies create and get to anon and to the authenticated role without a user", async () => {
    const food = await createFood(enabledA, "LUNCH", "Protegido");
    await expect(createFood(null, "LUNCH", "Anônimo")).rejects.toThrow(/permission denied/);
    await expect(getFood(null, food.id)).rejects.toThrow(/permission denied/);
    await expectDomainError(createFood(null, "LUNCH", "Sem sub", null, { role: "authenticated" }), "UNAUTHENTICATED");
    await expectDomainError(getFood(null, food.id, { role: "authenticated" }), "UNAUTHENTICATED");
  });

  it("secures create and get as SECURITY DEFINER with an empty search_path, executable only by authenticated", async () => {
    await expectSecuredRpc(RPC.create);
    await expectSecuredRpc(RPC.get);
  });
});

describe("list foods: creation order and pagination (real SQL)", () => {
  beforeEach(async () => {
    await expectNutritionObjects([RPC.create, RPC.list]);
  });

  it("lists every meal's foods in creation order with the shared page envelope", async () => {
    const uid = await newUser();
    const dinner = await createFood(uid, "DINNER", "Sopa");
    const breakfast = await createFood(uid, "BREAKFAST", "Café", "1 xícara");
    const lunch = await createFood(uid, "LUNCH", "Arroz");
    const snack = await createFood(uid, "AFTERNOON_SNACK", "Fruta");
    const breakfast2 = await createFood(uid, "BREAKFAST", "Pão");

    await expect(listFoods(uid)).resolves.toEqual({
      content: [dinner, breakfast, lunch, snack, breakfast2],
      totalElements: 5,
      totalPages: 1,
      size: 20,
      number: 0,
      numberOfElements: 5,
      first: true,
      last: true,
      empty: false,
    });

    const first = await listFoods(uid, 0, 2);
    expect(first).toMatchObject({ totalElements: 5, totalPages: 3, number: 0, numberOfElements: 2, first: true, last: false });
    expect(first.content.map((f) => f.id)).toEqual([dinner.id, breakfast.id]);
    const last = await listFoods(uid, 2, 2);
    expect(last).toMatchObject({ number: 2, numberOfElements: 1, first: false, last: true, empty: false });
    expect(last.content.map((f) => f.id)).toEqual([breakfast2.id]);
    await expect(listFoods(uid, 3, 2)).resolves.toMatchObject({ content: [], empty: true, totalElements: 5 });
  });

  it("clamps page and size like the other paginated RPCs", async () => {
    const uid = await newUser();
    await createFood(uid, "LUNCH", "Único");
    await expect(listFoods(uid, -3, 500)).resolves.toMatchObject({ number: 0, size: 100, totalElements: 1 });
    await expect(listFoods(uid, null, null)).resolves.toMatchObject({ number: 0, size: 20 });
    await expect(listFoods(uid, 0, 0)).resolves.toMatchObject({ size: 1 });
  });

  it("starts empty for a new enabled account", async () => {
    await expect(listFoods(await newUser())).resolves.toMatchObject({ content: [], totalElements: 0, empty: true });
  });

  it("lists only the caller's foods", async () => {
    const mine = await createFood(enabledA, "LUNCH", "Meu");
    const theirs = await createFood(enabledB, "LUNCH", "Do outro");
    const pageA = await listFoods(enabledA, 0, 100);
    const pageB = await listFoods(enabledB, 0, 100);
    expect(pageA.content.map((f) => f.id)).toContain(mine.id);
    expect(pageA.content.map((f) => f.id)).not.toContain(theirs.id);
    expect(pageB.content.map((f) => f.id)).not.toContain(mine.id);
    expect(pageA.totalElements).toBe(await rowCount("user_id = $1", [enabledA]));
    expect(pageB.totalElements).toBe(await rowCount("user_id = $1", [enabledB]));
  });

  it("denies list to a blocked account, anon and the authenticated role without a user", async () => {
    await expectDomainError(listFoods(blocked), "HEALTH_ACCESS_DENIED");
    await expect(listFoods(null)).rejects.toThrow(/permission denied/);
    await expectDomainError(listFoods(null, 0, 20, { role: "authenticated" }), "UNAUTHENTICATED");
  });

  it("secures list as SECURITY DEFINER with an empty search_path, executable only by authenticated", async () => {
    await expectSecuredRpc(RPC.list);
  });
});

describe("update foods: PATCH omitted versus null and meal moves (real SQL)", () => {
  let uid: string;
  let food: Food;
  beforeEach(async () => {
    await expectNutritionObjects([RPC.create, RPC.get, RPC.list, RPC.update]);
    uid = await newUser();
    food = await createFood(uid, "BREAKFAST", "Aveia", "40 g", { now: "2026-10-10T06:00:00Z" });
  });

  const patch = (body: unknown, options?: CallOptions) => updateFood(uid, food.id, body, options);

  it("keeps omitted fields and refreshes only updatedAt", async () => {
    await expect(patch({ name: "  Aveia em flocos  " }, { now: "2026-10-11T06:00:00Z" })).resolves.toEqual({
      ...food,
      name: "Aveia em flocos",
      updatedAt: "2026-10-11T06:00:00.000Z",
    });
    await expect(patch({ quantity: " 50 g " })).resolves.toMatchObject({
      meal: "BREAKFAST",
      name: "Aveia em flocos",
      quantity: "50 g",
    });
    await expect(patch({}, { now: "2026-10-12T06:00:00Z" })).resolves.toEqual({
      ...food,
      name: "Aveia em flocos",
      quantity: "50 g",
      updatedAt: "2026-10-12T06:00:00.000Z",
    });
    await expect(getFood(uid, food.id)).resolves.toMatchObject({ name: "Aveia em flocos", quantity: "50 g" });
  });

  it.each([
    ["null", null],
    ["an empty string", ""],
    ["blank text", "   "],
  ])("clears the optional quantity with %s", async (_label, quantity) => {
    await expect(patch({ quantity })).resolves.toMatchObject({ name: "Aveia", meal: "BREAKFAST", quantity: null });
    await expect(getFood(uid, food.id)).resolves.toMatchObject({ quantity: null });
  });

  it("moves a food to another meal, keeping its creation position", async () => {
    const lunch = await createFood(uid, "LUNCH", "Arroz");
    const dinner = await createFood(uid, "DINNER", "Sopa");
    const moved = await patch({ meal: "DINNER" }, { now: "2026-10-13T06:00:00Z" });
    expect(moved).toEqual({ ...food, meal: "DINNER", updatedAt: "2026-10-13T06:00:00.000Z" });
    await expect(getFood(uid, food.id)).resolves.toEqual(moved);

    const list = await listFoods(uid);
    expect(list.content.map((f) => [f.id, f.meal])).toEqual([
      [food.id, "DINNER"],
      [lunch.id, "LUNCH"],
      [dinner.id, "DINNER"],
    ]);
    expect(list.content.filter((f) => f.meal === "BREAKFAST")).toEqual([]);
    expect(list.content.filter((f) => f.meal === "DINNER").map((f) => f.id)).toEqual([food.id, dinner.id]);
  });

  it("changes meal, name and quantity together", async () => {
    for (const meal of MEALS) {
      await expect(patch({ meal, name: `Item ${meal}`, quantity: null })).resolves.toMatchObject({
        id: food.id,
        meal,
        name: `Item ${meal}`,
        quantity: null,
      });
    }
  });

  it.each([
    ["a null name", { name: null }],
    ["a blank name", { name: "  " }],
    ["an empty name", { name: "" }],
    ["a 151-character name", { name: "a".repeat(151) }],
    ["a numeric name", { name: 5 }],
    ["a null meal", { meal: null }],
    ["an unknown meal", { meal: "SUPPER" }],
    ["a lowercase meal", { meal: "dinner" }],
    ["a numeric meal", { meal: 1 }],
    ["a 151-character quantity", { quantity: "q".repeat(151) }],
    ["a numeric quantity", { quantity: 2 }],
    ["a boolean quantity", { quantity: true }],
    ["an object quantity", { quantity: { value: 2 } }],
    ["an unknown key", { calories: 120 }],
    ["an owner key", { userId: "00000000-0000-0000-0000-000000000000" }],
    ["an id key", { id: 1 }],
    ["a completion flag", { completed: true }],
    ["a valid change mixed with an invalid one", { meal: "LUNCH", name: null }],
    ["an array patch", [1]],
    ["a string patch", "LUNCH"],
    ["a JSON null patch", null],
  ])("rejects %s without changing the row", async (_label, body) => {
    await expectInvalid(patch(body));
    await expect(getFood(uid, food.id)).resolves.toEqual(food);
  });

  it("rejects an SQL null patch", async () => {
    await expectInvalid(patch(undefined));
    await expect(getFood(uid, food.id)).resolves.toEqual(food);
  });

  it("returns NUTRITION_FOOD_NOT_FOUND for unknown ids and does not change another account's food", async () => {
    await expectDomainError(updateFood(uid, 999_999_999, { name: "x" }), "NUTRITION_FOOD_NOT_FOUND");
    await expectDomainError(updateFood(enabledB, food.id, { name: "Invadido", meal: "LUNCH" }), "NUTRITION_FOOD_NOT_FOUND");
    await expectDomainError(updateFood(enabledB, food.id, {}), "NUTRITION_FOOD_NOT_FOUND");
    await expect(getFood(uid, food.id)).resolves.toEqual(food);
  });

  it("denies update to a blocked account (even with an invalid patch), anon and the authenticated role without a user", async () => {
    await expectDomainError(updateFood(blocked, food.id, { name: "Bloqueado" }), "HEALTH_ACCESS_DENIED");
    await expectDomainError(updateFood(blocked, food.id, { meal: "NOPE" }), "HEALTH_ACCESS_DENIED");
    await expect(updateFood(null, food.id, { name: "Anônimo" })).rejects.toThrow(/permission denied/);
    await expectDomainError(updateFood(null, food.id, { name: "Sem sub" }, { role: "authenticated" }), "UNAUTHENTICATED");
    await expect(getFood(uid, food.id)).resolves.toEqual(food);
  });

  it("does not keep an earlier move when a later call of the same transaction fails", async () => {
    await expect(
      asUser(sql(), uid, async (tx) => {
        await tx.query("select public.api_nutrition_food_update($1, '{\"meal\": \"LUNCH\"}'::jsonb)", [food.id]);
        await tx.query("select public.api_nutrition_food_update($1, '{\"name\": null}'::jsonb)", [food.id]);
      }),
    ).rejects.toMatchObject({ message: "VALIDATION_ERROR" });
    await expect(getFood(uid, food.id)).resolves.toEqual(food);
  });

  it("secures update as SECURITY DEFINER with an empty search_path, executable only by authenticated", async () => {
    await expectSecuredRpc(RPC.update);
  });
});

describe("delete foods and account lifecycle (real SQL)", () => {
  beforeEach(async () => {
    await expectNutritionObjects(Object.values(RPC));
  });

  it("deletes only the given food", async () => {
    const uid = await newUser();
    const gone = await createFood(uid, "LUNCH", "Feijão", "1 concha");
    const kept = await createFood(uid, "LUNCH", "Arroz");

    await expect(deleteFood(uid, gone.id)).resolves.toBeNull();
    await expectDomainError(getFood(uid, gone.id), "NUTRITION_FOOD_NOT_FOUND");
    await expectDomainError(deleteFood(uid, gone.id), "NUTRITION_FOOD_NOT_FOUND");
    await expectDomainError(updateFood(uid, gone.id, { name: "Volta" }), "NUTRITION_FOOD_NOT_FOUND");
    expect((await listFoods(uid)).content).toEqual([kept]);
    expect(await rowCount("id = $1", [gone.id])).toBe(0);
  });

  it("returns NUTRITION_FOOD_NOT_FOUND for unknown ids and does not delete another account's food", async () => {
    const food = await createFood(enabledA, "DINNER", "Do dono");
    await expectDomainError(deleteFood(enabledA, 999_999_999), "NUTRITION_FOOD_NOT_FOUND");
    await expectDomainError(deleteFood(enabledB, food.id), "NUTRITION_FOOD_NOT_FOUND");
    await expect(getFood(enabledA, food.id)).resolves.toEqual(food);
  });

  it("denies delete to a blocked account, anon and the authenticated role without a user", async () => {
    const food = await createFood(enabledA, "DINNER", "Protegido");
    await expectDomainError(deleteFood(blocked, food.id), "HEALTH_ACCESS_DENIED");
    await expect(deleteFood(null, food.id)).rejects.toThrow(/permission denied/);
    await expectDomainError(deleteFood(null, food.id, { role: "authenticated" }), "UNAUTHENTICATED");
    await expect(getFood(enabledA, food.id)).resolves.toEqual(food);
  });

  it("rolls back a deletion when the surrounding transaction fails", async () => {
    const uid = await newUser();
    const food = await createFood(uid, "AFTERNOON_SNACK", "Iogurte");
    await expect(
      asUser(sql(), uid, async (tx) => {
        await tx.query("select public.api_nutrition_food_delete($1)", [food.id]);
        const inside = await tx.query<{ n: number }>("select (public.api_nutrition_food_list(0, 100) -> 'totalElements')::int as n");
        expect(inside.rows[0]!.n).toBe(0);
        await tx.query("select public.api_nutrition_food_create('NOPE', 'x', null)");
      }),
    ).rejects.toMatchObject({ message: "VALIDATION_ERROR" });
    await expect(getFood(uid, food.id)).resolves.toEqual(food);
  });

  it("stops serving a revoked account on every RPC without deleting its catalog, and serves it again when re-enabled", async () => {
    const uid = await newUser();
    const food = await createFood(uid, "BREAKFAST", "Revogada");
    await sql().query("delete from app_private.health_access where user_id = $1", [uid]);

    await expectDomainError(createFood(uid, "LUNCH", "Nova"), "HEALTH_ACCESS_DENIED");
    await expectDomainError(listFoods(uid), "HEALTH_ACCESS_DENIED");
    await expectDomainError(getFood(uid, food.id), "HEALTH_ACCESS_DENIED");
    await expectDomainError(updateFood(uid, food.id, { meal: "DINNER" }), "HEALTH_ACCESS_DENIED");
    await expectDomainError(deleteFood(uid, food.id), "HEALTH_ACCESS_DENIED");
    expect(await rowCount("user_id = $1", [uid])).toBe(1);

    await enable(uid);
    await expect(listFoods(uid)).resolves.toMatchObject({ content: [food], totalElements: 1 });
  });

  it("removes the catalog when the auth user is deleted", async () => {
    const uid = await newUser();
    await createFood(uid, "LUNCH", "Usuário removido");
    await sql().query("delete from auth.users where id = $1", [uid]);
    expect(await rowCount("user_id = $1", [uid])).toBe(0);
  });

  it("exposes exactly the nutrition RPCs, all secured", async () => {
    const res = await sql().query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and (p.proname like '%nutrition%' or p.proname like '%meal%' or p.proname like '%food%')
       order by p.proname`,
    );
    expect(res.rows.map((r) => r.proname)).toEqual([
      "api_nutrition_food_create",
      "api_nutrition_food_delete",
      "api_nutrition_food_get",
      "api_nutrition_food_list",
      "api_nutrition_food_update",
    ]);
    for (const signature of Object.values(RPC)) await expectSecuredRpc(signature);
  });

  it("keeps the private nutrition helpers pinned and non-executable by clients", async () => {
    const res = await sql().query<{ proname: string; proconfig: string[] | null; auth: boolean; anon: boolean; pub: boolean }>(
      `select p.proname, p.proconfig,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('public', p.oid, 'execute') as pub
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app_private' and p.proname like '%nutrition%'`,
    );
    expect(res.rows.length).toBeGreaterThan(0);
    for (const fn of res.rows) {
      expect(fn.proconfig ?? [], fn.proname).toContain('search_path=""');
      expect(fn, fn.proname).toMatchObject({ auth: false, anon: false });
    }
  });
});
