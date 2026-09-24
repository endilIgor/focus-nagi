import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { analyticsApi } from "../api/analytics";
import { projectsApi } from "../api/projects";
import { tasksApi } from "../api/tasks";
import { todayApi } from "../api/today";
import { ProgressRing } from "../components/ProgressRing";
import { computeElapsedSeconds, useCurrentFocusSession } from "../hooks/useFocusSession";
import { formatMinutesAsHm, useClockTick } from "../hooks/useClock";
import { useTheme } from "../theme/ThemeContext";
import { addDaysIso, formatDateLong, todayIso } from "../utils/date";
import { describeApiError } from "../utils/errors";
import { ChecklistPanel } from "./ChecklistPage";
import styles from "./TodayPage.module.css";

export function TodayPage() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const now = useClockTick(1000);

  const todayQuery = useQuery({ queryKey: ["today"], queryFn: () => todayApi.get() });
  const sessionQuery = useCurrentFocusSession();
  const streaksQuery = useQuery({
    queryKey: ["analytics", "streaks"],
    queryFn: () => analyticsApi.streaks(),
    staleTime: 60_000,
  });
  const focusSparkQuery = useQuery({
    queryKey: ["analytics", "by-day", "spark12"],
    queryFn: () => analyticsApi.byDay(addDaysIso(todayIso(), -11), todayIso()),
    staleTime: 60_000,
  });

  const session = sessionQuery.data;
  const running = session?.status === "RUNNING";
  const paused = session?.status === "PAUSED";
  const active = running || paused;

  const sessionTaskQuery = useQuery({
    queryKey: ["task", session?.taskId],
    queryFn: () => tasksApi.get(session!.taskId!),
    enabled: !!session?.taskId,
  });
  const sessionProjectQuery = useQuery({
    queryKey: ["project", session?.projectId],
    queryFn: () => projectsApi.get(session!.projectId!),
    enabled: !!session?.projectId,
  });

  const today = todayQuery.data;
  const date = today?.date ?? todayIso();

  if (todayQuery.isLoading) {
    return <span className="fn-spinner" />;
  }
  if (todayQuery.isError || !today) {
    return <div className="fn-error-banner">{describeApiError(todayQuery.error)}</div>;
  }

  const elapsedSeconds = session ? computeElapsedSeconds(session, now) : 0;
  const plannedSeconds = (session?.plannedFocusMinutes ?? 0) * 60;
  const prog = plannedSeconds > 0 ? Math.min(1, elapsedSeconds / plannedSeconds) : 0;
  const remaining = Math.max(0, plannedSeconds - elapsedSeconds);
  const clockMin = Math.floor(remaining / 60);
  const clockSec = Math.floor(remaining % 60);
  const clockText = `${String(clockMin).padStart(2, "0")}:${String(clockSec).padStart(2, "0")}`;

  const sessionTitle = active
    ? (sessionTaskQuery.data?.title ?? (session?.taskId ? "…" : "Sessão livre"))
    : "Nenhuma sessão ativa";

  const focusSpark = focusSparkQuery.data ?? [];
  const focusSparkMax = Math.max(200, ...focusSpark.map((d) => d.focusedMinutes));

  return (
    <div>
      <div className={styles.headRow}>
        <div>
          <div className="fn-eyebrow">
            <span className="fn-eyebrow-bar" />
            <span className="fn-eyebrow-text">OPERAÇÃO DO DIA</span>
          </div>
          <h1 className="fn-h1" style={{ fontSize: 42 }}>Hoje</h1>
        </div>
        <div className={styles.dateBlock}>
          <div className={styles.today}>{formatDateLong(date)}</div>
          <div>TZ · SEMANA ISO · OWNER</div>
        </div>
      </div>

      <div className={styles.hero}>
        <div className="fn-corner-tl" />
        <div className="fn-corner-br" />
        <div className={styles.heroGlow} />

        <ProgressRing size={132} radius={68} strokeWidth={6} progress={prog} color={theme.acc} glow={theme.glow}>
          <div className={styles.miniClock}>{active ? clockText : "--:--"}</div>
          <div className={styles.miniSub}>{active ? "RESTANTE" : "PRONTO"}</div>
        </ProgressRing>

        <div style={{ minWidth: 0 }}>
          <div className={styles.sessionHead}>
            <span className="fn-mono-label">SESSÃO ATUAL</span>
            <span
              className={styles.sessionBadge}
              style={{
                borderColor: active ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.12)",
                color: active ? theme.acc2 : "#A5A0B8",
              }}
            >
              {active ? session!.status : "IDLE"}
            </span>
          </div>
          <div className={styles.sessionTitle}>{sessionTitle}</div>
          <div className={styles.factsRow}>
            {active ? (
              <>
                {(session?.projectId || session?.taskId) && <div>
                  <div className={styles.factLabel}>VÍNCULO ANTERIOR</div>
                  <div className={styles.factValue}>
                    {sessionProjectQuery.data?.title ?? sessionTaskQuery.data?.title ?? "—"}
                  </div>
                </div>}
                <div>
                  <div className={styles.factLabel}>PLANEJADO</div>
                  <div className={styles.factValue}>{session!.plannedFocusMinutes} min</div>
                </div>
                <div>
                  <div className={styles.factLabel}>PAUSAS</div>
                  <div className={styles.factValue}>{Math.floor(session!.pausedSecondsAccum / 60)} min</div>
                </div>
                <div>
                  <div className={styles.factLabel}>PROGRESSO</div>
                  <div className={styles.factValue}>{Math.round(prog * 100)}%</div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className={styles.factLabel}>REGRA</div>
                  <div className={styles.factValue}>1 SESSÃO ATIVA</div>
                </div>
                <div>
                  <div className={styles.factLabel}>FOCADO HOJE</div>
                  <div className={styles.factValue}>{formatMinutesAsHm(today.focusedMinutesToday)}</div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className={styles.heroActions}>
          <button className="fn-btn-primary" onClick={() => navigate("/foco")}>
            {active ? "Abrir câmara" : "Iniciar foco"}
          </button>
          <button className="fn-btn-ghost" onClick={() => navigate("/diario")}>
            Registrar no diário
          </button>
        </div>
      </div>

      <div className={styles.metrics}>
        <MetricCard
          label="FOCO HOJE"
          value={formatMinutesAsHm(today.focusedMinutesToday)}
          tint={theme.acc}
          hint="TOTAL DE MINUTOS FOCADOS HOJE"
          spark={focusSpark.map((d) => ({
            h: Math.round((d.focusedMinutes / focusSparkMax) * 100),
            on: d.focusedMinutes >= focusSparkMax * 0.8 ? theme.acc2 : d.focusedMinutes > 0 ? theme.acc : "rgba(255,255,255,.08)",
          }))}
        />
        <MetricCard label="SESSÕES" value={String(today.sessionsToday)} unit="hoje" tint={theme.acc2} hint="SESSÕES INICIADAS HOJE" />
        <MetricCard
          label="STREAK"
          value={String(streaksQuery.data?.currentStreak ?? 0)}
          unit="dias"
          tint="#F43F5E"
          hint={streaksQuery.data ? `MAIOR SEQUÊNCIA: ${streaksQuery.data.longestStreak} DIAS` : "—"}
        />
      </div>

      <h2 className={styles.missionsTitle}>Missões de hoje</h2>
      <ChecklistPanel date={date} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  tint,
  hint,
  spark,
}: {
  label: string;
  value: string;
  unit?: string;
  tint: string;
  hint: string;
  spark?: Array<{ h: number; on: string }>;
}) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricTint} style={{ background: tint, boxShadow: `0 0 12px ${tint}` }} />
      <div className={styles.metricHeadRow}>
        <span className={styles.metricLabel}>{label}</span>
      </div>
      <div className={styles.metricValueRow}>
        <span className={styles.metricValue}>{value}</span>
        {unit && <span className={styles.metricUnit}>{unit}</span>}
      </div>
      {spark && spark.length > 0 && (
        <div className={styles.metricSpark}>
          {spark.map((b, i) => (
            <div key={i} style={{ flex: 1, height: `${Math.max(2, b.h)}%`, minHeight: 2, background: b.on }} />
          ))}
        </div>
      )}
      <div style={{ marginTop: 9, font: "400 10px 'JetBrains Mono',monospace", color: "var(--text-faint)" }}>{hint}</div>
    </div>
  );
}
