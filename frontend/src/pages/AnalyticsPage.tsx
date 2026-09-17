import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "../api/analytics";
import type { AnalyticsPeriod } from "../api/types";
import { formatMinutesAsHm } from "../hooks/useClock";
import { useTheme } from "../theme/ThemeContext";
import { getTints } from "../theme/themes";
import { fillHourlyFocus } from "../utils/analytics";
import { addDaysIso, todayIso, weekdayLabel } from "../utils/date";
import { describeApiError } from "../utils/errors";
import styles from "./AnalyticsPage.module.css";

const PERIODS: AnalyticsPeriod[] = ["TODAY", "WEEK", "MONTH"];
export function AnalyticsPage() {
  const { theme } = useTheme();
  const tints = getTints(theme);
  const [period, setPeriod] = useState<AnalyticsPeriod>("WEEK");
  const today = todayIso();

  const summaryQuery = useQuery({ queryKey: ["analytics", "summary", period], queryFn: () => analyticsApi.summary(period) });
  const streaksQuery = useQuery({ queryKey: ["analytics", "streaks"], queryFn: () => analyticsApi.streaks(), staleTime: 60_000 });
  const heatmapQuery = useQuery({
    queryKey: ["analytics", "heatmap"],
    queryFn: () => analyticsApi.heatmap(addDaysIso(today, -118), today),
  });
  const byDayQuery = useQuery({
    queryKey: ["analytics", "by-day", "14"],
    queryFn: () => analyticsApi.byDay(addDaysIso(today, -13), today),
  });
  const byHourQuery = useQuery({
    queryKey: ["analytics", "by-hour", "30"],
    queryFn: () => analyticsApi.byHour(addDaysIso(today, -29), today),
  });
  const byProjectQuery = useQuery({ queryKey: ["analytics", "by-project"], queryFn: () => analyticsApi.byProject() });
  const byWeekQuery = useQuery({
    queryKey: ["analytics", "by-week", "8"],
    queryFn: () => analyticsApi.byWeek(addDaysIso(today, -55), today),
  });

  if (summaryQuery.isError) {
    return <div className="fn-error-banner">{describeApiError(summaryQuery.error)}</div>;
  }

  const summary = summaryQuery.data;
  const heat = heatmapQuery.data ?? [];
  const heatMax = Math.max(1, ...heat.map((d) => d.focusedMinutes));
  const scale = ["rgba(255,255,255,.05)", theme.glow, theme.acc, theme.acc, theme.acc2];

  const byDay = byDayQuery.data ?? [];
  const dayMax = Math.max(60, ...byDay.map((d) => d.focusedMinutes));

  const byHour = fillHourlyFocus(byHourQuery.data ?? []);
  const hourMax = Math.max(1, ...byHour.map((h) => h.focusedMinutes));

  const byProject = byProjectQuery.data ?? [];
  const projectMax = Math.max(1, ...byProject.map((p) => p.focusedMinutes));

  const byWeek = byWeekQuery.data ?? [];
  const weekMax = Math.max(1, ...byWeek.map((w) => w.focusedMinutes));

  const bestHourCandidate = byHour.reduce((a, b) => (b.focusedMinutes > a.focusedMinutes ? b : a));
  const bestHour = bestHourCandidate.focusedMinutes > 0 ? bestHourCandidate : null;

  return (
    <div>
      <div className={styles.headRow}>
        <div>
          <div className="fn-eyebrow">
            <span className="fn-eyebrow-bar" />
            <span className="fn-eyebrow-text">TELEMETRIA</span>
          </div>
          <h1 className="fn-h1">Analytics</h1>
        </div>
        <div className={styles.periods}>
          {PERIODS.map((p) => (
            <button key={p} className={`fn-chip ${period === p ? "is-active" : ""}`} onClick={() => setPeriod(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.summary}>
        <SummaryCard label="MINUTOS FOCADOS" value={summary ? formatMinutesAsHm(summary.focusedMinutes) : "…"} tint="#F7F5FC" hint={`${period} · SÓ SESSÕES COMPLETED`} />
        <SummaryCard label="SESSÕES" value={summary ? String(summary.sessionCount) : "…"} tint={theme.acc2} hint="TOTAL NO PERÍODO" />
        <SummaryCard label="STREAK ATUAL" value={streaksQuery.data ? `${streaksQuery.data.currentStreak}d` : "…"} tint="#F43F5E" hint={streaksQuery.data ? `MAIOR: ${streaksQuery.data.longestStreak}d` : "—"} />
        <SummaryCard label="MELHOR HORA" value={bestHour ? `${String(bestHour.hour).padStart(2, "0")}h` : "—"} tint={theme.acc} hint={bestHour ? `${bestHour.focusedMinutes}min NO PERÍODO (30d)` : "SEM DADOS"} />
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={styles.panelTitle}>Heatmap · 17 semanas</div>
          <div className={styles.legend}>
            <span>MENOS</span>
            {scale.map((bg, i) => (
              <span key={i} className={styles.legendSwatch} style={{ background: bg }} />
            ))}
            <span>MAIS</span>
          </div>
        </div>
        <div className={styles.heatGrid}>
          {heat.map((d, i) => {
            const v = d.focusedMinutes;
            const ratio = v / heatMax;
            const bg = v === 0 ? "rgba(255,255,255,.05)" : ratio < 0.2 ? theme.glow : ratio < 0.45 ? theme.soft : ratio < 0.75 ? theme.acc : theme.acc2;
            return <div key={i} title={`${d.date} · ${v} min`} className={styles.heatCell} style={{ background: bg }} />;
          })}
        </div>
      </div>

      <div className={styles.twoCol}>
        <div className={styles.panel} style={{ marginBottom: 0 }}>
          <div className={styles.panelTitle} style={{ marginBottom: 18 }}>Foco por dia · 14d</div>
          <div className={styles.dayBars}>
            {byDay.map((d) => (
              <div key={d.date} className={styles.dayBarCol}>
                <span className={styles.dayBarValue}>{d.focusedMinutes || ""}</span>
                <div
                  className={styles.dayBar}
                  style={{ height: `${Math.round((d.focusedMinutes / dayMax) * 100)}%`, background: `linear-gradient(180deg, ${theme.acc2}, ${theme.acc})` }}
                />
                <span className={styles.dayBarLabel}>{weekdayLabel(d.date).slice(0, 1)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.panel} style={{ marginBottom: 0 }}>
          <div className={styles.panelTitle} style={{ marginBottom: 18 }}>Por hora do dia · 30d</div>
          <div className={styles.hourBars}>
            {byHour.map((h) => (
              <div
                key={h.hour}
                title={`${String(h.hour).padStart(2, "0")}h · ${h.focusedMinutes} min`}
                className={styles.hourBar}
                style={{
                  height: `${Math.round((h.focusedMinutes / hourMax) * 100)}%`,
                  background: h.focusedMinutes > hourMax * 0.7 ? theme.acc2 : h.focusedMinutes > hourMax * 0.35 ? theme.acc : h.focusedMinutes > 0 ? theme.glow : "rgba(255,255,255,.05)",
                }}
              />
            ))}
          </div>
          <div className={styles.hourAxis}>
            <span>00h</span>
            <span>06h</span>
            <span>12h</span>
            <span>18h</span>
            <span>23h</span>
          </div>
        </div>
      </div>

      <div className={styles.bottomTwoCol}>
        <div className={styles.panel} style={{ marginBottom: 0 }}>
          <div className={styles.panelTitle} style={{ marginBottom: 16 }}>Foco por projeto</div>
          {byProject.map((p, i) => (
            <div key={p.projectId ?? "none"} className={styles.projectRow}>
              <div className={styles.projectRowHead}>
                <span>{p.title}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--text-mute)" }}>{formatMinutesAsHm(p.focusedMinutes)}</span>
              </div>
              <div style={{ marginTop: 7, display: "flex", gap: 2, height: 8 }}>
                {Array.from({ length: 24 }, (_, c) => {
                  const pct = Math.round((p.focusedMinutes / projectMax) * 100);
                  const on = c < Math.round((pct / 100) * 24);
                  return <span key={c} style={{ flex: 1, background: on ? tints[i % tints.length] : "rgba(255,255,255,.07)" }} />;
                })}
              </div>
            </div>
          ))}
          {byProject.length === 0 && <div className="fn-empty" style={{ padding: 0, textAlign: "left" }}>SEM DADOS DE FOCO</div>}
        </div>

        <div className={styles.panel} style={{ marginBottom: 0 }}>
          <div className={styles.panelHead}>
            <div className={styles.panelTitle}>Foco por semana</div>
            <span className="fn-mono-label">SEGUNDA A DOMINGO</span>
          </div>
          {byWeek.map((w) => {
            const pct = Math.round((w.focusedMinutes / weekMax) * 100);
            return (
              <div key={w.weekStart} className={styles.weekRow}>
                <span className={styles.weekLabel}>{w.weekStart}</span>
                <div className={styles.weekTrack}>
                  <div className={styles.weekFill} style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${theme.acc}, ${theme.acc2})` }} />
                </div>
                <span className={styles.weekValue}>{w.focusedMinutes ? formatMinutesAsHm(w.focusedMinutes) : "—"}</span>
              </div>
            );
          })}
          {byWeek.length === 0 && <div className="fn-empty" style={{ padding: 0, textAlign: "left" }}>SEM SEMANAS COM FOCO REGISTRADO</div>}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tint, hint }: { label: string; value: string; tint: string; hint: string }) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryTint} style={{ background: tint }} />
      <div className={styles.summaryLabel}>{label}</div>
      <div className={styles.summaryValue} style={{ color: tint }}>{value}</div>
      <div className={styles.summaryHint}>{hint}</div>
    </div>
  );
}
