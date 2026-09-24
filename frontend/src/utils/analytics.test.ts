import { describe, expect, it } from "vitest";
import { evaluateWeek, fillHourlyFocus, periodRange, weekInputFromDate } from "./analytics";

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
