import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { focusSessionsApi } from "../api/focusSessions";
import { useAuth } from "../auth/AuthContext";
import { ParticleScene } from "../components/particles/ParticleScene";
import { useClockTick } from "../hooks/useClock";
import {
  applyFinishedFocusSession,
  computeElapsedSeconds,
  computeIdleSeconds,
  CURRENT_FOCUS_SESSION_KEY,
  FINISH_FOCUS_SESSION_MUTATION_KEY,
  formatDuration,
  useCurrentFocusSession,
  useLastCompletedFocusSession,
} from "../hooks/useFocusSession";
import { useTheme } from "../theme/ThemeContext";
import { describeApiError } from "../utils/errors";
import { setFocusFaviconState } from "../utils/focusFavicon";
import { playTimerAlarm } from "../utils/timerAlarm";
import { showTimerCompletionNotification } from "../utils/timerNotification";
import styles from "./AppShell.module.css";

const NAV: Array<[string, string]> = [
  ["hoje", "Hoje"],
  ["foco", "Foco"],
  ["checklist", "Checklist"],
  ["diario", "Diário"],
  ["analytics", "Analytics"],
];

export function AppShell() {
  const { theme } = useTheme();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const now = useClockTick(1000);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [completionNotice, setCompletionNotice] = useState(false);
  const [autoFinishError, setAutoFinishError] = useState<string | null>(null);
  const autoFinishedSessionId = useRef<number | null>(null);

  const currentSessionQuery = useCurrentFocusSession();
  const lastCompletedQuery = useLastCompletedFocusSession();

  const session = currentSessionQuery.data;
  const running = session?.status === "RUNNING";
  const paused = session?.status === "PAUSED";
  const liveState = running ? "running" : paused ? "paused" : "idle";
  const liveLabel = running ? "Em foco" : paused ? "Pausada" : "Ocioso";
  const activeNavIndex = NAV.findIndex(([id]) => pathname === `/${id}` || pathname.startsWith(`/${id}/`));
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
      await applyFinishedFocusSession(queryClient, data);
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

  const elapsedDisplay = formatDuration(
    session ? elapsedSeconds : computeIdleSeconds(lastCompletedQuery.data, now),
  );

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
      <ParticleScene>
        <div className={styles.frame}>
          <header className={styles.header}>
            <div className={styles.brand}>
              <span
                className={styles.logo}
                data-testid="brand-logo"
                data-shape="triangle"
                data-focus-state={logoFocusState}
                aria-hidden="true"
              >
                <span className={styles.logoFacet} />
              </span>
              <span className={styles.brandName}>Focus Nagi</span>
            </div>

            <nav
              className={styles.nav}
              aria-label="Principal"
              style={{ "--nav-index": Math.max(0, activeNavIndex) } as React.CSSProperties}
            >
              {NAV.map(([id, label]) => (
                <NavLink
                  key={id}
                  to={`/${id}`}
                  className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ""}`}
                >
                  {label}
                </NavLink>
              ))}
              {activeNavIndex >= 0 && <span className={styles.navDot} aria-hidden="true" />}
            </nav>

            <div className={styles.spacer} />

            <div className={styles.status}>
              <div className={styles.live}>
                <span className={styles.liveDot} data-state={liveState} aria-hidden="true" />
                <span className={styles.liveLabel}>{liveLabel}</span>
                <span
                  className={styles.liveValue}
                  role="timer"
                  aria-label={session ? "Tempo de foco" : "Tempo ocioso"}
                >
                  {elapsedDisplay}
                </span>
              </div>
              <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
                Sair
              </button>
            </div>
            {logoutError && <div className={styles.logoutError}>{logoutError}</div>}
          </header>

          {completionNotice && (
            <div className={styles.notice} role="alert">
              <span className={styles.noticeTag}>Concluída</span>
              <span className={styles.noticeText}>Sessão de foco concluída! Hora de fazer uma pausa.</span>
            </div>
          )}
          {autoFinishError && (
            <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
              <span className={styles.noticeTag}>Erro</span>
              <span className={styles.noticeText}>
                Não foi possível finalizar o timer automaticamente: {autoFinishError}. Abra Foco e tente finalizar
                novamente.
              </span>
            </div>
          )}

          <main className={styles.main}>
            <Outlet />
          </main>
        </div>
      </ParticleScene>
    </div>
  );
}
