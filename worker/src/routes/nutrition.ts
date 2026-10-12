import type { Hono } from "hono";
import { z } from "zod";
import { callRpc, type AppEnv } from "../context";
import { NUTRITION_MEALS } from "../domain";
import { enumOf, optionalText, orNull, pageQuery, parseBody, pathId, requiredText } from "../validation";

// Blank quantities are accepted here and stored as null by the SQL function.
const foodCreateSchema = z.object({
  meal: enumOf(NUTRITION_MEALS),
  name: requiredText(150),
  quantity: optionalText(150),
});

// Omitted keys keep the stored value; null clears the quantity and is rejected for meal and name.
const foodPatchSchema = z.object({
  meal: enumOf(NUTRITION_MEALS).optional(),
  name: requiredText(150).optional(),
  quantity: optionalText(150),
});

/** JSON patch with only the validated keys the client actually sent (null kept, omitted dropped). */
function patchOf<T extends object>(body: T): Partial<T> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)) as Partial<T>;
}

const FOODS = "/api/nutrition/foods";

export function registerNutritionRoutes(app: Hono<AppEnv>): void {
  app.post(FOODS, async (c) => {
    const body = await parseBody(c, foodCreateSchema);
    const food = await callRpc(c, "api_nutrition_food_create", {
      p_meal: body.meal,
      p_name: body.name,
      p_quantity: orNull(body.quantity),
    });
    return c.json(food, 201);
  });

  app.get(FOODS, async (c) => c.json(await callRpc(c, "api_nutrition_food_list", pageQuery(c, 20))));

  app.get(`${FOODS}/:id`, async (c) => c.json(await callRpc(c, "api_nutrition_food_get", { p_id: pathId(c) })));

  app.patch(`${FOODS}/:id`, async (c) => {
    const id = pathId(c);
    const body = await parseBody(c, foodPatchSchema);
    return c.json(await callRpc(c, "api_nutrition_food_update", { p_id: id, p_patch: patchOf(body) }));
  });

  app.delete(`${FOODS}/:id`, async (c) => {
    await callRpc(c, "api_nutrition_food_delete", { p_id: pathId(c) });
    return c.body(null, 204);
  });
}
