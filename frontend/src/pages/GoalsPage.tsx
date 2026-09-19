import { useState, type FormEvent } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { goalsApi } from "../api/goals";
import { fetchAllContent } from "../api/pagination";
import { projectsApi } from "../api/projects";
import type { GoalPeriod, GoalType } from "../api/types";
import { ProgressRing } from "../components/ProgressRing";
import { useTheme } from "../theme/ThemeContext";
import { getTints } from "../theme/themes";
import { todayIso } from "../utils/date";
import { describeApiError } from "../utils/errors";
import { GOAL_PERIOD_LABEL, GOAL_STATUS_LABEL, GOAL_TYPE_LABEL } from "../utils/labels";
import styles from "./GoalsPage.module.css";

const UNIT_LABEL: Record<GoalType, string> = {
  FOCUS_MINUTES: "min",
  FOCUS_SESSIONS: "sess",
  TASKS_COMPLETED: "tarefas",
};

export function GoalsPage() {
  const { theme } = useTheme();
  const tints = getTints(theme);
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const goalsQuery = useQuery({
    queryKey: ["goals", "all"],
    queryFn: () => fetchAllContent((page, size) => goalsApi.list(undefined, page, size)),
  });
  const goals = goalsQuery.data ?? [];

  const progressQueries = useQueries({
    queries: goals.map((g) => ({ queryKey: ["goal-progress", g.id], queryFn: () => goalsApi.progress(g.id) })),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["goals"] });

  const transition = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "complete" | "archive" | "restore" }) => {
      if (action === "complete") return goalsApi.complete(id);
      if (action === "archive") return goalsApi.archive(id);
      return goalsApi.restore(id);
    },
    onSuccess: invalidate,
    onError: (err) => setRowError(describeApiError(err)),
  });

  return (
    <div>
      <div className={styles.headRow}>
        <div>
          <div className="fn-eyebrow">
            <span className="fn-eyebrow-bar" />
            <span className="fn-eyebrow-text">CONTRATOS</span>
          </div>
          <h1 className="fn-h1">Metas</h1>
        </div>
        <button className="fn-btn-primary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Fechar" : "+ Nova meta"}
        </button>
      </div>

      {showCreate && (
        <CreateGoalPanel
          onCreated={() => {
            setShowCreate(false);
            invalidate();
          }}
        />
      )}

      {rowError && <div className="fn-error-banner">{rowError}</div>}

      <div className={styles.grid}>
        {goals.map((g, i) => {
          const tint = tints[i % tints.length];
          const progress = progressQueries[i]?.data;
          const current = progress?.currentValue ?? 0;
          const target = progress?.targetValue ?? g.targetValue;
          const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
          const finalTint = pct >= 100 ? theme.acc2 : tint;

          return (
            <div key={g.id} className={styles.card}>
              <div className={styles.glow} style={{ background: theme.glow }} />
              <ProgressRing size={100} radius={50} strokeWidth={8} progress={pct / 100} color={finalTint} glow={theme.glow} />
              <div className={styles.body}>
                <div className={styles.type}>
                  {GOAL_TYPE_LABEL[g.type]} · {GOAL_PERIOD_LABEL[g.period]}
                </div>
                <div className={styles.title}>{g.title}</div>
                <div className={styles.ratio} style={{ color: finalTint }}>
                  {current} / {target} {UNIT_LABEL[g.type]}
                </div>
                <div className={styles.meta}>
                  {progress ? `${progress.periodStart} → ${progress.periodEnd} · ${pct}%` : `${GOAL_STATUS_LABEL[g.status]} · ${pct}%`}
                </div>
                <div className={styles.actions}>
                  {g.status === "ACTIVE" && (
                    <button className="fn-btn-ghost" style={{ padding: "5px 10px", fontSize: 9 }} onClick={() => transition.mutate({ id: g.id, action: "complete" })}>
                      Concluir
                    </button>
                  )}
                  {g.status !== "ARCHIVED" ? (
                    <button className="fn-btn-ghost" style={{ padding: "5px 10px", fontSize: 9 }} onClick={() => transition.mutate({ id: g.id, action: "archive" })}>
                      Arquivar
                    </button>
                  ) : (
                    <button className="fn-btn-ghost" style={{ padding: "5px 10px", fontSize: 9 }} onClick={() => transition.mutate({ id: g.id, action: "restore" })}>
                      Restaurar
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {goals.length === 0 && !goalsQuery.isLoading && (
        <div style={{ border: "1px dashed rgba(255,255,255,.12)", padding: 64, textAlign: "center" }} className="fn-empty">
          NENHUMA META DEFINIDA
        </div>
      )}
    </div>
  );
}

function CreateGoalPanel({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<GoalType>("FOCUS_MINUTES");
  const [period, setPeriod] = useState<GoalPeriod>("WEEKLY");
  const [targetValue, setTargetValue] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects", "active-for-goal"],
    queryFn: () => fetchAllContent((page, size) => projectsApi.list("ACTIVE", page, size)),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      goalsApi.create({
        title: title.trim(),
        type,
        period,
        targetValue: Number(targetValue),
        startDate,
        endDate: endDate || undefined,
        projectId: projectId === "" ? undefined : projectId,
      }),
    onSuccess: onCreated,
    onError: (err) => setError(describeApiError(err)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetValue) return;
    createMutation.mutate();
  };

  return (
    <form className={styles.createPanel} onSubmit={onSubmit}>
      {error && <div className="fn-error-banner full">{error}</div>}
      <label className={`fn-field ${styles.full}`}>
        <span>TÍTULO</span>
        <input className="fn-input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={150} />
      </label>
      <label className="fn-field">
        <span>TIPO</span>
        <select className="fn-select" value={type} onChange={(e) => setType(e.target.value as GoalType)}>
          <option value="FOCUS_MINUTES">{GOAL_TYPE_LABEL.FOCUS_MINUTES}</option>
          <option value="FOCUS_SESSIONS">{GOAL_TYPE_LABEL.FOCUS_SESSIONS}</option>
          <option value="TASKS_COMPLETED">{GOAL_TYPE_LABEL.TASKS_COMPLETED}</option>
        </select>
      </label>
      <label className="fn-field">
        <span>PERÍODO</span>
        <select className="fn-select" value={period} onChange={(e) => setPeriod(e.target.value as GoalPeriod)}>
          <option value="DAILY">{GOAL_PERIOD_LABEL.DAILY}</option>
          <option value="WEEKLY">{GOAL_PERIOD_LABEL.WEEKLY}</option>
          <option value="MONTHLY">{GOAL_PERIOD_LABEL.MONTHLY}</option>
          <option value="CUSTOM">{GOAL_PERIOD_LABEL.CUSTOM}</option>
        </select>
      </label>
      <label className="fn-field">
        <span>ALVO</span>
        <input className="fn-input" type="number" min={1} max={1000000} value={targetValue} onChange={(e) => setTargetValue(e.target.value)} required />
      </label>
      <label className="fn-field">
        <span>INÍCIO</span>
        <input className="fn-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      </label>
      <label className="fn-field">
        <span>FIM (OPCIONAL)</span>
        <input className="fn-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </label>
      <label className="fn-field">
        <span>PROJETO (OPCIONAL)</span>
        <select className="fn-select" value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">— nenhum —</option>
          {(projectsQuery.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.createActions}>
        <button type="submit" className="fn-btn-primary" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Criando..." : "Criar meta"}
        </button>
      </div>
    </form>
  );
}
