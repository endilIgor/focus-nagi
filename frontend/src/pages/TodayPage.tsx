import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { analyticsApi } from "../api/analytics";
import { checklistApi } from "../api/checklist";
import { projectsApi } from "../api/projects";
import { tasksApi } from "../api/tasks";
import { todayApi } from "../api/today";
import { ParticleAnchor } from "../components/particles/ParticleScene";
import { computeElapsedSeconds, useCurrentFocusSession } from "../hooks/useFocusSession";
import { formatMinutesAsHm, useClockTick } from "../hooks/useClock";
import { addDaysIso, formatDateLong, todayIso } from "../utils/date";
import { describeApiError } from "../utils/errors";
import { ChecklistPanel } from "./ChecklistPage";
import styles from "./TodayPage.module.css";

function pad(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(2, "0");
}

export function TodayPage() {
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
  // Same key as ChecklistPanel, so the count and the list share one request.
  const missionsQuery = useQuery({
    queryKey: ["checklist", date],
    queryFn: () => checklistApi.byDate(date),
    enabled: !!today,
  });

  if (todayQuery.isLoading) {
    return <span className="fn-spinner" />;
  }
  if (todayQuery.isError || !today) {
    return <div className="fn-error-banner">{describeApiError(todayQuery.error)}</div>;
  }

  const elapsedSeconds = session ? computeElapsedSeconds(session, now) : 0;
  const plannedSeconds = (session?.plannedFocusMinutes ?? 0) * 60;
  const prog = plannedSeconds > 0 ? Math.min(1, elapsedSeconds / plannedSeconds) : 0;
  const pct = Math.round(prog * 100);
  const remaining = Math.max(0, plannedSeconds - elapsedSeconds);
  const clockText = `${pad(remaining / 60)}:${pad(remaining % 60)}`;
  const focusedToday = formatMinutesAsHm(today.focusedMinutesToday);

  const sessionTitle = sessionTaskQuery.data?.title ?? (session?.taskId ? "…" : "Sessão livre");
  const linkedTitle = sessionProjectQuery.data?.title ?? sessionTaskQuery.data?.title;

  const focusSpark = focusSparkQuery.data ?? [];
  const focusSparkMax = Math.max(200, ...focusSpark.map((d) => d.focusedMinutes));

  const missions = missionsQuery.data ?? [];
  const missionsDone = missions.filter((item) => item.completed).length;

  return (
    <div className={styles.page}>
      <section className={`fn-hero ${styles.hero}`}>
        <div className="fn-hero-copy">
          <div className="fn-eyebrow">
            <span className="fn-eyebrow-bar" aria-hidden="true" />
            <span className="fn-eyebrow-text">{formatDateLong(date)}</span>
          </div>
          <h1 className="fn-h1">Hoje.</h1>
          <p className={styles.heroBody}>
            {active ? (
              <>
                <strong className={styles.heroStrong}>{sessionTitle}</strong>{" "}
                {paused ? "pausada" : "em andamento"} — {pct}% concluída, {clockText} restantes. {focusedToday} focados
                hoje.
              </>
            ) : (
              <>
                <span className={styles.heroStrong}>Nenhuma sessão ativa</span>. {focusedToday} focados até agora — uma
                sessão por vez, sem ruído.
              </>
            )}
          </p>
          {active && (
            <dl className={styles.facts}>
              {linkedTitle && (
                <div>
                  <dt className="fn-label">VÍNCULO ANTERIOR</dt>
                  <dd>{linkedTitle}</dd>
                </div>
              )}
              <div>
                <dt className="fn-label">PLANEJADO</dt>
                <dd>{session!.plannedFocusMinutes} min</dd>
              </div>
              <div>
                <dt className="fn-label">PAUSAS</dt>
                <dd>{Math.floor(session!.pausedSecondsAccum / 60)} min</dd>
              </div>
            </dl>
          )}
          <div className={styles.heroActions}>
            <button type="button" className="fn-btn-primary" onClick={() => navigate("/foco")}>
              {active ? "Abrir câmara" : "Iniciar foco"}
            </button>
            <button type="button" className="fn-btn-ghost" onClick={() => navigate("/diario")}>
              Registrar no diário →
            </button>
          </div>
        </div>
        <ParticleAnchor
          className={styles.robot}
          shape="cloud"
          aria-hidden={active ? undefined : true}
        >
          {active && (
            <div className={styles.robotClock}>
              <div className={styles.robotTime}>{clockText}</div>
              <div className={`fn-label ${styles.robotSub}`}>Restante · {pct}%</div>
            </div>
          )}
        </ParticleAnchor>
      </section>

      <section className={styles.metrics} aria-label="Métricas de hoje">
        <MetricCard
          label="Foco hoje"
          value={focusedToday}
          hint="Total de minutos focados hoje"
          spark={focusSpark.map((d) => ({
            h: Math.max(6, Math.round((d.focusedMinutes / focusSparkMax) * 100)),
            tone: d.focusedMinutes >= focusSparkMax * 0.8 ? "peak" : d.focusedMinutes > 0 ? "on" : "off",
            title: `${d.date} · ${d.focusedMinutes} min`,
          }))}
        />
        <MetricCard label="Sessões" value={String(today.sessionsToday)} unit="hoje" hint="Sessões iniciadas hoje" />
        <MetricCard
          label="Streak"
          accent
          value={streaksQuery.data ? String(streaksQuery.data.currentStreak) : "…"}
          unit="dias"
          hint={streaksQuery.data ? `Maior sequência: ${streaksQuery.data.longestStreak} dias` : "—"}
        />
      </section>

      <section className={`fn-split ${styles.missions}`} aria-labelledby="today-missions-title">
        <div>
          <div className="fn-eyebrow">
            <span className="fn-eyebrow-bar" aria-hidden="true" />
            <span className="fn-eyebrow-text">
              {missionsQuery.isSuccess ? `${missionsDone} de ${missions.length} concluídas` : "…"}
            </span>
          </div>
          <h2 id="today-missions-title" className="fn-h2">
            Missões de hoje
          </h2>
          <p className="fn-lead">
            O que precisa sair hoje. Marque ao concluir — a checklist alimenta a avaliação semanal.
          </p>
        </div>
        <div>
          <ChecklistPanel date={date} />
          <button type="button" className={`fn-btn-ghost ${styles.openChecklist}`} onClick={() => navigate("/checklist")}>
            Abrir checklist →
          </button>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  hint,
  accent = false,
  spark,
}: {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  accent?: boolean;
  spark?: Array<{ h: number; tone: "peak" | "on" | "off"; title: string }>;
}) {
  return (
    <article className={`fn-glass ${styles.metricCard}`}>
      <div className={`fn-label ${accent ? styles.metricAccent : ""}`}>{label}</div>
      <div className={styles.metricValueRow}>
        <span className={styles.metricValue}>{value}</span>
        {unit && <span className={styles.metricUnit}>{unit}</span>}
      </div>
      {spark && spark.length > 0 && (
        <div className={styles.metricSpark} aria-hidden="true">
          {spark.map((b, i) => (
            <span
              key={i}
              title={b.title}
              className={styles.sparkBar}
              data-tone={b.tone}
              style={{ height: `${b.h}%`, animationDelay: `${300 + i * 40}ms` }}
            />
          ))}
        </div>
      )}
      <div className={styles.metricHint}>{hint}</div>
    </article>
  );
}
