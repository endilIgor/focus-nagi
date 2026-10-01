import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "../api/analytics";
import type { AnalyticsPeriod } from "../api/types";
import { ParticleAnchor } from "../components/particles/ParticleScene";
import { formatMinutesAsHm } from "../hooks/useClock";
import { useTheme } from "../theme/ThemeContext";
import { evaluateWeek, fillHourlyFocus, periodRange, weekInputFromDate, weekStartFromInput } from "../utils/analytics";
import { addDaysIso, formatWeekRangePt, todayIso, weekdayLabel } from "../utils/date";
import { describeApiError } from "../utils/errors";
import { ANALYTICS_PERIOD_LABEL } from "../utils/labels";
import styles from "./AnalyticsPage.module.css";

const PERIODS: AnalyticsPeriod[] = ["TODAY", "WEEK", "MONTH"];

function ratingLabel(rating: string): string {
  return `${rating.charAt(0).toUpperCase()}${rating.slice(1)}.`;
}

export function AnalyticsPage() {
  const { theme } = useTheme();
  const [period, setPeriod] = useState<AnalyticsPeriod>("WEEK");
  const today = todayIso();
  const [week, setWeek] = useState(() => weekInputFromDate(today));
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const monthPickerRef = useRef<HTMLInputElement>(null);
  const currentMonth = today.slice(0, 7);
  const shiftMonth = (offset: number) => {
    const [year, number] = month.split("-").map(Number);
    const date = new Date(Date.UTC(year, number - 1 + offset, 1));
    setMonth(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const { from, to } = periodRange(period, today, week, month);
  const currentWeek = weekInputFromDate(today);
  const weekStart = weekStartFromInput(week);
  const weekEnd = addDaysIso(weekStart, 6);
  const isCurrentWeek = week === currentWeek;
  const goToPreviousWeek = () => setWeek(weekInputFromDate(addDaysIso(weekStart, -7)));
  const goToNextWeek = () => { if (!isCurrentWeek) setWeek(weekInputFromDate(addDaysIso(weekStart, 7))); };
  const jumpToWeekContaining = (dateIso: string) => { if (dateIso) setWeek(weekInputFromDate(dateIso > today ? today : dateIso)); };
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
  const ratingFocusMinutes = ratingDays?.reduce((sum, day) => sum + day.focusedMinutes, 0) ?? 0;
  const dayMax = Math.max(60, ...byDay.map((day) => day.focusedMinutes));
  const hourMax = Math.max(1, ...byHour.map((hour) => hour.focusedMinutes));
  const weekMax = Math.max(1, ...byWeek.map((entry) => entry.focusedMinutes));
  const bestHour = byHour.reduce((best, next) => next.focusedMinutes > best.focusedMinutes ? next : best);
  const heatMax = Math.max(1, ...byDay.map((day) => day.focusedMinutes));

  return (
    <div className={styles.page}>
      <section className="fn-hero">
        <div className="fn-hero-copy">
          <div className="fn-eyebrow">
            <span className="fn-eyebrow-bar" aria-hidden="true" />
            <span className="fn-eyebrow-text">Telemetria</span>
          </div>
          <h1 className="fn-h1">Analytics.</h1>
          <div className={styles.periods}>
            {PERIODS.map((choice) => (
              <button
                key={choice}
                type="button"
                className={`fn-chip ${period === choice ? "is-active" : ""}`}
                aria-pressed={period === choice}
                onClick={() => setPeriod(choice)}
              >
                {ANALYTICS_PERIOD_LABEL[choice]}
              </button>
            ))}
          </div>
        </div>
        <ParticleAnchor className="fn-hero-anchor" shape="cloud" aria-hidden="true" />
      </section>

      <div className={styles.rangeRow}>
        {period === "WEEK" && <div className={styles.pickerRow}>
          <button type="button" className="fn-chip" onClick={goToPreviousWeek}>← Semana anterior</button>
          <span className={styles.rangeLabel}>{formatWeekRangePt(weekStart, weekEnd)}</span>
          <button type="button" className="fn-chip" onClick={goToNextWeek} disabled={isCurrentWeek}>Próxima semana →</button>
          <label className={styles.jumpField}>Pular para
            <input aria-label="Pular para uma data" type="date" value={weekStart} max={today} onChange={(event) => jumpToWeekContaining(event.target.value)} />
          </label>
        </div>}
        {period === "MONTH" && <div className={styles.pickerRow}>
          <button type="button" className="fn-chip" onClick={() => shiftMonth(-1)}>← Mês anterior</button>
          <span className={styles.rangeLabel}>{monthLabel}</span>
          <button type="button" className="fn-chip" onClick={() => shiftMonth(1)} disabled={month >= currentMonth}>Próximo mês →</button>
          <span className={styles.calendarControl}>
            <button type="button" className="fn-chip" aria-label="Abrir calendário de meses" onClick={() => monthPickerRef.current?.showPicker?.()}>▦ Calendário</button>
            <input ref={monthPickerRef} className={styles.calendarInput} aria-label="Data para selecionar mês" type="date" value={`${month}-01`} max={today} onChange={(event) => { if (event.target.value && event.target.value <= today) setMonth(event.target.value.slice(0, 7)); }} />
          </span>
        </div>}
        {period === "TODAY" && <span className="fn-mono-label">{from} — {to}</span>}
      </div>

      {error && <div className="fn-error-banner" role="alert">{describeApiError(error.error)}</div>}

      <section className={styles.summary} role="region" aria-label="Resumo do período">
        <SummaryCard label="Tempo focado" value={byDayQuery.isLoading ? "…" : formatMinutesAsHm(focusedMinutes)} hint="Sessões concluídas no período" delay={0} />
        <SummaryCard label="Checklist" value={checklistQuery.isLoading ? "…" : `${checklistCompleted}/${checklistTotal}`} hint="Itens concluídos no período" delay={70} />
        <SummaryCard label="Streak atual" accent value={streaksQuery.data ? `${streaksQuery.data.currentStreak}d` : "…"} hint={streaksQuery.data ? `Maior: ${streaksQuery.data.longestStreak} dias` : "—"} delay={140} />
        <SummaryCard label="Melhor hora" value={bestHour.focusedMinutes ? `${String(bestHour.hour).padStart(2, "0")}h` : "—"} hint={bestHour.focusedMinutes ? `${bestHour.focusedMinutes}min no período` : "Sem dados"} delay={210} />
      </section>

      {period === "WEEK" && <section className={styles.ratingSection} aria-live="polite">
        <div>
          <div className="fn-eyebrow">
            <span className="fn-eyebrow-bar" aria-hidden="true" />
            <span className="fn-eyebrow-text">{provisional ? "Avaliação parcial da semana" : "Avaliação semanal"}</span>
          </div>
          {rating ? (
            <div className={styles.rating}>{ratingLabel(rating.rating)}</div>
          ) : (
            <p className={styles.ratingWait}>
              {ratingStart && ratingEnd && ratingEnd >= today
                ? "Avaliação parcial disponível no fim de semana; resultado final após domingo."
                : "Carregando avaliação…"}
            </p>
          )}
        </div>
        <p className={styles.ratingLine}>
          {ratingStart && ratingEnd && (
            <>
              {!ratingUsesSelectedRange && <>{formatWeekRangePt(ratingStart, ratingEnd)} — </>}
              {formatMinutesAsHm(ratingFocusMinutes)} de foco, checklist{" "}
              {rating?.completionRate == null
                ? "sem itens no período"
                : `${Math.round(rating.completionRate * 100)}% concluída`}
              .
            </>
          )}
        </p>
      </section>}

      <section className={styles.heatSection} aria-label="Mapa de foco">
        <div className={styles.sectionHead}>
          <h2 className={styles.chartTitleLarge}>Mapa de foco</h2>
          <span className="fn-mono-label">MENOS ▪ MAIS</span>
        </div>
        <div className={styles.heatGrid}>{byDay.map((day, index) => {
          const ratio = day.focusedMinutes / heatMax;
          const bg = day.focusedMinutes === 0 ? "#10141f" : ratio < .2 ? theme.glow : ratio < .45 ? theme.soft : ratio < .75 ? theme.acc : theme.acc2;
          return <div key={day.date} title={`${day.date} · ${day.focusedMinutes} min`} className={styles.heatCell} style={{ background: bg, animationDelay: `${Math.floor(index / 7) * 35 + (index % 7) * 12}ms` }} />;
        })}</div>
      </section>

      <section className={styles.charts}>
        <div className={`fn-glass ${styles.chartPanel}`} role="region" aria-label="Foco por dia">
          <h2 className={styles.chartTitle}>Foco por dia</h2>
          <div className={styles.dayBars}>{byDay.map((day, index) => <div key={day.date} className={styles.dayBarCol} title={`${day.date} · ${day.focusedMinutes} min`}>
            <span className={styles.dayBarValue}>{day.focusedMinutes || ""}</span>
            <div className={styles.dayBar} style={{ height: `${Math.round(day.focusedMinutes / dayMax * 100)}%`, background: `linear-gradient(180deg, ${theme.acc2}, ${theme.acc})`, animationDelay: `${index * 70}ms` }} />
            <span className={styles.dayBarLabel}>{period === "TODAY" ? "HOJE" : weekdayLabel(day.date).slice(0, 1)}</span>
          </div>)}</div>
        </div>
        <div className={`fn-glass ${styles.chartPanel}`} role="region" aria-label="Por hora do dia">
          <h2 className={styles.chartTitle}>Por hora do dia</h2>
          <div className={styles.hourBars}>{byHour.map((hour, index) => <div key={hour.hour} title={`${String(hour.hour).padStart(2, "0")}h · ${hour.focusedMinutes} min`} className={styles.hourBar} style={{ height: `${Math.round(hour.focusedMinutes / hourMax * 100)}%`, background: hour.focusedMinutes > hourMax * .7 ? theme.acc2 : hour.focusedMinutes > hourMax * .35 ? theme.acc : hour.focusedMinutes > 0 ? theme.glow : "rgba(255,255,255,.05)", animationDelay: `${index * 28}ms` }} />)}</div>
          <div className={styles.hourAxis}><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span></div>
        </div>
      </section>

      {period === "MONTH" && <section className={`fn-glass ${styles.weekPanel}`}>
        <div className={styles.sectionHead}>
          <h2 className={styles.chartTitle}>Foco por semana</h2>
          <span className="fn-mono-label">SEGUNDA A DOMINGO</span>
        </div>
        {byWeek.map((entry) => <div key={entry.weekStart} className={styles.weekRow}>
          <span className={styles.weekLabel}>{entry.weekStart}</span>
          <div className={styles.weekTrack}><div className={styles.weekFill} style={{ width: `${Math.round(entry.focusedMinutes / weekMax * 100)}%`, background: `linear-gradient(90deg, ${theme.acc}, ${theme.acc2})` }} /></div>
          <span className={styles.weekValue}>{entry.focusedMinutes ? formatMinutesAsHm(entry.focusedMinutes) : "—"}</span>
        </div>)}
        {byWeek.length === 0 && <p className="fn-empty">Sem semanas com foco registrado.</p>}
      </section>}
    </div>
  );
}

function SummaryCard({ label, value, hint, accent = false, delay = 0 }: { label: string; value: string; hint: string; accent?: boolean; delay?: number }) {
  return (
    <article className={`fn-glass ${styles.summaryCard}`} style={{ animationDelay: `${delay}ms` }}>
      <div className={styles.summaryLabel}>{label}</div>
      <div className={`${styles.summaryValue} ${accent ? styles.summaryAccent : ""}`}>{value}</div>
      <div className={styles.summaryHint}>{hint}</div>
    </article>
  );
}
