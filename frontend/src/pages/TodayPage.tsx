import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { analyticsApi } from "../api/analytics";
import { projectsApi } from "../api/projects";
import { tasksApi } from "../api/tasks";
import { todayApi } from "../api/today";
import { Cells } from "../components/Cells";
import { ProgressRing } from "../components/ProgressRing";
import { computeElapsedSeconds, useCurrentFocusSession } from "../hooks/useFocusSession";
import { formatMinutesAsHm, useClockTick } from "../hooks/useClock";
import { useTheme } from "../theme/ThemeContext";
import { getTints } from "../theme/themes";
import { addDaysIso, formatDateLong, todayIso } from "../utils/date";
import { describeApiError } from "../utils/errors";
import { daysUntil, priorityStyle } from "../utils/taskDisplay";
import styles from "./TodayPage.module.css";

export function TodayPage() {
  const { theme } = useTheme();
  const tints = getTints(theme);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const activeProjects = today?.activeProjects ?? [];
  const projectFocusQueries = useQueries({
    queries: activeProjects.map((p) => ({
      queryKey: ["project-focus", p.id],
      queryFn: () => projectsApi.focus(p.id),
      staleTime: 30_000,
    })),
  });

  const completeMutation = async (id: number) => {
    try {
      await tasksApi.complete(id);
      await queryClient.invalidateQueries({ queryKey: ["today"] });
    } catch (err) {
      window.alert(describeApiError(err));
    }
  };

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

  const dueTasks = today.tasksDueToday;
  const overdueTasks = today.overdueTasks;

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
          <div className={styles.today}>{formatDateLong(today.date)}</div>
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
                <div>
                  <div className={styles.factLabel}>PROJETO</div>
                  <div className={styles.factValue}>
                    {sessionProjectQuery.data?.title ?? sessionTaskQuery.data?.title ?? "—"}
                  </div>
                </div>
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
        <MetricCard label="TAREFAS FEITAS" value={String(today.tasksCompletedToday)} unit="hoje" tint={tints[2]} hint="CONCLUÍDAS HOJE" />
        <MetricCard
          label="STREAK"
          value={String(streaksQuery.data?.currentStreak ?? 0)}
          unit="dias"
          tint="#F43F5E"
          hint={streaksQuery.data ? `MAIOR SEQUÊNCIA: ${streaksQuery.data.longestStreak} DIAS` : "—"}
        />
      </div>

      <div className={styles.content}>
        <div className={styles.col}>
          <div className="fn-panel">
            <div className={styles.panelHead}>
              <span className={styles.panelHeadBar} />
              <div className={styles.panelTitle}>Missões de hoje</div>
              <div style={{ flex: 1 }} />
              <div className={styles.panelCount}>{dueTasks.length} NO PRAZO DE HOJE</div>
            </div>
            {dueTasks.map((t) => {
              const prio = priorityStyle(t.priority);
              return (
                <div key={t.id} className={styles.taskRow}>
                  <button className={styles.checkbox} onClick={() => completeMutation(t.id)} title="Concluir" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.taskTitle}>{t.title}</div>
                    <div className={styles.taskMeta}>PRAZO HOJE</div>
                  </div>
                  <span className={styles.prioBadge} style={{ borderColor: prio.border, color: prio.color }}>
                    {t.priority}
                  </span>
                </div>
              );
            })}
            {dueTasks.length === 0 && <div className="fn-empty">NENHUMA TAREFA COM PRAZO HOJE</div>}
          </div>

          <div className={styles.overduePanel}>
            <div className={styles.overdueHead}>
              <span className={styles.overdueDot} />
              <div className={styles.panelTitle} style={{ color: "#FF8098" }}>Atrasadas</div>
              <div style={{ flex: 1 }} />
              <div className={styles.panelCount} style={{ color: "#C58E9C" }}>{overdueTasks.length} ITENS</div>
            </div>
            {overdueTasks.map((t) => (
              <div key={t.id} className={styles.overdueRow}>
                <span className={styles.lateLabel}>
                  {t.dueDate ? `${Math.abs(daysUntil(t.dueDate, today.date))}d atrás` : "—"}
                </span>
                <div style={{ flex: 1, font: "500 14px 'Barlow',sans-serif" }}>{t.title}</div>
                <button className="fn-btn-ghost" style={{ padding: "6px 12px", fontSize: 10 }} onClick={() => completeMutation(t.id)}>
                  Concluir
                </button>
              </div>
            ))}
            {overdueTasks.length === 0 && (
              <div className="fn-empty" style={{ padding: "22px 20px" }}>ZERO DÉBITO PENDENTE</div>
            )}
          </div>
        </div>

        <div className={styles.col}>
          <div className={styles.sidePanel}>
            <div className={styles.sideHead}>
              <span className={styles.sideHeadBar} />
              <div className={styles.sideTitle}>Metas ativas</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {today.goals.map((g, i) => {
                const pct = g.targetValue > 0 ? Math.min(100, Math.round((g.currentValue / g.targetValue) * 100)) : 0;
                const tint = pct >= 100 ? theme.acc2 : tints[i % tints.length];
                return (
                  <div key={g.id} className={styles.goalRow}>
                    <div className={styles.goalTitleRow}>
                      <span className={styles.goalTitle}>{g.title}</span>
                      <span className={styles.goalRatio} style={{ color: tint }}>
                        {g.currentValue} / {g.targetValue}
                      </span>
                    </div>
                    <Cells pct={pct} count={20} color={tint} highlightColor={theme.acc2} />
                    <div className={styles.goalMeta}>{pct}% · RESTAM {Math.max(0, g.targetValue - g.currentValue)}</div>
                  </div>
                );
              })}
              {today.goals.length === 0 && <div className="fn-empty" style={{ padding: 0, textAlign: "left" }}>NENHUMA META ATIVA</div>}
            </div>
          </div>

          <div className={styles.sidePanel}>
            <div className={styles.sideHead}>
              <span className={styles.sideHeadBar} style={{ background: theme.acc }} />
              <div className={styles.sideTitle}>Projetos ativos</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {activeProjects.map((p, i) => (
                <div key={p.id} className={styles.projectRow}>
                  <span className={styles.projectTint} style={{ background: tints[i % tints.length] }} />
                  <span className={styles.projectTitle}>{p.title}</span>
                  <span className={styles.projectMinutes}>
                    {projectFocusQueries[i]?.data
                      ? formatMinutesAsHm(Math.floor(projectFocusQueries[i]!.data!.totalFocusSeconds / 60))
                      : "…"}
                  </span>
                </div>
              ))}
              {activeProjects.length === 0 && <div className="fn-empty" style={{ padding: 0, textAlign: "left" }}>NENHUM PROJETO ATIVO</div>}
            </div>
          </div>
        </div>
      </div>
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
