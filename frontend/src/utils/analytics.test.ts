import { describe, expect, it } from "vitest";
import {
  FOCUS_LEVEL_BANDS,
  buildMonthHeatmap,
  evaluateWeek,
  fillHourlyFocus,
  focusLevel,
  isFutureMonth,
  monthDisplayRange,
  monthQueryRange,
  periodRange,
  shiftMonth,
  weekInputFromDate,
  type MonthHeatmapDay,
} from "./analytics";

describe("periodRange", () => {
  it("selects a local ISO week across an ISO year boundary", () => {
    expect(weekInputFromDate("2021-01-01")).toBe("2020-W53");
    expect(periodRange("WEEK", "2021-01-10", "2020-W53")).toEqual({ from: "2020-12-28", to: "2021-01-03" });
  });

  it("selects a full historical month and a leap February", () => {
    expect(periodRange("MONTH", "2026-09-24", undefined, "2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });

  it("defaults to current local calendar ranges and clips current range to today", () => {
    expect(periodRange("TODAY", "2026-09-24")).toEqual({ from: "2026-09-24", to: "2026-09-24" });
    expect(periodRange("WEEK", "2026-09-24")).toEqual({ from: "2026-09-21", to: "2026-09-24" });
    expect(periodRange("MONTH", "2026-09-24")).toEqual({ from: "2026-09-01", to: "2026-09-24" });
  });
});

describe("evaluateWeek", () => {
  const days = [{ date: "2026-09-21", total: 4, completed: 3 }, { date: "2026-09-22", total: 0, completed: 0 }];

  it("shows a provisional current-week grade on Saturday and Sunday, not on weekdays", () => {
    expect(evaluateWeek(600, days, "2026-09-21", "2026-09-25")).toBeNull();
    expect(evaluateWeek(600, days, "2026-09-21", "2026-09-26")?.rating).toBe("excelente");
    expect(evaluateWeek(600, days, "2026-09-21", "2026-09-27")?.rating).toBe("excelente");
  });

  it("does not penalize days with no checklist items", () => {
    expect(evaluateWeek(600, days, "2026-09-21", "2026-09-28")).toMatchObject({ rating: "excelente", completionRate: 0.75 });
  });

  it("rates both focus hours and completion rate, and handles no checklist records", () => {
    expect(evaluateWeek(600, [{ date: "2026-09-21", total: 4, completed: 0 }], "2026-09-21", "2026-09-28")?.rating).toBe("média");
    expect(evaluateWeek(60, [], "2026-09-21", "2026-09-28")).toMatchObject({ rating: "ruim", completionRate: null });
  });
});

describe("fillHourlyFocus", () => {
  it("zero-fills missing hours while preserving each bucket position", () => {
    const result = fillHourlyFocus([
      { hour: 6, focusedMinutes: 25 },
      { hour: 18, focusedMinutes: 40 },
    ]);

    expect(result).toHaveLength(24);
    expect(result[0]).toEqual({ hour: 0, focusedMinutes: 0 });
    expect(result[6]).toEqual({ hour: 6, focusedMinutes: 25 });
    expect(result[17]).toEqual({ hour: 17, focusedMinutes: 0 });
    expect(result[18]).toEqual({ hour: 18, focusedMinutes: 40 });
    expect(result[23]).toEqual({ hour: 23, focusedMinutes: 0 });
  });

  it("returns a complete zero-filled day when the API has no buckets", () => {
    const result = fillHourlyFocus([]);

    expect(result).toHaveLength(24);
    expect(result.every((entry) => entry.focusedMinutes === 0)).toBe(true);
  });
});

describe("focusLevel", () => {
  it("uses fixed bands with exact 60/120/240 minute boundaries", () => {
    expect(focusLevel(0)).toBe(0);
    expect(focusLevel(1)).toBe(1);
    expect(focusLevel(59)).toBe(1);
    expect(focusLevel(60)).toBe(2);
    expect(focusLevel(119)).toBe(2);
    expect(focusLevel(120)).toBe(3);
    expect(focusLevel(239)).toBe(3);
    expect(focusLevel(240)).toBe(4);
    expect(focusLevel(1440)).toBe(4);
  });

  it("does not depend on the other days of the month", () => {
    const quiet = buildMonthHeatmap("2026-09", "2026-10-10", [{ date: "2026-09-01", focusedMinutes: 30 }]);
    const busy = buildMonthHeatmap("2026-09", "2026-10-10", [{ date: "2026-09-01", focusedMinutes: 30 }, { date: "2026-09-02", focusedMinutes: 600 }]);
    expect(quiet.days[0].level).toBe(1);
    expect(busy.days[0].level).toBe(1);
  });

  it("exposes legend bands that match the classifier", () => {
    expect(FOCUS_LEVEL_BANDS).toEqual([
      { level: 0, minMinutes: 0, maxMinutes: 0 },
      { level: 1, minMinutes: 1, maxMinutes: 59 },
      { level: 2, minMinutes: 60, maxMinutes: 119 },
      { level: 3, minMinutes: 120, maxMinutes: 239 },
      { level: 4, minMinutes: 240, maxMinutes: null },
    ]);
  });
});

describe("month ranges", () => {
  it("displays the whole month but queries only up to today in the current month", () => {
    expect(monthDisplayRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthQueryRange("2026-10", "2026-10-10")).toEqual({ from: "2026-10-01", to: "2026-10-10" });
  });

  it("queries the full month for past months, including leap February", () => {
    expect(monthDisplayRange("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthQueryRange("2024-02", "2026-10-10")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthQueryRange("2026-09", "2026-10-01")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("does not query future months", () => {
    expect(monthQueryRange("2026-11", "2026-10-31")).toBeNull();
    expect(monthQueryRange("2027-01", "2026-12-31")).toBeNull();
  });

  it("navigates across year boundaries and detects future months", () => {
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-10", -12)).toBe("2025-10");
    expect(isFutureMonth("2026-10", "2026-10-10")).toBe(false);
    expect(isFutureMonth("2026-09", "2026-10-10")).toBe(false);
    expect(isFutureMonth("2026-11", "2026-10-31")).toBe(true);
    expect(isFutureMonth("2027-01", "2026-12-31")).toBe(true);
  });
});

describe("buildMonthHeatmap", () => {
  const TODAY = "2026-10-10";
  const rowOf = (day: MonthHeatmapDay) => day.row;

  function expectConsistentGrid(month: string, daysInMonth: number, firstRow: number, columns: number) {
    const map = buildMonthHeatmap(month, TODAY, []);
    expect(map.month).toBe(month);
    expect(map.days).toHaveLength(daysInMonth);
    expect(new Set(map.days.map((day) => day.date)).size).toBe(daysInMonth);
    expect(map.days[0]).toMatchObject({ date: `${month}-01`, row: firstRow, column: 0 });
    expect(map.days.map((day) => day.date)).toEqual(Array.from({ length: daysInMonth }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`));
    expect(map.columns).toHaveLength(columns);
    for (const column of map.columns) expect(column).toHaveLength(7);
    map.columns.forEach((column, columnIndex) => column.forEach((cell, rowIndex) => {
      expect(cell.row).toBe(rowIndex);
      expect(cell.column).toBe(columnIndex);
    }));
    const flat = map.columns.flat();
    expect(flat.filter((cell) => cell.kind === "day")).toEqual(map.days);
    expect(flat.filter((cell) => cell.kind === "padding")).toHaveLength(columns * 7 - daysInMonth);
    for (let index = 1; index < map.days.length; index += 1) {
      const previous = map.days[index - 1];
      const current = map.days[index];
      expect(current.column * 7 + current.row).toBe(previous.column * 7 + previous.row + 1);
    }
    return map;
  }

  it("lays out a 28-day February starting on Sunday", () => {
    const map = expectConsistentGrid("2026-02", 28, 6, 5);
    expect(map.days.find((day) => day.date === "2026-02-02")).toMatchObject({ row: 0, column: 1 });
    expect(map.days.at(-1)).toMatchObject({ date: "2026-02-28", row: 5, column: 4 });
  });

  it("lays out a 28-day February starting on Monday with no padding", () => {
    const map = expectConsistentGrid("2021-02", 28, 0, 4);
    expect(map.days.at(-1)).toMatchObject({ date: "2021-02-28", row: 6, column: 3 });
  });

  it("lays out a 29-day leap February", () => {
    const map = expectConsistentGrid("2024-02", 29, 3, 5);
    expect(map.days.at(-1)).toMatchObject({ date: "2024-02-29", row: 3, column: 4 });
  });

  it("lays out 30-day months starting on Monday and on Tuesday", () => {
    expectConsistentGrid("2026-06", 30, 0, 5);
    expectConsistentGrid("2026-09", 30, 1, 5);
  });

  it("lays out a 31-day month starting on Sunday across six week columns", () => {
    const map = expectConsistentGrid("2026-03", 31, 6, 6);
    expect(map.days.at(-1)).toMatchObject({ date: "2026-03-31", row: 1, column: 5 });
  });

  it("handles December and January across the year boundary", () => {
    const december = expectConsistentGrid("2025-12", 31, 0, 5);
    const january = expectConsistentGrid("2026-01", 31, 3, 5);
    expect(december.days.at(-1)).toMatchObject({ date: "2025-12-31", row: 2 });
    expect(january.days[0]).toMatchObject({ date: "2026-01-01", row: 3 });
    expect(january.days.map(rowOf).slice(0, 4)).toEqual([3, 4, 5, 6]);
  });

  it("keeps padding cells explicit and data-free", () => {
    const map = buildMonthHeatmap("2026-02", TODAY, [{ date: "2026-02-01", focusedMinutes: 90 }]);
    const padding = map.columns[0].slice(0, 6);
    expect(padding).toEqual([0, 1, 2, 3, 4, 5].map((row) => ({ kind: "padding", row, column: 0 })));
    expect(map.columns[4][6]).toEqual({ kind: "padding", row: 6, column: 4 });
  });

  it("zero-fills elapsed days without records and keeps reported minutes", () => {
    const map = buildMonthHeatmap("2026-09", TODAY, [
      { date: "2026-09-02", focusedMinutes: 59 },
      { date: "2026-09-03", focusedMinutes: 240 },
    ]);
    expect(map.days[0]).toEqual({ kind: "day", date: "2026-09-01", row: 1, column: 0, isFuture: false, isToday: false, focusedMinutes: 0, level: 0 });
    expect(map.days[1]).toMatchObject({ focusedMinutes: 59, level: 1 });
    expect(map.days[2]).toMatchObject({ focusedMinutes: 240, level: 4 });
    expect(map.days.every((day) => !day.isFuture)).toBe(true);
  });

  it("marks future days distinctly without inventing focus and ignores future or out-of-month records", () => {
    const map = buildMonthHeatmap("2026-10", TODAY, [
      { date: "2026-09-30", focusedMinutes: 300 },
      { date: "2026-10-10", focusedMinutes: 120 },
      { date: "2026-10-11", focusedMinutes: 90 },
      { date: "2026-11-01", focusedMinutes: 90 },
    ]);
    expect(map.days).toHaveLength(31);
    expect(map.days[0]).toMatchObject({ date: "2026-10-01", isFuture: false, focusedMinutes: 0, level: 0 });
    expect(map.days[9]).toMatchObject({ date: "2026-10-10", isFuture: false, isToday: true, focusedMinutes: 120, level: 3 });
    expect(map.days[10]).toEqual({ kind: "day", date: "2026-10-11", row: 6, column: 1, isFuture: true, isToday: false, focusedMinutes: null, level: null });
    expect(map.days.slice(10).every((day) => day.isFuture && day.focusedMinutes === null && day.level === null)).toBe(true);
    expect(map.days.filter((day) => day.isToday)).toHaveLength(1);
  });

  it("renders a fully future month as calendar-only days", () => {
    const map = buildMonthHeatmap("2026-11", TODAY, [{ date: "2026-11-02", focusedMinutes: 90 }]);
    expect(map.days).toHaveLength(30);
    expect(map.days.every((day) => day.isFuture && day.focusedMinutes === null && day.level === null)).toBe(true);
  });
});
