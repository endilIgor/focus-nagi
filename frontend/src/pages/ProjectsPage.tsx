import { useState, type FormEvent } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "../api/projects";
import { fetchAllContent } from "../api/pagination";
import { tasksApi } from "../api/tasks";
import { Cells } from "../components/Cells";
import { formatMinutesAsHm } from "../hooks/useClock";
import { useTheme } from "../theme/ThemeContext";
import { getTints } from "../theme/themes";
import { todayIso } from "../utils/date";
import { describeApiError } from "../utils/errors";
import { dueLabel } from "../utils/taskDisplay";
import styles from "./ProjectsPage.module.css";

export function ProjectsPage() {
  const { theme } = useTheme();
  const tints = getTints(theme);
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects", "all"],
    queryFn: () => fetchAllContent((page, size) => projectsApi.list(undefined, page, size)),
  });
  const projects = projectsQuery.data ?? [];

  const focusQueries = useQueries({
    queries: projects.map((p) => ({ queryKey: ["project-focus", p.id], queryFn: () => projectsApi.focus(p.id) })),
  });
  const totalTaskQueries = useQueries({
    queries: projects.map((p) => ({ queryKey: ["project-task-count", p.id, "all"], queryFn: () => tasksApi.list({ projectId: p.id, size: 1 }) })),
  });
  const doneTaskQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ["project-task-count", p.id, "done"],
      queryFn: () => tasksApi.list({ projectId: p.id, status: "COMPLETED", size: 1 }),
    })),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["projects"] });

  const transition = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "complete" | "archive" | "restore" }) => {
      if (action === "complete") return projectsApi.complete(id);
      if (action === "archive") return projectsApi.archive(id);
      return projectsApi.restore(id);
    },
    onSuccess: invalidate,
    onError: (err) => setRowError(describeApiError(err)),
  });

  const today = todayIso();

  return (
    <div>
      <div className={styles.headRow}>
        <div>
          <div className="fn-eyebrow">
            <span className="fn-eyebrow-bar" />
            <span className="fn-eyebrow-text">CAMPANHAS</span>
          </div>
          <h1 className="fn-h1">Projetos</h1>
        </div>
        <button className="fn-btn-primary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Fechar" : "+ Novo projeto"}
        </button>
      </div>

      {showCreate && (
        <CreateProjectPanel
          onCreated={() => {
            setShowCreate(false);
            invalidate();
          }}
        />
      )}

      {rowError && <div className="fn-error-banner">{rowError}</div>}

      <div className={styles.grid}>
        {projects.map((p, i) => {
          const tint = tints[i % tints.length];
          const minutes = focusQueries[i]?.data ? Math.floor(focusQueries[i]!.data!.totalFocusSeconds / 60) : undefined;
          const total = totalTaskQueries[i]?.data?.totalElements;
          const done = doneTaskQueries[i]?.data?.totalElements;
          const pct = total ? Math.round(((done ?? 0) / total) * 100) : 0;
          const late = !!p.dueDate && p.dueDate < today && p.status === "ACTIVE";

          return (
            <div key={p.id} className={styles.card}>
              <div className={styles.cardTint} style={{ background: tint, boxShadow: `0 0 14px ${tint}` }} />
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>{p.title}</div>
                <span
                  className={styles.statusBadge}
                  style={{
                    borderColor: p.status === "ACTIVE" ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.1)",
                    color: p.status === "ACTIVE" ? "#E4E0EF" : "#8B86A0",
                  }}
                  onClick={() => {
                    if (p.status === "ACTIVE") transition.mutate({ id: p.id, action: "complete" });
                    else if (p.status === "ARCHIVED") transition.mutate({ id: p.id, action: "restore" });
                  }}
                  title="Clique para mudar status"
                >
                  {p.status}
                </span>
              </div>
              {p.description && <div className={styles.description}>{p.description}</div>}
              <div className={styles.stats}>
                <div>
                  <div className={styles.statLabel}>FOCO</div>
                  <div className={styles.statValue}>{minutes != null ? formatMinutesAsHm(minutes) : "…"}</div>
                </div>
                <div>
                  <div className={styles.statLabel}>TAREFAS</div>
                  <div className={styles.statValue}>{total != null ? `${done ?? 0}/${total}` : "…"}</div>
                </div>
                <div>
                  <div className={styles.statLabel}>PRAZO</div>
                  <div className={styles.statValue} style={{ color: late ? "#FF8098" : "var(--text-bright)" }}>
                    {p.dueDate ? dueLabel(p.dueDate, today) : "—"}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <Cells pct={pct} count={26} color={tint} highlightColor={theme.acc2} height={7} />
              </div>
              <div className={styles.pctLabel}>{pct}% DAS TAREFAS CONCLUÍDAS</div>
              <div className={styles.actions}>
                {p.status !== "ARCHIVED" && (
                  <button className="fn-btn-ghost" style={{ padding: "6px 12px", fontSize: 10 }} onClick={() => transition.mutate({ id: p.id, action: "archive" })}>
                    Arquivar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {projects.length === 0 && !projectsQuery.isLoading && (
        <div style={{ border: "1px dashed rgba(255,255,255,.12)", padding: 64, textAlign: "center" }} className="fn-empty">
          NENHUM PROJETO CRIADO
        </div>
      )}
    </div>
  );
}

function CreateProjectPanel({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      projectsApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
      }),
    onSuccess: onCreated,
    onError: (err) => setError(describeApiError(err)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createMutation.mutate();
  };

  return (
    <form className={styles.createPanel} onSubmit={onSubmit}>
      {error && <div className="fn-error-banner full">{error}</div>}
      <label className={`fn-field ${styles.full}`}>
        <span>TÍTULO</span>
        <input className="fn-input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
      </label>
      <label className={`fn-field ${styles.full}`}>
        <span>DESCRIÇÃO</span>
        <textarea className="fn-textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </label>
      <label className="fn-field">
        <span>INÍCIO</span>
        <input className="fn-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>
      <label className="fn-field">
        <span>PRAZO</span>
        <input className="fn-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      <div className={styles.createActions}>
        <button type="submit" className="fn-btn-primary" disabled={createMutation.isPending || !title.trim()}>
          {createMutation.isPending ? "Criando..." : "Criar projeto"}
        </button>
      </div>
    </form>
  );
}
