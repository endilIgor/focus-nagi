import { apiGet } from "./client";
import type {
  AnalyticsPeriod,
  DayFocusResponse,
  FocusSummaryResponse,
  HourFocusResponse,
  MonthFocusResponse,
  ProjectFocusBreakdownResponse,
  StreaksResponse,
  WeekFocusResponse,
} from "./types";

export const analyticsApi = {
  summary: (period: AnalyticsPeriod) =>
    apiGet<FocusSummaryResponse>("/api/analytics/focus/summary", { period }),
  streaks: () => apiGet<StreaksResponse>("/api/analytics/streaks"),
  heatmap: (from: string, to: string) =>
    apiGet<DayFocusResponse[]>("/api/analytics/heatmap", { from, to }),
  byDay: (from?: string, to?: string) =>
    apiGet<DayFocusResponse[]>("/api/analytics/focus/by-day", { from, to }),
  byWeek: (from?: string, to?: string) =>
    apiGet<WeekFocusResponse[]>("/api/analytics/focus/by-week", { from, to }),
  byMonth: (from?: string, to?: string) =>
    apiGet<MonthFocusResponse[]>("/api/analytics/focus/by-month", { from, to }),
  byHour: (from?: string, to?: string) =>
    apiGet<HourFocusResponse[]>("/api/analytics/focus/by-hour", { from, to }),
  byProject: () => apiGet<ProjectFocusBreakdownResponse[]>("/api/analytics/focus/by-project"),
};
