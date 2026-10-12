import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nutritionApi } from "../api/nutrition";
import type { NutritionFoodResponse, NutritionMeal } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { describeApiError } from "../utils/errors";
import styles from "./NutritionPage.module.css";

/** Approved display order; the four meals stay visible even without foods. */
const MEALS: ReadonlyArray<{ meal: NutritionMeal; label: string }> = [
  { meal: "BREAKFAST", label: "Café da manhã" },
  { meal: "LUNCH", label: "Almoço" },
  { meal: "AFTERNOON_SNACK", label: "Café da tarde" },
  { meal: "DINNER", label: "Janta" },
];

/** Same limits the API validates, counted in UTF-16 units like `maxLength`. */
const NAME_MAX = 150;
const QUANTITY_MAX = 150;

interface FoodValues {
  meal: NutritionMeal;
  name: string;
  quantity: string | null;
}

/** Health data is cached per account so a sign-in switch never shows the previous owner's foods. */
const nutritionKey = (ownerId: string) => ["health", ownerId, "nutrition"] as const;
const foodsKey = (ownerId: string) => [...nutritionKey(ownerId), "foods"] as const;

/** Groups foods by meal in registration order (id asc), the order the API guarantees. */
function groupByMeal(foods: NutritionFoodResponse[]): Record<NutritionMeal, NutritionFoodResponse[]> {
  const groups: Record<NutritionMeal, NutritionFoodResponse[]> = { BREAKFAST: [], LUNCH: [], AFTERNOON_SNACK: [], DINNER: [] };
  for (const food of [...foods].sort((a, b) => a.id - b.id)) groups[food.meal].push(food);
  return groups;
}

export function NutritionPage() {
  const { owner } = useAuth();
  return (
    <div className={styles.page}>
      <div className="fn-eyebrow">
        <span className="fn-eyebrow-bar" />
        <span className="fn-eyebrow-text">SAÚDE</span>
      </div>
      <h1 className="fn-h1">Alimentação</h1>
      {/* Remounting per account drops the previous owner's view state. */}
      {owner && <MealsWorkspace key={owner.id} ownerId={owner.id} />}
    </div>
  );
}

function MealsWorkspace({ ownerId }: { ownerId: string }) {
  const queryClient = useQueryClient();
  const foodsQuery = useQuery({ queryKey: foodsKey(ownerId), queryFn: () => nutritionApi.all() });
  // Only a confirmed load may render foods or empty states; loading and errors never look like "no foods".
  const groups = foodsQuery.isSuccess ? groupByMeal(foodsQuery.data) : null;
  // Synchronous guard shared by every mutation on the page: state-driven `disabled` lags a render behind programmatic submits.
  const inFlight = useRef(false);
  const [operationPending, setOperationPending] = useState(false);

  // Captures this workspace's owner, so a mutation finishing after an account switch only touches its own cache.
  const createFood = useMutation({
    mutationFn: (values: FoodValues) => nutritionApi.create(values),
    onSuccess: async (saved) => {
      const key = foodsKey(ownerId);
      // A stale read in flight must not overwrite the confirmed record; a refresh that already has it must not duplicate it.
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<NutritionFoodResponse[]>(key, (old = []) =>
        [...old.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.id - b.id),
      );
      await queryClient.invalidateQueries({ queryKey: nutritionKey(ownerId) });
    },
  });
  const updateFood = useMutation({
    mutationFn: ({ id, values }: { id: number; values: FoodValues }) => nutritionApi.update(id, values),
    onSuccess: async (saved) => {
      const key = foodsKey(ownerId);
      await queryClient.cancelQueries({ queryKey: key });
      // Replaced in place from the confirmed response, so a move shows at once in the target meal.
      queryClient.setQueryData<NutritionFoodResponse[]>(key, (old = []) => old.map((item) => (item.id === saved.id ? saved : item)));
      await queryClient.invalidateQueries({ queryKey: nutritionKey(ownerId) });
    },
  });
  // Meal headings never unmount, so they are the stable focus target once a deleted row is gone.
  const headings = useRef<Partial<Record<NutritionMeal, HTMLHeadingElement | null>>>({});
  const removeFood = useMutation({
    mutationFn: (target: NutritionFoodResponse) => nutritionApi.remove(target.id),
    onSuccess: async (_, target) => {
      const key = foodsKey(ownerId);
      // Cancelling first keeps a read started before the deletion from bringing the food back.
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<NutritionFoodResponse[]>(key, (old = []) => old.filter((item) => item.id !== target.id));
      // The row (and its focused dialog) is about to unmount; null after an account switch, so it is a no-op there.
      headings.current[target.meal]?.focus();
      await queryClient.invalidateQueries({ queryKey: nutritionKey(ownerId) });
    },
  });
  const busy = operationPending || createFood.isPending || updateFood.isPending || removeFood.isPending;

  /** Runs one mutation at a time; resolves false when another one is still in flight. */
  const exclusive = async (task: () => Promise<void>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setOperationPending(true);
    try {
      await task();
      return true;
    } finally {
      inFlight.current = false;
      setOperationPending(false);
    }
  };

  const create = (values: FoodValues) =>
    exclusive(async () => {
      await createFood.mutateAsync(values);
    });
  const save = (id: number, values: FoodValues) =>
    exclusive(async () => {
      await updateFood.mutateAsync({ id, values });
    });
  const remove = (target: NutritionFoodResponse) =>
    exclusive(async () => {
      await removeFood.mutateAsync(target);
    });

  return (
    <div className={styles.workspace}>
      <FoodForm label="Novo alimento" submitLabel="Criar alimento" busy={busy} onSubmit={create} />
      {foodsQuery.isPending && <span className="fn-spinner" aria-label="Carregando alimentos" />}
      {foodsQuery.isError && (
        <div role="alert" className="fn-error-banner">
          {describeApiError(foodsQuery.error)}
          <button type="button" className={styles.retry} onClick={() => void foodsQuery.refetch()}>
            Tentar novamente
          </button>
        </div>
      )}
      {MEALS.map(({ meal, label }) => (
        <MealSection
          key={meal}
          label={label}
          foods={groups?.[meal] ?? null}
          busy={busy}
          headingRef={(element) => {
            headings.current[meal] = element;
          }}
          onSave={save}
          onRemove={remove}
        />
      ))}
    </div>
  );
}

function MealSection({ label, foods, busy, headingRef, onSave, onRemove }: {
  label: string;
  foods: NutritionFoodResponse[] | null;
  busy: boolean;
  headingRef: (element: HTMLHeadingElement | null) => void;
  onSave: (id: number, values: FoodValues) => Promise<boolean>;
  onRemove: (food: NutritionFoodResponse) => Promise<boolean>;
}) {
  const titleId = useId();
  return (
    <section className={`fn-glass ${styles.meal}`} aria-labelledby={titleId}>
      <h2 id={titleId} ref={headingRef} tabIndex={-1} className={styles.mealTitle}>
        {label}
      </h2>
      {foods && foods.length === 0 && <p className="fn-empty">Nenhum alimento cadastrado.</p>}
      {foods && foods.length > 0 && (
        <ul className={styles.list}>
          {foods.map((food) => (
            <FoodItem
              key={food.id}
              food={food}
              busy={busy}
              onSave={(values) => onSave(food.id, values)}
              onRemove={() => onRemove(food)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FoodItem({ food, busy, onSave, onRemove }: {
  food: NutritionFoodResponse;
  busy: boolean;
  onSave: (values: FoodValues) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const editTrigger = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const restore = useRef<"edit" | "delete" | null>(null);
  useEffect(() => {
    if (restore.current === "edit" && !editing) { editTrigger.current?.focus(); restore.current = null; }
    if (restore.current === "delete" && !confirming) { deleteTrigger.current?.focus(); restore.current = null; }
  }, [editing, confirming]);
  const closeEdit = () => { restore.current = "edit"; setEditing(false); };
  const closeDelete = () => { restore.current = "delete"; setConfirming(false); setError(""); };
  const remove = async () => {
    if (busy) return;
    setError("");
    // On success the row unmounts and the workspace moves focus to the meal heading.
    try { await onRemove(); } catch (err) { setError(describeApiError(err)); }
  };

  return (
    <li className={styles.row}>
      <span className={styles.name}>{food.name}</span>
      {food.quantity !== null && <span className={styles.quantity}>{food.quantity}</span>}
      {!editing && !confirming && (
        <div className={styles.rowActions}>
          <button ref={editTrigger} type="button" className="fn-btn-ghost" disabled={busy} aria-label={`Editar alimento ${food.name}`} onClick={() => setEditing(true)}>
            Editar
          </button>
          <button ref={deleteTrigger} type="button" className="fn-btn-danger" disabled={busy} aria-label={`Excluir alimento ${food.name}`} onClick={() => setConfirming(true)}>
            Excluir
          </button>
        </div>
      )}
      {editing && (
        <FoodForm
          label="Editar alimento"
          submitLabel="Salvar alimento"
          initial={food}
          busy={busy}
          onCancel={closeEdit}
          onSubmit={async (values) => {
            // A move remounts the row in another meal; closing this unmounted one is then a harmless no-op.
            const accepted = await onSave(values);
            if (accepted) closeEdit();
            return accepted;
          }}
        />
      )}
      {confirming && (
        <div role="alertdialog" aria-label={`Excluir alimento ${food.name}`} className={styles.confirm}>
          <p>Excluir o alimento “{food.name}”?</p>
          {error && <div role="alert" className="fn-error-banner">{error}</div>}
          <div className={styles.actions}>
            <button type="button" className="fn-btn-danger" disabled={busy} onClick={() => void remove()}>
              Confirmar exclusão
            </button>
            <button type="button" className="fn-btn-ghost" autoFocus disabled={busy} onClick={closeDelete}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function FoodForm({ label, submitLabel, initial, busy, onSubmit, onCancel }: {
  label: string;
  submitLabel: string;
  /** Present when editing: prefills the fields, focuses the name and keeps the values after saving. */
  initial?: NutritionFoodResponse;
  busy: boolean;
  /** Resolves false when the submit was ignored because another mutation is running. */
  onSubmit: (values: FoodValues) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [quantity, setQuantity] = useState(initial?.quantity ?? "");
  const [meal, setMeal] = useState<NutritionMeal>(initial?.meal ?? MEALS[0].meal);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const trimmedName = name.trim();
    const trimmedQuantity = quantity.trim();
    if (!trimmedName) return setError("Informe o nome do alimento.");
    if (trimmedName.length > NAME_MAX) return setError(`O nome deve ter no máximo ${NAME_MAX} caracteres.`);
    if (trimmedQuantity.length > QUANTITY_MAX) return setError(`A quantidade deve ter no máximo ${QUANTITY_MAX} caracteres.`);
    setError("");
    try {
      const accepted = await onSubmit({ meal, name: trimmedName, quantity: trimmedQuantity || null });
      if (accepted && !initial) {
        setName("");
        setQuantity("");
      }
    } catch (err) {
      // Keep the typed values so the user can retry.
      setError(describeApiError(err));
    }
  };

  return (
    <form className={initial ? styles.inlineForm : `fn-glass ${styles.form}`} aria-label={label} onSubmit={submit} noValidate>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label className="fn-label" htmlFor={`${id}-name`}>
            Nome do alimento
          </label>
          <input
            id={`${id}-name`}
            autoFocus={!!initial}
            className={`fn-underline ${styles.input}`}
            value={name}
            disabled={busy}
            maxLength={NAME_MAX}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Arroz integral"
          />
        </div>
        <div className={styles.field}>
          <label className="fn-label" htmlFor={`${id}-quantity`}>
            Quantidade
          </label>
          <input
            id={`${id}-quantity`}
            className={`fn-underline ${styles.input}`}
            value={quantity}
            disabled={busy}
            maxLength={QUANTITY_MAX}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="Opcional, ex.: 1 prato"
          />
        </div>
        <div className={styles.field}>
          <label className="fn-label" htmlFor={`${id}-meal`}>
            Refeição
          </label>
          <select
            id={`${id}-meal`}
            className={`fn-underline ${styles.input}`}
            value={meal}
            disabled={busy}
            onChange={(event) => setMeal(event.target.value as NutritionMeal)}
          >
            {MEALS.map((option) => (
              <option key={option.meal} value={option.meal}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <div role="alert" className="fn-error-banner">
          {error}
        </div>
      )}
      <div className={styles.actions}>
        <button className="fn-btn-primary" type="submit" disabled={busy}>
          {submitLabel}
        </button>
        {onCancel && (
          <button className="fn-btn-ghost" type="button" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
