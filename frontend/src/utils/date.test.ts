import { describe, expect, it } from "vitest";
import { formatWeekRangePt } from "./date";

describe("formatWeekRangePt", () => {
  it("formats a range within the same month with a single month/year", () => {
    expect(formatWeekRangePt("2026-09-21", "2026-09-27")).toBe("21 a 27 de set de 2026");
  });

  it("formats a range crossing months within the same year", () => {
    expect(formatWeekRangePt("2026-09-28", "2026-10-04")).toBe("28 de set a 04 de out de 2026");
  });

  it("formats a range crossing an ISO year boundary (week 53)", () => {
    expect(formatWeekRangePt("2020-12-28", "2021-01-03")).toBe("28 de dez de 2020 a 03 de jan de 2021");
  });
});

describe("weekStartMondayIso", () => {
  it("returns the Monday of the week for every weekday, using calendar days only", async () => {
    const { weekStartMondayIso } = await import("./date");
    expect(weekStartMondayIso("2026-09-21")).toBe("2026-09-21");
    expect(weekStartMondayIso("2026-09-24")).toBe("2026-09-21");
    expect(weekStartMondayIso("2026-09-27")).toBe("2026-09-21");
  });

  it("crosses month and year boundaries", async () => {
    const { weekStartMondayIso } = await import("./date");
    expect(weekStartMondayIso("2026-10-04")).toBe("2026-09-28");
    expect(weekStartMondayIso("2021-01-03")).toBe("2020-12-28");
  });
});

describe("weekdayIndex", () => {
  it("reads the weekday from calendar components (0 = Sunday)", async () => {
    const { weekdayIndex } = await import("./date");
    expect(weekdayIndex("2026-09-27")).toBe(0);
    expect(weekdayIndex("2026-09-28")).toBe(1);
  });
});
