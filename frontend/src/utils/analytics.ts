import type { AnalyticsPeriod, DayFocusResponse, HourFocusResponse } from "../api/types";
import { addDaysIso } from "./date";

/** Date-only arithmetic is based on calendar components, never timestamp-to-local conversions. */
function utcDay(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function weekInputFromDate(iso: string): string {
  const date = utcDay(iso);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((date.getTime() - first.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function weekStartFromInput(week: string): string {
  const [year, number] = week.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  jan4.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1 + (number - 1) * 7);
  return isoDay(jan4);
}

export function periodRange(period: AnalyticsPeriod, today: string, selectedWeek?: string, selectedMonth?: string): { from: string; to: string } {
  if (period === "TODAY") return { from: today, to: today };
  if (period === "WEEK") {
    const from = weekStartFromInput(selectedWeek ?? weekInputFromDate(today));
    const end = addDaysIso(from, 6);
    return { from, to: end > today ? today : end };
  }
  const from = `${selectedMonth ?? today.slice(0, 7)}-01`;
  const [year, month] = from.split("-").map(Number);
  const end = isoDay(new Date(Date.UTC(year, month, 0)));
  return { from, to: end > today ? today : end };
}

export interface ChecklistDay {
  date: string;
  total: number;
  completed: number;
}

export type WeekRating = "excelente" | "boa" | "média" | "ruim";

/** Score each dimension 0–3: focus <4h / 4–7h / 7–10h / >=10h;
 * checklist <25% / 25–50% / 50–75% / >=75%. Equal-weight average,
 * rounded down, maps 0=ruim, 1=média, 2=boa, 3=excelente.
 * Days without items add no denominator; a week with no items uses focus alone.
 * Historical weeks are final; the current week is provisionally rated on Saturday/Sunday. */
export function evaluateWeek(focusedMinutes: number, checklist: ChecklistDay[], weekStart: string, today: string): { rating: WeekRating; completionRate: number | null } | null {
  const dayOfWeek = utcDay(today).getUTCDay();
  if (weekStart > today || (addDaysIso(weekStart, 6) >= today && dayOfWeek !== 0 && dayOfWeek !== 6)) return null;
  const total = checklist.reduce((sum, day) => sum + day.total, 0);
  const completed = checklist.reduce((sum, day) => sum + day.completed, 0);
  const completionRate = total > 0 ? completed / total : null;
  const focusScore = focusedMinutes >= 600 ? 3 : focusedMinutes >= 420 ? 2 : focusedMinutes >= 240 ? 1 : 0;
  const checklistScore = completionRate === null ? focusScore : completionRate >= .75 ? 3 : completionRate >= .5 ? 2 : completionRate >= .25 ? 1 : 0;
  const rating: WeekRating[] = ["ruim", "média", "boa", "excelente"];
  return { rating: rating[Math.floor((focusScore + checklistScore) / 2)], completionRate };
}

export function fillHourlyFocus(hours: HourFocusResponse[]): HourFocusResponse[] {
  const minutesByHour = new Map(hours.map((entry) => [entry.hour, entry.focusedMinutes]));

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    focusedMinutes: minutesByHour.get(hour) ?? 0,
  }));
}

/** Fixed intensity of a day's focus, independent of the rest of the month. */
export type FocusLevel = 0 | 1 | 2 | 3 | 4;

/** Legend bands in minutes (inclusive); `maxMinutes: null` means open-ended. */
export const FOCUS_LEVEL_BANDS: ReadonlyArray<{ level: FocusLevel; minMinutes: number; maxMinutes: number | null }> = [
  { level: 0, minMinutes: 0, maxMinutes: 0 },
  { level: 1, minMinutes: 1, maxMinutes: 59 },
  { level: 2, minMinutes: 60, maxMinutes: 119 },
  { level: 3, minMinutes: 120, maxMinutes: 239 },
  { level: 4, minMinutes: 240, maxMinutes: null },
];

/** zero / >0 and <60 / 60 to <120 / 120 to <240 / >=240 minutes. */
export function focusLevel(minutes: number): FocusLevel {
  if (!(minutes > 0)) return 0;
  return minutes >= 240 ? 4 : minutes >= 120 ? 3 : minutes >= 60 ? 2 : 1;
}

/** Month keys are calendar `YYYY-MM` strings. */
export function shiftMonth(month: string, delta: number): string {
  const [year, number] = month.split("-").map(Number);
  return isoDay(new Date(Date.UTC(year, number - 1 + delta, 1))).slice(0, 7);
}

export function isFutureMonth(month: string, today: string): boolean {
  return month > today.slice(0, 7);
}

/** Every calendar day shown by the month map, future days included. */
export function monthDisplayRange(month: string): { from: string; to: string } {
  const [year, number] = month.split("-").map(Number);
  return { from: `${month}-01`, to: isoDay(new Date(Date.UTC(year, number, 0))) };
}

/** Days with possible focus records: month start up to today; null when the whole month is still ahead. */
export function monthQueryRange(month: string, today: string): { from: string; to: string } | null {
  if (isFutureMonth(month, today)) return null;
  return periodRange("MONTH", today, undefined, month);
}

export interface MonthHeatmapDay {
  kind: "day";
  date: string;
  /** 0 = Monday … 6 = Sunday. */
  row: number;
  /** Week column, 0 = week containing the 1st. */
  column: number;
  isFuture: boolean;
  isToday: boolean;
  /** Null for future days: no focus is reported for them, not even zero. */
  focusedMinutes: number | null;
  level: FocusLevel | null;
}

/** Slot before the 1st or after the last day: no date, no data, not interactive. */
export interface MonthHeatmapPadding {
  kind: "padding";
  row: number;
  column: number;
}

export type MonthHeatmapCell = MonthHeatmapDay | MonthHeatmapPadding;

export interface MonthHeatmap {
  month: string;
  /** Days of the month in calendar order, each exactly once. */
  days: MonthHeatmapDay[];
  /** Week columns, each with seven cells indexed by row (Monday … Sunday). */
  columns: MonthHeatmapCell[][];
}

/** Lays out a whole month as Monday–Sunday rows by week columns.
 * Elapsed days (up to today) without a record count as zero; later days and
 * records outside the month or after today are ignored. */
export function buildMonthHeatmap(month: string, today: string, records: DayFocusResponse[]): MonthHeatmap {
  const { from, to } = monthDisplayRange(month);
  const minutesByDate = new Map(records.map((record) => [record.date, record.focusedMinutes]));
  const offset = (utcDay(from).getUTCDay() + 6) % 7;
  const length = Number(to.slice(8));
  const days: MonthHeatmapDay[] = Array.from({ length }, (_, index) => {
    const date = addDaysIso(from, index);
    const isFuture = date > today;
    const focusedMinutes = isFuture ? null : minutesByDate.get(date) ?? 0;
    return {
      kind: "day",
      date,
      row: (offset + index) % 7,
      column: Math.floor((offset + index) / 7),
      isFuture,
      isToday: date === today,
      focusedMinutes,
      level: focusedMinutes === null ? null : focusLevel(focusedMinutes),
    };
  });
  const columns = Array.from({ length: Math.ceil((offset + length) / 7) }, (_, column) =>
    Array.from({ length: 7 }, (_, row): MonthHeatmapCell => days[column * 7 + row - offset] ?? { kind: "padding", row, column }),
  );
  return { month, days, columns };
}
