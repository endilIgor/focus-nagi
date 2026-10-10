import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "../api/analytics";
import type { AnalyticsPeriod } from "../api/types";
import { ParticleAnchor } from "../components/particles/ParticleScene";
import { formatMinutesAsHm } from "../hooks/useClock";
import { useTheme } from "../theme/ThemeContext";
import {
  buildMonthHeatmap,
  evaluateWeek,
  fillHourlyFocus,
  FOCUS_LEVEL_BANDS,
  monthQueryRange,
  periodRange,
  shiftMonth as shiftMonthKey,
  weekInputFromDate,
  weekStartFromInput,
} from "../utils/analytics";
import { addDaysIso, formatWeekRangePt, todayIso, weekdayLabel } from "../utils/date";
import { describeApiError } from "../utils/errors";
import { ANALYTICS_PERIOD_LABEL } from "../utils/labels";
import styles from "./AnalyticsPage.module.css";

const PERIODS: AnalyticsPeriod[] = ["TODAY", "WEEK", "MONTH"];

// Daily chart only: "30min", "1h", "1h 30min"; hours are not wrapped at 24h.
function formatDayDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}min`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}min`;
}

function ratingLabel(rating: string): string {
  return `${rating.charAt(0).toUpperCase()}${rating.slice(1)}.`;
}

const WEEKDAY_ROWS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function monthName(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayName(date: string, withWeekday = false): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", {
    ...(withWeekday ? { weekday: "long" as const } : {}),
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function legendLabel({ minMinutes, maxMinutes }: (typeof FOCUS_LEVEL_BANDS)[number]): string {
  if (maxMinutes === null) return `${minMinutes}min ou mais`;
  return minMinutes === maxMinutes ? `${minMinutes}min` : `${minMinutes}–${maxMinutes}min`;
}

/** Month map with its own month selection; shares the by-day cache key (and focus invalidation) with the charts. */
function FocusMonthMap({ today }: { today: string }) {
  const currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const range = monthQueryRange(month, today);
  const query = useQuery({
    queryKey: ["analytics", "by-day", range?.from, range?.to],
    queryFn: () => analyticsApi.byDay(range!.from, range!.to),
    enabled: range !== null,
  });
  // Only data for this month's own key, never a placeholder from another month.
  const heatmap = range === null ? buildMonthHeatmap(month, today, []) : query.isSuccess ? buildMonthHeatmap(month, today, query.data) : null;
  const selected = heatmap?.days.find((day) => day.date === selectedDate) ?? null;
  const name = monthName(month);
  const title = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  const goTo = (delta: number) => {
    const next = shiftMonthKey(month, delta);
    if (next > currentMonth) return;
    setMonth(next);
    setSelectedDate(null);
  };

  return (
    <section className={styles.heatSection} aria-label="Mapa de foco">
      <div className={styles.sectionHead}>
        <h2 className={styles.chartTitleLarge}>Mapa de foco</h2>
        <div className={styles.heatNav}>
          <button type="button" className="fn-chip" onClick={() => goTo(-1)}>← Anterior</button>
          <span className={styles.rangeLabel} aria-live="polite">{title}</span>
          <button type="button" className="fn-chip" onClick={() => goTo(1)} disabled={month >= currentMonth}>Seguinte →</button>
        </div>
      </div>

      {range !== null && query.isError ? (
        <div className={`fn-error-banner ${styles.heatState}`} role="alert">
          <span>{describeApiError(query.error)}</span>
          <button type="button" className="fn-chip" onClick={() => query.refetch()} disabled={query.isFetching}>Tentar novamente</button>
        </div>
      ) : !heatmap ? (
        <p className={`fn-empty ${styles.heatState}`} role="status">Carregando mapa…</p>
      ) : (
        <div className={styles.heatLayout}>
          <div className={styles.heatGrid} role="group" aria-label={`Dias de ${name}`} style={{ gridTemplateColumns: `auto repeat(${heatmap.columns.length}, minmax(0, var(--heat-cell)))` }}>
            {WEEKDAY_ROWS.map((label) => <span key={label} className={styles.heatWeekday} aria-hidden="true">{label}</span>)}
            {heatmap.columns.flatMap((column) => column.map((cell) => cell.kind === "padding" ? (
              <span key={`pad-${cell.column}-${cell.row}`} data-heat-cell="" data-row={cell.row} className={styles.heatPad} aria-hidden="true" />
            ) : (
              <button
                key={cell.date}
                type="button"
                data-heat-cell=""
                data-row={cell.row}
                data-level={cell.level ?? undefined}
                data-future={cell.isFuture ? "true" : undefined}
                className={styles.heatCell}
                aria-label={`${dayName(cell.date)} · ${cell.focusedMinutes === null ? "dia futuro, sem registro" : formatDayDuration(cell.focusedMinutes)}`}
                aria-pressed={cell.date === selectedDate}
                aria-current={cell.isToday ? "date" : undefined}
                style={{ animationDelay: `${cell.column * 35 + cell.row * 12}ms` }}
                onClick={() => setSelectedDate(cell.date)}
              />
            )))}
          </div>

          <div className={styles.heatAside}>
            <section className={`fn-glass ${styles.heatDetails}`} aria-label="Detalhes do dia" aria-live="polite">
              {selected ? (
                <>
                  <p className={styles.heatDetailDate}>{dayName(selected.date, true)}</p>
                  <p className={`${styles.heatDetailValue} ${selected.isFuture ? styles.heatDetailFuture : ""}`}>
                    {selected.focusedMinutes === null ? "Dia futuro, sem registro ainda" : formatDayDuration(selected.focusedMinutes)}
                  </p>
                </>
              ) : (
                <p className={styles.heatDetailHint}>Selecione um dia para ver data e duração.</p>
              )}
            </section>
            <ul className={styles.heatLegend} aria-label="Legenda de intensidade">
              {FOCUS_LEVEL_BANDS.map((band) => (
                <li key={band.level}><span className={styles.heatSwatch} data-level={band.level} aria-hidden="true" />{legendLabel(band)}</li>
              ))}
              <li><span className={styles.heatSwatch} data-future="true" aria-hidden="true" />Futuro</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
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

      <FocusMonthMap today={today} />

      <section className={styles.charts}>
        <div className={`fn-glass ${styles.chartPanel}`} role="region" aria-label="Foco por dia">
          <h2 className={styles.chartTitle}>Foco por dia</h2>
          <div className={styles.dayBars}>{byDay.map((day, index) => <div key={day.date} className={styles.dayBarCol} title={`${day.date} · ${formatDayDuration(day.focusedMinutes)}`}>
            <span className={styles.dayBarValue}>{day.focusedMinutes ? formatDayDuration(day.focusedMinutes) : ""}</span>
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
