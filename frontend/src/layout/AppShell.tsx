import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { analyticsApi } from "../api/analytics";
import { useAuth } from "../auth/AuthContext";
import { useClockTick, formatClock } from "../hooks/useClock";
import { computeElapsedSeconds, useCurrentFocusSession } from "../hooks/useFocusSession";
import { useTheme } from "../theme/ThemeContext";
import { addDaysIso, todayIso } from "../utils/date";
import { describeApiError } from "../utils/errors";
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
  const now = useClockTick(1000);
  const [logoutError, setLogoutError] = useState<string | null>(null);

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
              <div className={styles.logo}>FN</div>
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

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
