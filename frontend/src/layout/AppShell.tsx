import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { analyticsApi } from "../api/analytics";
import { focusSessionsApi } from "../api/focusSessions";
import { useAuth } from "../auth/AuthContext";
import { useClockTick, formatClock } from "../hooks/useClock";
import {
  computeElapsedSeconds,
  CURRENT_FOCUS_SESSION_KEY,
  FINISH_FOCUS_SESSION_MUTATION_KEY,
  useCurrentFocusSession,
} from "../hooks/useFocusSession";
import { useTheme } from "../theme/ThemeContext";
import { addDaysIso, todayIso } from "../utils/date";
import { describeApiError } from "../utils/errors";
import { setFocusFaviconState } from "../utils/focusFavicon";
import { playTimerAlarm } from "../utils/timerAlarm";
import { showTimerCompletionNotification } from "../utils/timerNotification";
import styles from "./AppShell.module.css";

const NAV: Array<[string, string]> = [
  ["hoje", "Hoje"],
  ["foco", "Foco"],
  ["tarefas", "Tarefas"],
  ["projetos", "Projetos"],
  ["metas", "Metas"],
  ["notas", "Notas"],
  ["diario", "Diário"],
  ["analytics", "Analytics"],
];

export function AppShell() {
  const { theme } = useTheme();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const now = useClockTick(1000);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [completionNotice, setCompletionNotice] = useState(false);
  const [autoFinishError, setAutoFinishError] = useState<string | null>(null);
  const autoFinishedSessionId = useRef<number | null>(null);

  const currentSessionQuery = useCurrentFocusSession();
  const streaksQuery = useQuery({
    queryKey: ["analytics", "streaks"],
    queryFn: () => analyticsApi.streaks(),
    staleTime: 60_000,
  });
  const sparkQuery = useQuery({
    queryKey: ["analytics", "by-day", "spark7"],
    queryFn: () => analyticsApi.byDay(addDaysIso(todayIso(), -6), todayIso()),
    staleTime: 60_000,
  });

  const session = currentSessionQuery.data;
  const running = session?.status === "RUNNING";
  const paused = session?.status === "PAUSED";
  const liveLabel = running ? "EM FOCO" : paused ? "PAUSADA" : "OCIOSO";
  const logoFocusState = completionNotice ? "completed" : session ? "focusing" : "idle";
  const elapsedSeconds = session ? computeElapsedSeconds(session, now) : 0;
  const remainingSeconds = session
    ? Math.max(0, session.plannedFocusMinutes * 60 - elapsedSeconds)
    : null;

  const finishMutation = useMutation({
    mutationKey: FINISH_FOCUS_SESSION_MUTATION_KEY,
    mutationFn: (sessionId: number) => focusSessionsApi.finish(sessionId),
    onMutate: () => {
      setAutoFinishError(null);
      return queryClient.cancelQueries({ queryKey: CURRENT_FOCUS_SESSION_KEY });
    },
    onSuccess: async (data) => {
      await queryClient.cancelQueries({ queryKey: CURRENT_FOCUS_SESSION_KEY });
      queryClient.setQueryData(CURRENT_FOCUS_SESSION_KEY, null);
      void queryClient.invalidateQueries({ queryKey: ["focus-sessions", "history"] });
      void queryClient.invalidateQueries({ queryKey: ["today"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
      if (autoFinishedSessionId.current === data.id) {
        setCompletionNotice(true);
        showTimerCompletionNotification();
        void playTimerAlarm().catch(() => undefined);
      }
    },
    onError: (error) => setAutoFinishError(describeApiError(error)),
  });
  const finishSession = finishMutation.mutate;

  useEffect(() => {
    setFocusFaviconState(logoFocusState);
  }, [logoFocusState]);

  useEffect(
    () => () => {
      setFocusFaviconState("idle");
    },
    [],
  );

  useEffect(() => {
    if (
      session?.status === "RUNNING" &&
      remainingSeconds === 0 &&
      autoFinishedSessionId.current !== session.id &&
      !finishMutation.isPending
    ) {
      autoFinishedSessionId.current = session.id;
      finishSession(session.id);
    }
  }, [session?.id, session?.status, remainingSeconds, finishMutation.isPending, finishSession]);

  useEffect(() => {
    if (session && remainingSeconds !== null && remainingSeconds > 0) {
      setCompletionNotice(false);
      setAutoFinishError(null);
    }
  }, [session?.id, remainingSeconds]);

  const elapsedDisplay = session
    ? (() => {
        const secs = computeElapsedSeconds(session, now);
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        const pad = (n: number) => String(n).padStart(2, "0");
        return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
      })()
    : formatClock(new Date(now));

  const spark = sparkQuery.data ?? [];
  const sparkMax = Math.max(1, ...spark.map((d) => d.focusedMinutes));

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(describeApiError(error));
    }
  };

  return (
    <div
      className="fn-root"
      style={
        {
          "--acc": theme.acc,
          "--acc2": theme.acc2,
          "--glow": theme.glow,
          "--soft": theme.soft,
        } as React.CSSProperties
      }
    >
      <div className="fn-grid-bg" />
      <div className="fn-hatch-bg" />

      <div style={{ position: "relative" }}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.brand}>
              <div className={styles.logo} data-focus-state={logoFocusState}>
                FN
              </div>
              <div className={styles.brandTitle}>
                FOCUS<span>//</span>NAGI
              </div>
            </div>

            <div className={styles.pill}>
              <span
                className={styles.dot}
                style={{ background: running || paused ? theme.acc2 : "rgba(255,255,255,.3)" }}
              />
              <span className={styles.pillLabel}>{liveLabel}</span>
              <span className={styles.pillValue}>{elapsedDisplay}</span>
            </div>

            <div className={styles.spacer} />

            <div className={styles.streak}>
              <span className={styles.streakLabel}>STREAK</span>
              <span className={styles.streakValue}>{streaksQuery.data?.currentStreak ?? 0}d</span>
              <div className={styles.spark}>
                {spark.map((d, i) => (
                  <span
                    key={i}
                    className={styles.sparkBar}
                    style={{
                      height: `${Math.max(8, Math.round((d.focusedMinutes / sparkMax) * 100))}%`,
                      background:
                        d.focusedMinutes >= sparkMax * 0.8
                          ? theme.acc2
                          : d.focusedMinutes > 0
                            ? theme.acc
                            : "rgba(255,255,255,.14)",
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
                SAIR
              </button>
              {logoutError && <div className={styles.logoutError}>{logoutError}</div>}
            </div>
          </div>

          <nav className={styles.nav}>
            {NAV.map(([id, label]) => (
              <NavLink
                key={id}
                to={`/${id}`}
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ""}`}
              >
                {label}
                <span className={styles.navLine} />
              </NavLink>
            ))}
          </nav>
        </header>

        {completionNotice && (
          <div className={styles.completionNotice} role="alert">
            Sessão de foco concluída! Hora de fazer uma pausa.
          </div>
        )}
        {autoFinishError && (
          <div className={styles.autoFinishError} role="alert">
            Não foi possível finalizar o timer automaticamente: {autoFinishError}. Abra Foco e tente finalizar novamente.
          </div>
        )}

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
