import { useState } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { focusSessionsApi } from "../api/focusSessions";
import { fetchAllContent } from "../api/pagination";
import { projectsApi } from "../api/projects";
import { tasksApi } from "../api/tasks";
import {
  computeElapsedSeconds,
  CURRENT_FOCUS_SESSION_KEY,
  FINISH_FOCUS_SESSION_MUTATION_KEY,
  useCurrentFocusSession,
} from "../hooks/useFocusSession";
import { useClockTick } from "../hooks/useClock";
import { useTheme } from "../theme/ThemeContext";
import { describeApiError } from "../utils/errors";
import { FOCUS_SESSION_STATUS_LABEL } from "../utils/labels";
import { primeTimerAlarm } from "../utils/timerAlarm";
import { requestTimerNotificationPermission } from "../utils/timerNotification";
import type { FocusSessionResponse } from "../api/types";
import styles from "./FocusPage.module.css";

const PRESETS = [25, 50, 60, 90, 15];
const STATUS_STYLE: Record<string, [string, string]> = {
  RUNNING: ["rgba(255,255,255,.2)", "#22D3EE"],
  COMPLETED: ["rgba(255,255,255,.14)", "#C9C3DA"],
  CANCELLED: ["rgba(244,63,94,.4)", "#FF8098"],
  PAUSED: ["rgba(245,200,107,.4)", "#F7CE7E"],
};

function pad(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(2, "0");
}

export function FocusPage() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const now = useClockTick(1000);
  const [plannedMinutes, setPlannedMinutes] = useState(50);
  const [taskId, setTaskId] = useState<number | "">("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(0);

  const sessionQuery = useCurrentFocusSession();
  const globalFinishPending = useIsMutating({ mutationKey: FINISH_FOCUS_SESSION_MUTATION_KEY }) > 0;
  const session = sessionQuery.data;
  const active = session?.status === "RUNNING" || session?.status === "PAUSED";

  const tasksQuery = useQuery({
    queryKey: ["tasks", "for-session-select"],
    queryFn: () => fetchAllContent((page, size) => tasksApi.list({ page, size })),
    enabled: !active,
  });
  const projectsQuery = useQuery({
    queryKey: ["projects", "active-for-select"],
    queryFn: () => fetchAllContent((page, size) => projectsApi.list("ACTIVE", page, size)),
    enabled: !active,
  });
  const linkedTaskQuery = useQuery({
    queryKey: ["task", session?.taskId],
    queryFn: () => tasksApi.get(session!.taskId!),
    enabled: !!session?.taskId,
  });
  const linkedProjectQuery = useQuery({
    queryKey: ["project", session?.projectId],
    queryFn: () => projectsApi.get(session!.projectId!),
    enabled: !!session?.projectId,
  });
  const historyQuery = useQuery({
    queryKey: ["focus-sessions", "history", historyPage],
    queryFn: () => focusSessionsApi.list({ page: historyPage, size: 8 }),
  });

  const setCurrentSession = (next: FocusSessionResponse | null) => {
    queryClient.setQueryData(CURRENT_FOCUS_SESSION_KEY, next);
  };

  const invalidateAfterAction = () => {
    queryClient.invalidateQueries({ queryKey: ["focus-sessions", "history"] });
    queryClient.invalidateQueries({ queryKey: ["today"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };

  const startMutation = useMutation({
    mutationFn: () =>
      focusSessionsApi.start({
        plannedFocusMinutes: plannedMinutes,
        taskId: taskId === "" ? null : taskId,
        projectId: projectId === "" ? null : projectId,
        notes: notes.trim() ? notes.trim() : null,
      }),
    onMutate: () => queryClient.cancelQueries({ queryKey: CURRENT_FOCUS_SESSION_KEY }),
    onSuccess: async (data) => {
      await queryClient.cancelQueries({ queryKey: CURRENT_FOCUS_SESSION_KEY });
      setActionError(null);
      setCurrentSession(data);
      invalidateAfterAction();
    },
    onError: (err) => setActionError(describeApiError(err)),
  });

  function useSessionAction(
    fn: (id: number) => Promise<FocusSessionResponse>,
    clearsSession = false,
  ) {
    return useMutation({
      mutationFn: () => fn(session!.id),
      onMutate: () => queryClient.cancelQueries({ queryKey: CURRENT_FOCUS_SESSION_KEY }),
      onSuccess: async (data) => {
        await queryClient.cancelQueries({ queryKey: CURRENT_FOCUS_SESSION_KEY });
        setActionError(null);
        setCurrentSession(clearsSession ? null : data);
        invalidateAfterAction();
      },
      onError: (err: unknown) => setActionError(describeApiError(err)),
    });
  }

  const pauseMutation = useSessionAction(focusSessionsApi.pause);
  const resumeMutation = useSessionAction(focusSessionsApi.resume);
  const finishMutation = useSessionAction(focusSessionsApi.finish, true);
  const cancelMutation = useSessionAction(focusSessionsApi.cancel, true);
  const sessionActionPending =
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    finishMutation.isPending ||
    cancelMutation.isPending;

  const elapsedSeconds = session ? computeElapsedSeconds(session, now) : 0;
  const plannedSecondsActive = (session?.plannedFocusMinutes ?? plannedMinutes) * 60;
  const remaining = Math.max(0, plannedSecondsActive - elapsedSeconds);
  const prog = Math.min(1, elapsedSeconds / Math.max(1, plannedSecondsActive));
  const clockText = `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;
  const timerCompletionPending = session?.status === "RUNNING" && remaining === 0 && globalFinishPending;

  const statusLabel = session?.status === "RUNNING" ? "EM EXECUÇÃO" : session?.status === "PAUSED" ? "PAUSADA" : "PRONTA";
  const circumference = 2 * Math.PI * 150;

  const taskOptions = (tasksQuery.data ?? []).filter((t) => t.status === "TODO" || t.status === "IN_PROGRESS");
  const projectOptions = projectsQuery.data ?? [];

  return (
    <div className={styles.grid}>
      <div className={styles.chamber}>
        <div className={styles.chamberInset} />
        <div className={styles.chamberHead}>
          <div>
            <span className="fn-eyebrow-text">// CÂMARA DE FOCO</span>
            <div className={styles.chamberStatus}>{statusLabel}</div>
          </div>
          <div className={styles.chamberMeta}>
            <div>PLANEJADO {session?.plannedFocusMinutes ?? plannedMinutes}min</div>
            <div>PAUSAS {Math.floor((session?.pausedSecondsAccum ?? 0) / 60)}min</div>
          </div>
        </div>

        <div className={styles.ringWrap}>
          <svg viewBox="0 0 340 340" style={{ width: 344, height: 344, transform: "rotate(-90deg)" }}>
            <circle cx="170" cy="170" r="150" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="10" />
            <circle
              cx="170"
              cy="170"
              r="150"
              fill="none"
              stroke={theme.acc}
              strokeWidth="10"
              strokeDasharray={`${circumference * (active ? prog : 0)} ${circumference}`}
              style={{ filter: `drop-shadow(0 0 14px ${theme.glow})`, transition: "stroke-dasharray .9s linear" }}
            />
            <circle cx="170" cy="170" r="132" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="1" strokeDasharray="2 7" />
            <circle cx="170" cy="170" r="163" fill="none" stroke="rgba(255,255,255,.04)" strokeWidth="1" />
          </svg>
          <div style={{ position: "absolute", textAlign: "center" }}>
            <div className={styles.clockText}>{active ? clockText : `${pad(plannedMinutes)}:00`}</div>
            <div className={styles.clockSub}>
              {active ? (remaining === 0 ? "FINALIZANDO..." : `RESTANTE · ${Math.round(prog * 100)}% CONCLUÍDO`) : "SELECIONE UM BLOCO E INICIE"}
            </div>
            <div className={styles.ticks}>
              {Array.from({ length: 16 }, (_, i) => (
                <span
                  key={i}
                  className={styles.tick}
                  style={{ background: active && i < Math.round(prog * 16) ? theme.acc2 : "rgba(255,255,255,.12)" }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p}
              className="fn-chip"
              disabled={active}
              onClick={() => setPlannedMinutes(p)}
              style={
                plannedMinutes === p
                  ? { background: theme.glow, borderColor: theme.acc, color: "#F7F5FC" }
                  : undefined
              }
            >
              {p} MIN
            </button>
          ))}
        </div>

        {actionError && <div className="fn-error-banner">{actionError}</div>}

        <div className={styles.actions}>
          {!active && (
            <button
              className={styles.actionBtn}
              style={{ flex: 1, background: theme.acc, borderColor: theme.acc, color: "#07070C" }}
              disabled={startMutation.isPending}
              onClick={() => {
                primeTimerAlarm();
                void requestTimerNotificationPermission();
                startMutation.mutate();
              }}
            >
              {startMutation.isPending ? "Iniciando..." : "Iniciar sessão"}
            </button>
          )}
          {session?.status === "PAUSED" && (
            <button
              className={styles.actionBtn}
              style={{ flex: 1, background: theme.acc, borderColor: theme.acc, color: "#07070C" }}
              disabled={sessionActionPending || timerCompletionPending}
              onClick={() => {
                primeTimerAlarm();
                void requestTimerNotificationPermission();
                resumeMutation.mutate();
              }}
            >
              Retomar
            </button>
          )}
          {session?.status === "RUNNING" && (
            <button
              className={styles.actionBtn}
              style={{ flex: 1, background: "transparent", borderColor: "rgba(255,255,255,.16)", color: "#E4E0EF" }}
              disabled={sessionActionPending || timerCompletionPending}
              onClick={() => pauseMutation.mutate()}
            >
              Pausar
            </button>
          )}
          {active && (
            <button
              className={styles.actionBtn}
              style={
                session?.status === "PAUSED"
                  ? { flex: 1, background: "transparent", borderColor: "rgba(255,255,255,.16)", color: "#E4E0EF" }
                  : { flex: 1, background: theme.acc, borderColor: theme.acc, color: "#07070C" }
              }
              disabled={sessionActionPending || timerCompletionPending}
              onClick={() => finishMutation.mutate()}
            >
              Finalizar
            </button>
          )}
          {active && (
            <button
              className={styles.actionBtn}
              style={{ flex: "0 0 auto", background: "transparent", borderColor: "rgba(244,63,94,.4)", color: "#FF8098" }}
              disabled={sessionActionPending || timerCompletionPending}
              onClick={() => cancelMutation.mutate()}
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      <div className={styles.side}>
        <div className={styles.linkPanel}>
          <div className={styles.linkTitle}>Vincular</div>
          {active ? (
            <>
              <div className="fn-field">
                <span>TAREFA</span>
                <div style={{ font: "400 13px 'JetBrains Mono',monospace", color: "#D8D4E6" }}>
                  {linkedTaskQuery.data?.title ?? "— nenhuma —"}
                </div>
              </div>
              <div className="fn-field" style={{ marginTop: 12 }}>
                <span>PROJETO</span>
                <div style={{ font: "400 13px 'JetBrains Mono',monospace", color: "#D8D4E6" }}>
                  {linkedProjectQuery.data?.title ?? "— nenhum —"}
                </div>
              </div>
              <div className="fn-field" style={{ marginTop: 12 }}>
                <span>NOTAS DA SESSÃO</span>
                <div style={{ font: "400 13px 'Barlow',sans-serif", color: "#B9B4C9" }}>
                  {session?.notes || "—"}
                </div>
              </div>
              <div className={styles.linkNote}>
                Vínculo e notas são definidos ao iniciar a sessão e não podem ser alterados enquanto ela está ativa.
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label className="fn-field">
                <span>TAREFA</span>
                <select
                  className="fn-select"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">— sem tarefa —</option>
                  {taskOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.id} {t.title.slice(0, 36)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fn-field">
                <span>PROJETO</span>
                <select
                  className="fn-select"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">— sem projeto —</option>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fn-field">
                <span>NOTAS DA SESSÃO</span>
                <textarea
                  className="fn-textarea"
                  rows={3}
                  placeholder="o que precisa sair daqui..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        <div className={styles.historyPanel}>
          <div className={styles.historyHead}>
            <div className={styles.linkTitle} style={{ margin: 0 }}>Histórico</div>
            <div className="fn-mono-label">
              {historyQuery.data ? `${historyQuery.data.totalElements} SESSÕES · PÁG ${historyPage + 1}/${Math.max(1, historyQuery.data.totalPages)}` : "…"}
            </div>
          </div>
          {(historyQuery.data?.content ?? []).map((h) => {
            const st = STATUS_STYLE[h.status] ?? STATUS_STYLE.COMPLETED;
            const minutes = h.actualFocusSeconds != null ? Math.round(h.actualFocusSeconds / 60) : h.plannedFocusMinutes;
            return (
              <div key={h.id} className={styles.historyRow}>
                <span className={styles.historyWhen}>{new Date(h.startedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <span className={styles.historyTitle}>{h.taskId ? `Tarefa #${h.taskId}` : h.projectId ? `Projeto #${h.projectId}` : "Sessão livre"}</span>
                <span className={styles.historyMinutes}>{minutes}min</span>
                <span className={styles.historyStatus} style={{ borderColor: st[0], color: st[1] }}>{FOCUS_SESSION_STATUS_LABEL[h.status]}</span>
              </div>
            );
          })}
          {historyQuery.data?.empty && <div className="fn-empty">SEM SESSÕES REGISTRADAS</div>}
          {historyQuery.data && historyQuery.data.totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 20px" }}>
              <button className="fn-btn-ghost" style={{ padding: "6px 12px", fontSize: 10 }} disabled={historyQuery.data.first} onClick={() => setHistoryPage((p) => p - 1)}>
                ANTERIOR
              </button>
              <button className="fn-btn-ghost" style={{ padding: "6px 12px", fontSize: 10 }} disabled={historyQuery.data.last} onClick={() => setHistoryPage((p) => p + 1)}>
                PRÓXIMA
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
