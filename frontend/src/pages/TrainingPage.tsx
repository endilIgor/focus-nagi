import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trainingApi } from "../api/training";
import type { IsoWeekday, TrainingRoutineResponse, TrainingExerciseCreateRequest, TrainingExerciseResponse, TrainingExerciseMode } from "../api/types";
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
const exercisesKey = (ownerId: string, routineId: number) => [...routinesKey(ownerId), routineId, "exercises"] as const;

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
  const [operationPending, setOperationPending] = useState(false);

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
    // Unmount the deleted routine's exercises panel and drop its query (cancelling any load in flight)
    // before refreshing, so nothing refetches a routine that no longer exists.
    onSuccess: (_, id) => {
      flushSync(() => select(null));
      queryClient.removeQueries({ queryKey: exercisesKey(ownerId, id), exact: true });
      return invalidate();
    },
  });
  const busy = operationPending || createRoutine.isPending || updateRoutine.isPending || removeRoutine.isPending;
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
    setOperationPending(true);
    try {
      await task();
      return true;
    } finally {
      inFlight.current = false;
      setOperationPending(false);
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
        <RoutineList routines={routinesQuery.data} selectedId={selectedId} onSelect={(id) => { if (!inFlight.current) select(id); }} busy={busy} />
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
          <ExercisesPanel key={`exercises-${selected.id}`} ownerId={ownerId} routineId={selected.id} busy={busy} exclusive={exclusive} />
        </section>
      )}
    </section>
  );
}

function ExercisesPanel({ ownerId, routineId, busy, exclusive }: {
  ownerId: string; routineId: number; busy: boolean; exclusive: (task: () => Promise<void>) => Promise<boolean>;
}) {
  const client = useQueryClient();
  const key = exercisesKey(ownerId, routineId);
  const query = useQuery({ queryKey: exercisesKey(ownerId, routineId), queryFn: () => trainingApi.allExercises(routineId) });
  const create = useMutation({
    mutationFn: (values: TrainingExerciseCreateRequest) => trainingApi.createExercise(routineId, values),
    onSuccess: async (saved) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<TrainingExerciseResponse[]>(key, (old = []) => [...old.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.id - b.id));
      await client.invalidateQueries({ queryKey: trainingKey(ownerId) });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, values }: { id: number; values: TrainingExerciseCreateRequest }) => trainingApi.updateExercise(routineId, id, values),
    onSuccess: async (saved) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<TrainingExerciseResponse[]>(key, (old = []) => old.map((item) => item.id === saved.id ? saved : item));
      await client.invalidateQueries({ queryKey: trainingKey(ownerId) });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => trainingApi.removeExercise(routineId, id),
    onSuccess: async (_, id) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<TrainingExerciseResponse[]>(key, (old = []) => old.filter((item) => item.id !== id));
      await client.invalidateQueries({ queryKey: trainingKey(ownerId) });
    },
  });
  return <section aria-label="Exercícios da rotina">
    <h3 className={styles.detailTitle}>Exercícios</h3>
    <ExerciseForm label="Novo exercício" busy={busy} onSubmit={(values) => exclusive(async () => { await create.mutateAsync(values); })} />
    {query.isPending && <span className="fn-spinner" aria-label="Carregando exercícios" />}
    {query.isError && <div role="alert" className="fn-error-banner">
      {describeApiError(query.error)}
      <button type="button" className={styles.retry} onClick={() => void query.refetch()}>Tentar novamente</button>
    </div>}
    {query.isSuccess && (query.data.length === 0 ? <p className="fn-empty">Nenhum exercício cadastrado.</p> :
      <ul className={styles.list} aria-label="Exercícios">{query.data.map((exercise) => <ExerciseItem
        key={exercise.id} exercise={exercise} busy={busy}
        onSave={(values) => exclusive(async () => { await update.mutateAsync({ id: exercise.id, values }); })}
        onRemove={() => exclusive(async () => { await remove.mutateAsync(exercise.id); })}
      />)}</ul>)}
  </section>;
}

function ExerciseItem({ exercise, busy, onSave, onRemove }: {
  exercise: TrainingExerciseResponse; busy: boolean;
  onSave: (values: TrainingExerciseCreateRequest) => Promise<boolean>; onRemove: () => Promise<boolean>;
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
    try { await onRemove(); } catch (err) { setError(describeApiError(err)); }
  };
  return <li className={styles.row}>
    <div className={styles.exerciseDescription}><h4>{exercise.name}</h4>
      <p className={styles.meta}>{exercise.sets} séries · {exercise.mode === "REPETITIONS" ? `${exercise.repetitions} repetições` : `${exercise.durationSeconds} segundos`}</p>
      {exercise.notes && <p className={styles.exerciseNotes}>{exercise.notes}</p>}
    </div>
    {!editing && !confirming && <div className={styles.actions}>
      <button ref={editTrigger} type="button" className="fn-btn-ghost" disabled={busy} aria-label={`Editar exercício ${exercise.id}`} onClick={() => setEditing(true)}>Editar</button>
      <button ref={deleteTrigger} type="button" className="fn-btn-danger" disabled={busy} aria-label={`Excluir exercício ${exercise.id}`} onClick={() => setConfirming(true)}>Excluir</button>
    </div>}
    {editing && <ExerciseForm label="Editar exercício" initial={exercise} busy={busy} onCancel={closeEdit}
      onSubmit={async (values) => { const accepted = await onSave(values); if (accepted) closeEdit(); return accepted; }} />}
    {confirming && <div role="alertdialog" aria-label={`Excluir exercício ${exercise.id}`} className={styles.confirm}>
      <p>Excluir o exercício “{exercise.name}”?</p>
      {error && <div role="alert" className="fn-error-banner">{error}</div>}
      <div className={styles.actions}>
        <button type="button" className="fn-btn-danger" disabled={busy} onClick={() => void remove()}>Confirmar exclusão</button>
        <button type="button" className="fn-btn-ghost" autoFocus disabled={busy} onClick={closeDelete}>Cancelar</button>
      </div>
    </div>}
  </li>;
}

function ExerciseForm({ label, busy, onSubmit, initial, onCancel }: {
  label: string; busy: boolean; onSubmit: (values: TrainingExerciseCreateRequest) => Promise<boolean>;
  initial?: TrainingExerciseResponse; onCancel?: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [sets, setSets] = useState(String(initial?.sets ?? 1));
  const [mode, setMode] = useState<TrainingExerciseMode>(initial?.mode ?? "REPETITIONS");
  const [target, setTarget] = useState(initial ? String(initial.mode === "REPETITIONS" ? initial.repetitions : initial.durationSeconds) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!name.trim() || name.trim().length > NAME_MAX) return setError("Informe um nome de 1 a 150 caracteres.");
    if (!Number.isInteger(Number(sets)) || Number(sets) < 1 || Number(sets) > 1000) return setError("Séries devem ser um inteiro de 1 a 1000.");
    const max = mode === "REPETITIONS" ? 1000 : 86400;
    if (!Number.isInteger(Number(target)) || Number(target) < 1 || Number(target) > max) return setError(`O alvo deve ser um inteiro de 1 a ${max}.`);
    if (notes.trim().length > 2000) return setError("Observações devem ter no máximo 2000 caracteres.");
    const common = { name: name.trim(), sets: Number(sets), notes: notes.trim() || null };
    const values: TrainingExerciseCreateRequest = mode === "REPETITIONS"
      ? { ...common, mode: "REPETITIONS", repetitions: Number(target), durationSeconds: null }
      : { ...common, mode: "DURATION", repetitions: null, durationSeconds: Number(target) };
    setError("");
    try {
      if (await onSubmit(values) && !initial) { setName(""); setSets("1"); setMode("REPETITIONS"); setTarget(""); setNotes(""); }
    } catch (err) { setError(describeApiError(err)); }
  };
  return <form aria-label={label} className={styles.form} onSubmit={submit} noValidate>
    <div className={styles.field}><label className="fn-label" htmlFor={`${id}-name`}>Nome do exercício</label>
      <input id={`${id}-name`} autoFocus={!!initial} className={`fn-underline ${styles.input}`} disabled={busy} maxLength={150} value={name} onChange={(e) => setName(e.target.value)} /></div>
    <div className={styles.field}><label className="fn-label" htmlFor={`${id}-sets`}>Séries</label>
      <input id={`${id}-sets`} className={`fn-underline ${styles.input}`} type="number" min={1} max={1000} step={1} disabled={busy} value={sets} onChange={(e) => setSets(e.target.value)} /></div>
    <div className={styles.field}><label className="fn-label" htmlFor={`${id}-mode`}>Modo</label>
      <select id={`${id}-mode`} className={`fn-underline ${styles.input}`} disabled={busy} value={mode} onChange={(e) => { setMode(e.target.value as TrainingExerciseMode); setTarget(""); }}>
        <option value="REPETITIONS">Repetições</option><option value="DURATION">Duração</option>
      </select></div>
    <div className={styles.field}><label className="fn-label" htmlFor={`${id}-target`}>{mode === "REPETITIONS" ? "Repetições" : "Duração (segundos)"}</label>
      <input id={`${id}-target`} className={`fn-underline ${styles.input}`} type="number" min={1} max={mode === "REPETITIONS" ? 1000 : 86400} step={1} disabled={busy} value={target} onChange={(e) => setTarget(e.target.value)} /></div>
    <div className={styles.field}><label className="fn-label" htmlFor={`${id}-notes`}>Observações</label>
      <textarea id={`${id}-notes`} className={`fn-underline ${styles.input}`} disabled={busy} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
    {error && <div role="alert" className="fn-error-banner">{error}</div>}
    <div className={styles.actions}><button type="submit" className="fn-btn-primary" disabled={busy}>{initial ? "Salvar exercício" : "Criar exercício"}</button>
      {onCancel && <button type="button" className="fn-btn-ghost" disabled={busy} onClick={onCancel}>Cancelar</button>}
    </div>
  </form>;
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
