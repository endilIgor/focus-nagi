import type { AnalyticsPeriod, HourFocusResponse } from "../api/types";
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
