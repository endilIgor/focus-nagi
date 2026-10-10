import type { Hono } from "hono";
import { z } from "zod";
import { callRpc, type AppEnv } from "../context";
import { TRAINING_EXERCISE_MODES } from "../domain";
import { boundedInt, enumOf, optionalText, orNull, pageQuery, parseBody, pathId, requiredText } from "../validation";

const weekdays = () =>
  z
    .array(boundedInt(1, 7), { error: "must be an array of days 1-7" })
    .refine((days) => new Set(days).size === days.length, { message: "must not repeat days" })
    .nullish();

const routineCreateSchema = z.object({ name: requiredText(150), weekdays: weekdays() });

// Omitted keys keep the stored value; null clears weekdays and is rejected for the required name.
const routinePatchSchema = z.object({ name: requiredText(150).optional(), weekdays: weekdays() });

const exerciseFields = {
  repetitions: boundedInt(1, 1000).nullish(),
  durationSeconds: boundedInt(1, 86400).nullish(),
  notes: optionalText(2000),
};

const exerciseCreateSchema = z
  .object({
    name: requiredText(150),
    sets: boundedInt(1, 1000),
    mode: enumOf(TRAINING_EXERCISE_MODES),
    ...exerciseFields,
  })
  .superRefine((body, ctx) => {
    const [target, other] =
      body.mode === "REPETITIONS" ? (["repetitions", "durationSeconds"] as const) : (["durationSeconds", "repetitions"] as const);
    if (body[target] == null) ctx.addIssue({ code: "custom", path: [target], message: `is required in ${body.mode} mode` });
    if (body[other] != null) ctx.addIssue({ code: "custom", path: [other], message: `must be null in ${body.mode} mode` });
  });

// Coherence of mode and target depends on the stored exercise, so the SQL function enforces it.
const exercisePatchSchema = z.object({
  name: requiredText(150).optional(),
  sets: boundedInt(1, 1000).optional(),
  mode: enumOf(TRAINING_EXERCISE_MODES).optional(),
  ...exerciseFields,
});

/** JSON patch with only the validated keys the client actually sent (null kept, omitted dropped). */
function patchOf<T extends object>(body: T): Partial<T> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)) as Partial<T>;
}

const ROUTINES = "/api/training/routines";
const EXERCISES = `${ROUTINES}/:id/exercises`;

export function registerTrainingRoutes(app: Hono<AppEnv>): void {
  app.post(ROUTINES, async (c) => {
    const body = await parseBody(c, routineCreateSchema);
    const routine = await callRpc(c, "api_training_routine_create", {
      p_name: body.name,
      p_weekdays: orNull(body.weekdays),
    });
    return c.json(routine, 201);
  });

  app.get(ROUTINES, async (c) => c.json(await callRpc(c, "api_training_routine_list", pageQuery(c, 20))));

  app.get(`${ROUTINES}/:id`, async (c) => c.json(await callRpc(c, "api_training_routine_get", { p_id: pathId(c) })));

  app.patch(`${ROUTINES}/:id`, async (c) => {
    const id = pathId(c);
    const body = await parseBody(c, routinePatchSchema);
    return c.json(await callRpc(c, "api_training_routine_update", { p_id: id, p_patch: patchOf(body) }));
  });

  app.delete(`${ROUTINES}/:id`, async (c) => {
    await callRpc(c, "api_training_routine_delete", { p_id: pathId(c) });
    return c.body(null, 204);
  });

  app.post(EXERCISES, async (c) => {
    const routineId = pathId(c);
    const body = await parseBody(c, exerciseCreateSchema);
    const exercise = await callRpc(c, "api_training_exercise_create", {
      p_routine_id: routineId,
      p_name: body.name,
      p_sets: body.sets,
      p_mode: body.mode,
      p_repetitions: orNull(body.repetitions),
      p_duration_seconds: orNull(body.durationSeconds),
      p_notes: orNull(body.notes),
    });
    return c.json(exercise, 201);
  });

  app.get(EXERCISES, async (c) =>
    c.json(await callRpc(c, "api_training_exercise_list", { p_routine_id: pathId(c), ...pageQuery(c, 20) })),
  );

  app.get(`${EXERCISES}/:exerciseId`, async (c) =>
    c.json(
      await callRpc(c, "api_training_exercise_get", { p_routine_id: pathId(c), p_id: pathId(c, "exerciseId") }),
    ),
  );

  app.patch(`${EXERCISES}/:exerciseId`, async (c) => {
    const routineId = pathId(c);
    const id = pathId(c, "exerciseId");
    const body = await parseBody(c, exercisePatchSchema);
    return c.json(
      await callRpc(c, "api_training_exercise_update", { p_routine_id: routineId, p_id: id, p_patch: patchOf(body) }),
    );
  });

  app.delete(`${EXERCISES}/:exerciseId`, async (c) => {
    await callRpc(c, "api_training_exercise_delete", { p_routine_id: pathId(c), p_id: pathId(c, "exerciseId") });
    return c.body(null, 204);
  });
}
