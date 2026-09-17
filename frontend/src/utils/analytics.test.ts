import { describe, expect, it } from "vitest";
import { fillHourlyFocus } from "./analytics";

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
