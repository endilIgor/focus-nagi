import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "../api/projects";
import { fetchAllContent } from "../api/pagination";
import { tasksApi } from "../api/tasks";
import type { TaskPriority, TaskResponse } from "../api/types";
import { useTheme } from "../theme/ThemeContext";
import { getTints } from "../theme/themes";
import { todayIso } from "../utils/date";
import { describeApiError } from "../utils/errors";
import { daysUntil, dueLabel, priorityStyle } from "../utils/taskDisplay";
import styles from "./TasksPage.module.css";

const FILTERS = ["TODAS", "HOJE", "ATRASADAS", "ALTA", "CONCLUÍDAS"] as const;
type Filter = (typeof FILTERS)[number];

export function TasksPage() {
  const { theme } = useTheme();
  const tints = getTints(theme);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("TODAS");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: () => fetchAllContent((page, size) => tasksApi.list({ page, size })),
  });
  const projectsQuery = useQuery({
    queryKey: ["projects", "all-for-tasks"],
    queryFn: () => fetchAllContent((page, size) => projectsApi.list(undefined, page, size)),
  });
  const expandedTaskQuery = useQuery({
    queryKey: ["task", expandedId],
    queryFn: () => tasksApi.get(expandedId!),
    enabled: expandedId != null,
  });

  const projectsById = useMemo(() => {
    const map = new Map<number, string>();
    (projectsQuery.data ?? []).forEach((p) => map.set(p.id, p.title));
    return map;
  }, [projectsQuery.data]);

  const invalidateTasks = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["task", expandedId] });
    queryClient.invalidateQueries({ queryKey: ["today"] });
  };

  const toggleComplete = useMutation({
    mutationFn: (t: TaskResponse) => (t.status === "COMPLETED" ? tasksApi.reopen(t.id) : tasksApi.complete(t.id)),
    onSuccess: invalidateTasks,
    onError: (err) => setRowError(describeApiError(err)),
  });
  const cancelTask = useMutation({
    mutationFn: (id: number) => tasksApi.cancel(id),
    onSuccess: invalidateTasks,
    onError: (err) => setRowError(describeApiError(err)),
  });
  const removeTask = useMutation({
    mutationFn: (id: number) => tasksApi.remove(id),
    onSuccess: () => {
      setExpandedId(null);
      invalidateTasks();
    },
    onError: (err) => setRowError(describeApiError(err)),
  });
  const addSubtask = useMutation({
    mutationFn: () => tasksApi.addSubtask(expandedId!, subtaskDraft.trim()),
    onSuccess: () => {
      setSubtaskDraft("");
      invalidateTasks();
    },
    onError: (err) => setRowError(describeApiError(err)),
  });
  const toggleSubtask = useMutation({
    mutationFn: ({ taskId, subtaskId, completed }: { taskId: number; subtaskId: number; completed: boolean }) =>
      completed ? tasksApi.reopenSubtask(taskId, subtaskId) : tasksApi.completeSubtask(taskId, subtaskId),
    onSuccess: invalidateTasks,
    onError: (err) => setRowError(describeApiError(err)),
  });

  const today = todayIso();
  const rows = tasksQuery.data ?? [];
  const filtered = rows.filter((t) => {
    switch (filter) {
      case "HOJE":
        return t.dueDate === today;
      case "ATRASADAS":
        return !!t.dueDate && t.dueDate < today && t.status !== "COMPLETED" && t.status !== "CANCELLED";
      case "ALTA":
        return t.priority === "HIGH";
      case "CONCLUÍDAS":
        return t.status === "COMPLETED";
      default:
        return true;
    }
  });

  return (
    <div>
      <div className={styles.headRow}>
        <div>
          <div className="fn-eyebrow">
            <span className="fn-eyebrow-bar" />
            <span className="fn-eyebrow-text">BACKLOG</span>
          </div>
          <h1 className="fn-h1">Tarefas</h1>
        </div>
        <button className="fn-btn-primary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Fechar" : "+ Nova tarefa"}
        </button>
      </div>

      {showCreate && (
        <CreateTaskPanel
          projects={projectsQuery.data ?? []}
          onCreated={() => {
            setShowCreate(false);
            invalidateTasks();
          }}
        />
      )}

      <div className={styles.filters}>
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`fn-chip ${filter === f ? "is-active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {rowError && <div className="fn-error-banner">{rowError}</div>}

      <div className={styles.table}>
        <div className={styles.tableHead}>
          <span />
          <span>TÍTULO</span>
          <span>PROJETO</span>
          <span>PRAZO</span>
          <span>PRIORIDADE</span>
          <span>ESTIMATIVA</span>
        </div>

        {filtered.map((t) => {
          const prio = priorityStyle(t.priority);
          const done = t.status === "COMPLETED";
          const late = !!t.dueDate && daysUntil(t.dueDate, today) < 0 && !done;
          const isExpanded = expandedId === t.id;
          const expandedData = isExpanded ? expandedTaskQuery.data : undefined;

          return (
            <div key={t.id} className={styles.row}>
              <div className={styles.rowMain}>
                <button
                  type="button"
                  className={styles.checkbox}
                  style={{ borderColor: done ? theme.acc : undefined, background: done ? theme.acc : undefined }}
                  onClick={() => toggleComplete.mutate(t)}
                  aria-label={done ? `Reabrir ${t.title}` : `Concluir ${t.title}`}
                >
                  {done ? "✓" : ""}
                </button>
                <button
                  type="button"
                  className={styles.expandButton}
                  onClick={() => setExpandedId(isExpanded ? null : t.id)}
                  aria-expanded={isExpanded}
                >
                  <div className={styles.title} style={{ color: done ? "var(--text-faint)" : "var(--text)", textDecoration: done ? "line-through" : "none" }}>
                    {t.title}
                  </div>
                  <div className={styles.subLabel}>{t.status}</div>
                </button>
                <span className={styles.projectCell}>
                  {t.projectId && (
                    <>
                      <span className={styles.projectTint} style={{ background: tints[t.projectId % tints.length] }} />
                      <span className={styles.projectName}>{projectsById.get(t.projectId) ?? `#${t.projectId}`}</span>
                    </>
                  )}
                </span>
                <span className={styles.dueCell} style={{ color: late ? "#FF8098" : t.dueDate === today ? theme.acc2 : "var(--text-mute)" }}>
                  {dueLabel(t.dueDate, today)}
                </span>
                <span className={styles.prioBadge} style={{ borderColor: prio.border, color: prio.color }}>
                  {t.priority}
                </span>
                <span className={styles.estCell}>{t.estimatedMinutes ? `${t.estimatedMinutes}min` : "—"}</span>
              </div>

              {isExpanded && (
                <div className={styles.expanded}>
                  {expandedData?.description && <div className={styles.description}>{expandedData.description}</div>}

                  {(expandedData?.subtasks ?? []).map((s) => (
                    <div key={s.id} className={styles.subtaskRow}>
                      <button
                        className={styles.subtaskBox}
                        style={{ borderColor: s.completed ? theme.acc : "rgba(255,255,255,.22)", background: s.completed ? theme.acc : "transparent" }}
                        onClick={() => toggleSubtask.mutate({ taskId: t.id, subtaskId: s.id, completed: s.completed })}
                      />
                      <span style={{ font: "400 13px 'Barlow',sans-serif", color: s.completed ? "var(--text-faint)" : "var(--text-dim)", textDecoration: s.completed ? "line-through" : "none" }}>
                        {s.title}
                      </span>
                      <button
                        className="fn-btn-ghost"
                        style={{ padding: "3px 8px", fontSize: 9, marginLeft: "auto" }}
                        onClick={() => tasksApi.removeSubtask(t.id, s.id).then(invalidateTasks)}
                      >
                        remover
                      </button>
                    </div>
                  ))}

                  <div className={styles.subtaskAdd}>
                    <input
                      className="fn-input"
                      placeholder="Nova subtarefa..."
                      value={subtaskDraft}
                      onChange={(e) => setSubtaskDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && subtaskDraft.trim()) addSubtask.mutate();
                      }}
                    />
                    <button className="fn-btn-ghost" disabled={!subtaskDraft.trim()} onClick={() => addSubtask.mutate()}>
                      Adicionar
                    </button>
                  </div>

                  <div className={styles.rowActions}>
                    {t.status !== "CANCELLED" && t.status !== "COMPLETED" && (
                      <button className="fn-btn-ghost" style={{ padding: "8px 14px", fontSize: 10 }} onClick={() => cancelTask.mutate(t.id)}>
                        Cancelar tarefa
                      </button>
                    )}
                    <button className="fn-btn-danger" style={{ padding: "8px 14px", fontSize: 10 }} onClick={() => removeTask.mutate(t.id)}>
                      Excluir
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="fn-empty" style={{ padding: "64px 20px" }}>
            <div>BACKLOG VAZIO</div>
            <div style={{ font: "400 13px 'Barlow',sans-serif", color: "var(--text-faint)", marginTop: 8, letterSpacing: "normal" }}>
              Crie a primeira tarefa para abrir sua fila de missões.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateTaskPanel({
  projects,
  onCreated,
}: {
  projects: Array<{ id: number; title: string }>;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      tasksApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
        dueDate: dueDate || undefined,
        projectId: projectId === "" ? undefined : projectId,
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
        <input className="fn-input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
      </label>
      <label className={`fn-field ${styles.full}`}>
        <span>DESCRIÇÃO</span>
        <textarea className="fn-textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
      </label>
      <label className="fn-field">
        <span>PRIORIDADE</span>
        <select className="fn-select" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
          <option value="LOW">LOW</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HIGH">HIGH</option>
        </select>
      </label>
      <label className="fn-field">
        <span>ESTIMATIVA (MIN)</span>
        <input className="fn-input" type="number" min={1} max={10080} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} />
      </label>
      <label className="fn-field">
        <span>PRAZO</span>
        <input className="fn-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      <label className="fn-field">
        <span>PROJETO</span>
        <select className="fn-select" value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">— sem projeto —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.createActions}>
        <button type="submit" className="fn-btn-primary" disabled={createMutation.isPending || !title.trim()}>
          {createMutation.isPending ? "Criando..." : "Criar tarefa"}
        </button>
      </div>
    </form>
  );
}
