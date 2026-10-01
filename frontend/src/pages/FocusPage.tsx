import { useState } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { focusSessionsApi } from "../api/focusSessions";
import { projectsApi } from "../api/projects";
import { tasksApi } from "../api/tasks";
import { FocusDurationMenu } from "../components/FocusDurationMenu";
import { ParticleAnchor } from "../components/particles/ParticleScene";
import {
  applyFinishedFocusSession,
  computeElapsedSeconds,
  CURRENT_FOCUS_SESSION_KEY,
  FINISH_FOCUS_SESSION_MUTATION_KEY,
  useCurrentFocusSession,
} from "../hooks/useFocusSession";
import { useClockTick } from "../hooks/useClock";
import { describeApiError } from "../utils/errors";
import { FOCUS_SESSION_STATUS_LABEL } from "../utils/labels";
import { primeTimerAlarm } from "../utils/timerAlarm";
import { requestTimerNotificationPermission } from "../utils/timerNotification";
import type { FocusSessionResponse } from "../api/types";
import styles from "./FocusPage.module.css";

function pad(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(2, "0");
}

export function FocusPage() {
  const queryClient = useQueryClient();
  const now = useClockTick(1000);
  const [plannedMinutes, setPlannedMinutes] = useState(50);
  const [notes, setNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(0);

  const sessionQuery = useCurrentFocusSession();
  const globalFinishPending = useIsMutating({ mutationKey: FINISH_FOCUS_SESSION_MUTATION_KEY }) > 0;
  const session = sessionQuery.data;
  const running = session?.status === "RUNNING";
  const paused = session?.status === "PAUSED";
  const active = running || paused;
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
        taskId: null,
        projectId: null,
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
    applyResult: (data: FocusSessionResponse) => void | Promise<void> = setCurrentSession,
  ) {
    return useMutation({
      mutationFn: () => fn(session!.id),
      onMutate: () => queryClient.cancelQueries({ queryKey: CURRENT_FOCUS_SESSION_KEY }),
      onSuccess: async (data) => {
        await queryClient.cancelQueries({ queryKey: CURRENT_FOCUS_SESSION_KEY });
        setActionError(null);
        await applyResult(data);
        invalidateAfterAction();
      },
      onError: (err: unknown) => setActionError(describeApiError(err)),
    });
  }

  const pauseMutation = useSessionAction(focusSessionsApi.pause);
  const resumeMutation = useSessionAction(focusSessionsApi.resume);
  // Finish moves the idle base to this session's endedAt; cancel never does.
  const finishMutation = useSessionAction(focusSessionsApi.finish, (data) =>
    applyFinishedFocusSession(queryClient, data),
  );
  const cancelMutation = useSessionAction(focusSessionsApi.cancel, () => setCurrentSession(null));
  const sessionActionPending =
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    finishMutation.isPending ||
    cancelMutation.isPending;

  const elapsedSeconds = session ? computeElapsedSeconds(session, now) : 0;
  const plannedSecondsActive = (session?.plannedFocusMinutes ?? plannedMinutes) * 60;
  const remaining = Math.max(0, plannedSecondsActive - elapsedSeconds);
  const prog = Math.min(1, elapsedSeconds / Math.max(1, plannedSecondsActive));
  const pct = Math.round(prog * 100);
  const clockText = `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;
  const timerCompletionPending = running && remaining === 0 && globalFinishPending;
  const actionsDisabled = sessionActionPending || timerCompletionPending;

  const liveState = running ? "running" : paused ? "paused" : "idle";
  const statusTitle = running ? "Em execução." : paused ? "Pausada." : "Pronta.";
  const history = historyQuery.data;

  return (
    <div className={styles.page}>
      <section className={`fn-hero ${styles.chamber}`}>
        <ParticleAnchor className={styles.ring} shape="ring" progress={active ? prog : 0} running={running}>
          <div className={styles.clock}>
            <div className={styles.clockText}>{active ? clockText : `${pad(plannedMinutes)}:00`}</div>
            <div className={`fn-label ${styles.clockSub}`}>
              {active
                ? remaining === 0
                  ? "Finalizando..."
                  : `Restante · ${pct}% concluído`
                : "Selecione um bloco e inicie"}
            </div>
          </div>
        </ParticleAnchor>

        <div className="fn-hero-copy">
          <div className="fn-eyebrow">
            <span className={styles.liveDot} data-state={liveState} aria-hidden="true" />
            <span className="fn-eyebrow-text">Câmara de foco</span>
          </div>
          <h1 className={`fn-h1 ${styles.status}`}>{statusTitle}</h1>
          <p className={styles.meta}>
            Planejado {session?.plannedFocusMinutes ?? plannedMinutes} min · pausas{" "}
            {Math.floor((session?.pausedSecondsAccum ?? 0) / 60)} min
          </p>

          <div className={styles.duration}>
            <FocusDurationMenu
              value={session?.plannedFocusMinutes ?? plannedMinutes}
              onChange={setPlannedMinutes}
              disabled={active || startMutation.isPending}
            />
          </div>

          {active ? (
            <div className={styles.sessionInfo}>
              {(session?.taskId || session?.projectId) && (
                <dl className={styles.links}>
                  {session?.taskId && (
                    <div>
                      <dt className="fn-label">Tarefa anterior</dt>
                      <dd>{linkedTaskQuery.data?.title ?? `#${session.taskId}`}</dd>
                    </div>
                  )}
                  {session?.projectId && (
                    <div>
                      <dt className="fn-label">Projeto anterior</dt>
                      <dd>{linkedProjectQuery.data?.title ?? `#${session.projectId}`}</dd>
                    </div>
                  )}
                </dl>
              )}
              <div className="fn-label">Notas da sessão</div>
              <div className={styles.sessionNotes}>{session?.notes || "—"}</div>
              <div className={styles.notesHint}>
                As notas são definidas ao iniciar a sessão e não podem ser alteradas enquanto ela está ativa.
              </div>
            </div>
          ) : (
            <label className={styles.notesField}>
              <span className="fn-label">Notas da sessão</span>
              <textarea
                className={`fn-underline ${styles.notesInput}`}
                rows={2}
                placeholder="o que precisa sair daqui..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          )}

          {actionError && (
            <div className={`fn-error-banner ${styles.error}`} role="alert">
              {actionError}
            </div>
          )}

          <div className={styles.actions}>
            {!active && (
              <button
                type="button"
                className="fn-btn-primary"
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
            {paused && (
              <button
                type="button"
                className="fn-btn-primary"
                disabled={actionsDisabled}
                onClick={() => {
                  primeTimerAlarm();
                  void requestTimerNotificationPermission();
                  resumeMutation.mutate();
                }}
              >
                Retomar
              </button>
            )}
            {running && (
              <button
                type="button"
                className="fn-btn-primary"
                disabled={actionsDisabled}
                onClick={() => pauseMutation.mutate()}
              >
                Pausar
              </button>
            )}
            {active && (
              <button
                type="button"
                className="fn-btn-text"
                disabled={actionsDisabled}
                onClick={() => finishMutation.mutate()}
              >
                Finalizar
              </button>
            )}
            {active && (
              <button
                type="button"
                className={`fn-btn-text ${styles.cancel}`}
                disabled={actionsDisabled}
                onClick={() => cancelMutation.mutate()}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </section>

      <section className={`fn-split ${styles.history}`} aria-labelledby="focus-history-title">
        <div>
          <div className="fn-eyebrow">
            <span className="fn-eyebrow-bar" aria-hidden="true" />
            <span className="fn-eyebrow-text">{history ? `${history.totalElements} sessões` : "…"}</span>
          </div>
          <h2 id="focus-history-title" className="fn-h2">
            Histórico
          </h2>
        </div>
        <div className={styles.historyList}>
          {historyQuery.isError && (
            <div className="fn-error-banner" role="alert">
              {describeApiError(historyQuery.error)}
            </div>
          )}
          <ol className={styles.rows}>
            {(history?.content ?? []).map((h) => {
              const minutes = h.actualFocusSeconds != null ? Math.round(h.actualFocusSeconds / 60) : h.plannedFocusMinutes;
              return (
                <li key={h.id} className={styles.row}>
                  <span className={styles.when}>
                    {new Date(h.startedAt).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className={styles.title}>
                    {h.taskId ? `Tarefa #${h.taskId}` : h.projectId ? `Projeto #${h.projectId}` : "Sessão livre"}
                  </span>
                  <span className={styles.minutes}>{minutes} min</span>
                  <span className={styles.statusTag} data-status={h.status}>
                    {FOCUS_SESSION_STATUS_LABEL[h.status]}
                  </span>
                </li>
              );
            })}
          </ol>
          {history?.empty && <p className="fn-empty">Sem sessões registradas.</p>}
          {history && history.totalPages > 1 && (
            <div className="fn-pager">
              <button
                type="button"
                className="fn-btn-ghost"
                disabled={history.first}
                onClick={() => setHistoryPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span className="fn-mono-label">
                Página {historyPage + 1} de {history.totalPages}
              </span>
              <button
                type="button"
                className="fn-btn-ghost"
                disabled={history.last}
                onClick={() => setHistoryPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
