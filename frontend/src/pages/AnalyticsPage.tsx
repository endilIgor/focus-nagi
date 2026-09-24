import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "../api/analytics";
import type { AnalyticsPeriod } from "../api/types";
import { formatMinutesAsHm } from "../hooks/useClock";
import { useTheme } from "../theme/ThemeContext";
import { evaluateWeek, fillHourlyFocus, periodRange, weekInputFromDate, weekStartFromInput } from "../utils/analytics";
import { addDaysIso, todayIso, weekdayLabel } from "../utils/date";
import { describeApiError } from "../utils/errors";
import { ANALYTICS_PERIOD_LABEL } from "../utils/labels";
import styles from "./AnalyticsPage.module.css";

const PERIODS: AnalyticsPeriod[] = ["TODAY", "WEEK", "MONTH"];

export function AnalyticsPage() {
  const { theme } = useTheme();
  const [period, setPeriod] = useState<AnalyticsPeriod>("WEEK");
  const today = todayIso();
  const [week, setWeek] = useState(() => weekInputFromDate(today));
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const { from, to } = periodRange(period, today, week, month);
  const currentWeek = weekInputFromDate(today);
  const weekend = [0, 6].includes(new Date(`${today}T12:00:00Z`).getUTCDay());
  const provisional = period === "WEEK" && week === currentWeek && weekend;
  const ratingStart = period === "WEEK" ? (week === currentWeek && !weekend ? addDaysIso(weekStartFromInput(week), -7) : from) : null;
  const ratingEnd = ratingStart ? (provisional ? today : addDaysIso(ratingStart, 6)) : null;
  const ratingUsesSelectedRange = ratingStart === from && ratingEnd === to;

  const streaksQuery = useQuery({ queryKey: ["analytics", "streaks"], queryFn: analyticsApi.streaks, staleTime: 60_000 });
  const byDayQuery = useQuery({ queryKey: ["analytics", "by-day", from, to], queryFn: () => analyticsApi.byDay(from, to) });
  const byHourQuery = useQuery({ queryKey: ["analytics", "by-hour", from, to], queryFn: () => analyticsApi.byHour(from, to) });
  const byWeekQuery = useQuery({ queryKey: ["analytics", "by-week", from, to], queryFn: () => analyticsApi.byWeek(from, to), enabled: period === "MONTH" });
  const checklistQuery = useQuery({ queryKey: ["analytics", "checklist", from, to], queryFn: () => analyticsApi.checklistDaily(from, to) });
  const ratingDayQuery = useQuery({ queryKey: ["analytics", "by-day", ratingStart, ratingEnd], queryFn: () => analyticsApi.byDay(ratingStart!, ratingEnd!), enabled: Boolean(ratingStart && !ratingUsesSelectedRange) });
  const ratingChecklistQuery = useQuery({ queryKey: ["analytics", "checklist", ratingStart, ratingEnd], queryFn: () => analyticsApi.checklistDaily(ratingStart!, ratingEnd!), enabled: Boolean(ratingStart && !ratingUsesSelectedRange) });

  const error = [byDayQuery, byHourQuery, byWeekQuery, checklistQuery, ratingDayQuery, ratingChecklistQuery].find((query) => query.isError);
  const byDay = byDayQuery.data ?? [];
  const byHour = fillHourlyFocus(byHourQuery.data ?? []);
  const byWeek = byWeekQuery.data ?? [];
  const checklist = checklistQuery.data ?? [];
  const focusedMinutes = byDay.reduce((sum, day) => sum + day.focusedMinutes, 0);
  const checklistTotal = checklist.reduce((sum, day) => sum + day.total, 0);
  const checklistCompleted = checklist.reduce((sum, day) => sum + day.completed, 0);
  const ratingDays = ratingUsesSelectedRange ? byDayQuery.data : ratingDayQuery.data;
  const ratingChecklist = ratingUsesSelectedRange ? checklistQuery.data : ratingChecklistQuery.data;
  const rating = ratingStart && ratingDays && ratingChecklist
    ? evaluateWeek(ratingDays.reduce((sum, day) => sum + day.focusedMinutes, 0), ratingChecklist, ratingStart, today)
    : null;
  const dayMax = Math.max(60, ...byDay.map((day) => day.focusedMinutes));
  const hourMax = Math.max(1, ...byHour.map((hour) => hour.focusedMinutes));
  const weekMax = Math.max(1, ...byWeek.map((entry) => entry.focusedMinutes));
  const bestHour = byHour.reduce((best, next) => next.focusedMinutes > best.focusedMinutes ? next : best);
  const heatMax = Math.max(1, ...byDay.map((day) => day.focusedMinutes));

  return (
    <div>
      <div className={styles.headRow}>
        <div>
          <div className="fn-eyebrow"><span className="fn-eyebrow-bar" /><span className="fn-eyebrow-text">TELEMETRIA</span></div>
          <h1 className="fn-h1">Analytics</h1>
        </div>
        <div className={styles.periods}>
          {PERIODS.map((choice) => <button key={choice} type="button" className={`fn-chip ${period === choice ? "is-active" : ""}`} onClick={() => setPeriod(choice)}>{ANALYTICS_PERIOD_LABEL[choice]}</button>)}
        </div>
      </div>
      <div className={styles.rangeRow}>
        {period === "WEEK" && <label>Selecionar semana <input aria-label="Selecionar semana" type="week" value={week} max={currentWeek} onChange={(event) => setWeek(event.target.value)} /></label>}
        {period === "MONTH" && <label>Selecionar mês <input aria-label="Selecionar mês" type="month" value={month} max={today.slice(0, 7)} onChange={(event) => setMonth(event.target.value)} /></label>}
        <span className="fn-mono-label">{from} — {to}</span>
      </div>
      {error && <div className="fn-error-banner" role="alert">{describeApiError(error.error)}</div>}
      <div className={styles.summary}>
        <SummaryCard label="TEMPO FOCADO" value={byDayQuery.isLoading ? "…" : formatMinutesAsHm(focusedMinutes)} tint="#F7F5FC" hint="SESSÕES CONCLUÍDAS NO PERÍODO" />
        <SummaryCard label="CHECKLIST CONCLUÍDO" value={checklistQuery.isLoading ? "…" : `${checklistCompleted}/${checklistTotal}`} tint={theme.acc2} hint="ITENS NO PERÍODO" />
        <SummaryCard label="STREAK ATUAL" value={streaksQuery.data ? `${streaksQuery.data.currentStreak}d` : "…"} tint="#F43F5E" hint={streaksQuery.data ? `MAIOR: ${streaksQuery.data.longestStreak}d · ATUAL` : "—"} />
        <SummaryCard label="MELHOR HORA" value={bestHour.focusedMinutes ? `${String(bestHour.hour).padStart(2, "0")}h` : "—"} tint={theme.acc} hint={bestHour.focusedMinutes ? `${bestHour.focusedMinutes}min NO PERÍODO` : "SEM DADOS"} />
      </div>
      {period === "WEEK" && <div className={styles.panel} aria-live="polite">
        <div className={styles.panelTitle}>{provisional ? "Avaliação parcial da semana" : "Avaliação semanal"} · {ratingStart} a {ratingEnd}</div>
        {rating ? <><strong className={styles.rating}>{rating.rating.toUpperCase()}</strong><p>{formatMinutesAsHm(ratingDays!.reduce((sum, day) => sum + day.focusedMinutes, 0))} de foco · checklist {rating.completionRate === null ? "sem itens" : `${Math.round(rating.completionRate * 100)}% concluído`}</p></> : <p>{ratingStart && ratingEnd && ratingEnd >= today ? "Avaliação parcial disponível no fim de semana; resultado final após domingo." : "Carregando avaliação…"}</p>}
        <small>Critério: foco &lt;4h / 4–7h / 7–10h / ≥10h; checklist &lt;25% / 25–50% / 50–75% / ≥75%. Média dos níveis (arredondada para baixo); sem itens, vale apenas o foco.</small>
      </div>}
      <div className={styles.panel}>
        <div className={styles.panelHead}><div className={styles.panelTitle}>Mapa de foco · período selecionado</div><span className="fn-mono-label">MENOS ▪ MAIS</span></div>
        <div className={styles.heatGrid}>{byDay.map((day) => {
          const ratio = day.focusedMinutes / heatMax;
          const bg = day.focusedMinutes === 0 ? "rgba(255,255,255,.05)" : ratio < .2 ? theme.glow : ratio < .45 ? theme.soft : ratio < .75 ? theme.acc : theme.acc2;
          return <div key={day.date} title={`${day.date} · ${day.focusedMinutes} min`} className={styles.heatCell} style={{ background: bg }} />;
        })}</div>
      </div>
      <div className={styles.twoCol}>
        <div className={styles.panel} role="region" aria-label="Foco por dia no período selecionado" tabIndex={0}>
          <div className={styles.panelTitle}>Foco por dia · período selecionado</div>
          <div className={styles.dayBars}>{byDay.map((day) => <div key={day.date} className={styles.dayBarCol} title={`${day.date} · ${day.focusedMinutes} min`}>
            <span className={styles.dayBarValue}>{day.focusedMinutes || ""}</span>
            <div className={styles.dayBar} style={{ height: `${Math.round(day.focusedMinutes / dayMax * 100)}%`, background: `linear-gradient(180deg, ${theme.acc2}, ${theme.acc})` }} />
            <span className={styles.dayBarLabel}>{weekdayLabel(day.date).slice(0, 1)}</span>
          </div>)}</div>
        </div>
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Por hora do dia · período selecionado</div>
          <div className={styles.hourBars}>{byHour.map((hour) => <div key={hour.hour} title={`${String(hour.hour).padStart(2, "0")}h · ${hour.focusedMinutes} min`} className={styles.hourBar} style={{ height: `${Math.round(hour.focusedMinutes / hourMax * 100)}%`, background: hour.focusedMinutes > hourMax * .7 ? theme.acc2 : hour.focusedMinutes > hourMax * .35 ? theme.acc : hour.focusedMinutes > 0 ? theme.glow : "rgba(255,255,255,.05)" }} />)}</div>
          <div className={styles.hourAxis}><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span></div>
        </div>
      </div>
      {period === "MONTH" && <div className={styles.panel}>
        <div className={styles.panelHead}><div className={styles.panelTitle}>Foco por semana · mês selecionado</div><span className="fn-mono-label">SEGUNDA A DOMINGO</span></div>
        {byWeek.map((entry) => <div key={entry.weekStart} className={styles.weekRow}>
          <span className={styles.weekLabel}>{entry.weekStart}</span>
          <div className={styles.weekTrack}><div className={styles.weekFill} style={{ width: `${Math.round(entry.focusedMinutes / weekMax * 100)}%`, background: `linear-gradient(90deg, ${theme.acc}, ${theme.acc2})` }} /></div>
          <span className={styles.weekValue}>{entry.focusedMinutes ? formatMinutesAsHm(entry.focusedMinutes) : "—"}</span>
        </div>)}
        {byWeek.length === 0 && <div className="fn-empty">SEM SEMANAS COM FOCO REGISTRADO</div>}
      </div>}
    </div>
  );
}

function SummaryCard({ label, value, tint, hint }: { label: string; value: string; tint: string; hint: string }) {
  return <div className={styles.summaryCard}><div className={styles.summaryTint} style={{ background: tint }} /><div className={styles.summaryLabel}>{label}</div><div className={styles.summaryValue} style={{ color: tint }}>{value}</div><div className={styles.summaryHint}>{hint}</div></div>;
}
