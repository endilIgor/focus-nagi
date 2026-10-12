import { useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trainingApi } from "../api/training";
import type { IsoWeekday, TrainingRoutineResponse } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { describeApiError } from "../utils/errors";
import styles from "./TrainingPage.module.css";

const WEEKDAYS: ReadonlyArray<{ day: IsoWeekday; short: string }> = [
  { day: 1, short: "Seg" },
  { day: 2, short: "Ter" },
  { day: 3, short: "Qua" },
  { day: 4, short: "Qui" },
  { day: 5, short: "Sex" },
  { day: 6, short: "Sáb" },
  { day: 7, short: "Dom" },
];

const NAME_MAX = 150;

/** Health data is cached per account so a sign-in switch never shows the previous owner's routines. */
const trainingKey = (ownerId: string) => ["health", ownerId, "training"] as const;
const routinesKey = (ownerId: string) => [...trainingKey(ownerId), "routines"] as const;

function describeWeekdays(days: IsoWeekday[]): string {
  if (days.length === 0) return "Sem dias definidos";
  return WEEKDAYS.filter((w) => days.includes(w.day)).map((w) => w.short).join(", ");
}

const describeExerciseCount = (count: number) => `${count} ${count === 1 ? "exercício" : "exercícios"}`;

export function TrainingPage() {
  const { owner } = useAuth();
  return (
    <div className={styles.page}>
      <div className="fn-eyebrow">
        <span className="fn-eyebrow-bar" />
        <span className="fn-eyebrow-text">SAÚDE</span>
      </div>
      <h1 className="fn-h1">Treino</h1>
      {/* Remounting per account drops selection, drafts, errors and submit guards of the previous owner. */}
      {owner && <RoutinesWorkspace key={owner.id} ownerId={owner.id} />}
    </div>
  );
}

function RoutinesWorkspace({ ownerId }: { ownerId: string }) {
  const queryClient = useQueryClient();
  const routinesQuery = useQuery({ queryKey: routinesKey(ownerId), queryFn: () => trainingApi.allRoutines() });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Synchronous guard: state-driven `disabled` lags a render behind back-to-back (or programmatic) submits.
  const inFlight = useRef(false);

  // Captures this workspace's owner, so a mutation finishing after an account switch only refreshes its own cache.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trainingKey(ownerId) });
  const createRoutine = useMutation({
    mutationFn: (values: RoutineValues) => trainingApi.createRoutine(values),
    onSuccess: invalidate,
  });
  const updateRoutine = useMutation({
    mutationFn: ({ id, values }: { id: number; values: RoutineValues }) => trainingApi.updateRoutine(id, values),
    onSuccess: invalidate,
  });
  const removeRoutine = useMutation({
    mutationFn: (id: number) => trainingApi.removeRoutine(id),
    onSuccess: invalidate,
  });
  const busy = createRoutine.isPending || updateRoutine.isPending || removeRoutine.isPending;
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [panelError, setPanelError] = useState("");
  // Derived from the current list so a routine removed elsewhere drops out of the panel.
  const selected = routinesQuery.data?.find((r) => r.id === selectedId) ?? null;

  const select = (id: number | null) => {
    setSelectedId(id);
    setEditing(false);
    setConfirmingDelete(false);
    setPanelError("");
  };

  /** Runs one mutation at a time; resolves false when another one is still in flight. */
  const exclusive = async (task: () => Promise<void>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    try {
      await task();
      return true;
    } finally {
      inFlight.current = false;
    }
  };

  const create = (values: RoutineValues) =>
    exclusive(async () => {
      const saved = await createRoutine.mutateAsync(values);
      select(saved.id);
    });

  const save = (id: number, values: RoutineValues) =>
    exclusive(async () => {
      await updateRoutine.mutateAsync({ id, values });
      setEditing(false);
    });

  const confirmRemoval = (id: number) =>
    void exclusive(async () => {
      try {
        await removeRoutine.mutateAsync(id);
        select(null);
      } catch (err) {
        setConfirmingDelete(false);
        setPanelError(describeApiError(err));
      }
    });

  return (
    <section className={styles.workspace} aria-label="Rotinas de treino">
      <RoutineForm label="Nova rotina" submitLabel="Criar rotina" busy={busy} resetOnSuccess onSubmit={create} />
      {routinesQuery.isPending && <span className="fn-spinner" aria-label="Carregando rotinas" />}
      {routinesQuery.isError && (
        <div role="alert" className="fn-error-banner">
          {describeApiError(routinesQuery.error)}
          <button type="button" className={styles.retry} onClick={() => void routinesQuery.refetch()}>
            Tentar novamente
          </button>
        </div>
      )}
      {routinesQuery.isSuccess && routinesQuery.data.length === 0 && (
        <p className="fn-empty">Nenhuma rotina cadastrada.</p>
      )}
      {routinesQuery.isSuccess && routinesQuery.data.length > 0 && (
        <RoutineList routines={routinesQuery.data} selectedId={selectedId} onSelect={select} busy={busy} />
      )}
      {selected && (
        <section className={`fn-glass ${styles.detail}`} aria-label="Rotina selecionada">
          <h2 className={styles.detailTitle}>{selected.name}</h2>
          <p className={styles.meta}>
            {describeWeekdays(selected.weekdays)} · {describeExerciseCount(selected.exerciseCount)}
          </p>
          {panelError && (
            <div role="alert" className="fn-error-banner">
              {panelError}
            </div>
          )}
          {editing ? (
            <RoutineForm
              key={selected.id}
              label="Editar rotina"
              submitLabel="Salvar alterações"
              initial={{ name: selected.name, weekdays: selected.weekdays }}
              busy={busy}
              onSubmit={(values) => save(selected.id, values)}
              onCancel={() => setEditing(false)}
            />
          ) : confirmingDelete ? (
            <div role="alertdialog" aria-label="Confirmar exclusão" className={styles.confirm}>
              <p>Excluir a rotina “{selected.name}” e seus exercícios?</p>
              <div className={styles.actions}>
                <button type="button" className="fn-btn-danger" disabled={busy} onClick={() => confirmRemoval(selected.id)}>
                  Confirmar exclusão
                </button>
                <button type="button" className="fn-btn-ghost" disabled={busy} onClick={() => setConfirmingDelete(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.actions}>
              <button
                type="button"
                className="fn-btn-ghost"
                disabled={busy}
                onClick={() => {
                  setPanelError("");
                  setEditing(true);
                }}
              >
                Editar rotina
              </button>
              <button
                type="button"
                className="fn-btn-danger"
                disabled={busy}
                onClick={() => {
                  setPanelError("");
                  setConfirmingDelete(true);
                }}
              >
                Excluir rotina
              </button>
            </div>
          )}
        </section>
      )}
    </section>
  );
}

interface RoutineValues {
  name: string;
  weekdays: IsoWeekday[];
}

function RoutineForm({
  label,
  submitLabel,
  initial,
  busy,
  resetOnSuccess = false,
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  initial?: RoutineValues;
  busy: boolean;
  resetOnSuccess?: boolean;
  /** Resolves false when the submit was ignored because another mutation is running. */
  onSubmit: (values: RoutineValues) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const nameId = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [days, setDays] = useState<ReadonlySet<IsoWeekday>>(() => new Set(initial?.weekdays ?? []));
  const [error, setError] = useState("");

  const toggleDay = (day: IsoWeekday) =>
    setDays((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) return setError("Informe um nome para a rotina.");
    // UTF-16 length, the same unit the API validates and `maxLength` enforces.
    if (trimmed.length > NAME_MAX) return setError(`O nome deve ter no máximo ${NAME_MAX} caracteres.`);
    setError("");
    try {
      const accepted = await onSubmit({ name: trimmed, weekdays: WEEKDAYS.filter((w) => days.has(w.day)).map((w) => w.day) });
      if (accepted && resetOnSuccess) {
        setName("");
        setDays(new Set());
      }
    } catch (err) {
      // Keep the typed values so the user can retry.
      setError(describeApiError(err));
    }
  };

  return (
    <form className={`fn-glass ${styles.form}`} aria-label={label} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label className="fn-label" htmlFor={nameId}>
          Nome da rotina
        </label>
        <input
          id={nameId}
          className={`fn-underline ${styles.input}`}
          value={name}
          disabled={busy}
          maxLength={NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Treino A"
        />
      </div>
      <fieldset className={styles.days} disabled={busy}>
        <legend className="fn-label">Dias da semana (opcional)</legend>
        {WEEKDAYS.map((w) => (
          <label key={w.day} className={styles.day}>
            <input type="checkbox" checked={days.has(w.day)} onChange={() => toggleDay(w.day)} />
            {w.short}
          </label>
        ))}
      </fieldset>
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

function RoutineList({
  routines,
  selectedId,
  onSelect,
  busy,
}: {
  routines: TrainingRoutineResponse[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  busy: boolean;
}) {
  return (
    <ul className={styles.list} aria-label="Rotinas">
      {routines.map((routine) => (
        <li key={routine.id} className={styles.row}>
          <button
            type="button"
            className={styles.select}
            disabled={busy}
            aria-pressed={routine.id === selectedId}
            onClick={() => onSelect(routine.id)}
          >
            {routine.name}
          </button>
          <span className={styles.meta}>
            {describeWeekdays(routine.weekdays)} · {describeExerciseCount(routine.exerciseCount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
