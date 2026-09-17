import { describe, expect, it } from "vitest";
import { daysUntil, dueLabel, priorityStyle } from "./taskDisplay";

describe("daysUntil", () => {
  it("returns 0 for today", () => {
    expect(daysUntil("2026-09-17", "2026-09-17")).toBe(0);
  });

  it("returns negative for past dates", () => {
    expect(daysUntil("2026-09-15", "2026-09-17")).toBe(-2);
  });

  it("returns positive for future dates", () => {
    expect(daysUntil("2026-09-20", "2026-09-17")).toBe(3);
  });

  it("handles month boundaries", () => {
    expect(daysUntil("2026-10-01", "2026-09-29")).toBe(2);
  });
});

describe("dueLabel", () => {
  it("labels today as 'hoje'", () => {
    expect(dueLabel("2026-09-17", "2026-09-17")).toBe("hoje");
  });

  it("labels overdue dates with a negative day count", () => {
    expect(dueLabel("2026-09-14", "2026-09-17")).toBe("-3d");
  });

  it("labels future dates with a plus prefix", () => {
    expect(dueLabel("2026-09-22", "2026-09-17")).toBe("+5d");
  });

  it("labels missing due dates with an em dash", () => {
    expect(dueLabel(null, "2026-09-17")).toBe("—");
  });
});

describe("priorityStyle", () => {
  it("returns distinct colors per priority", () => {
    const high = priorityStyle("HIGH");
    const medium = priorityStyle("MEDIUM");
    const low = priorityStyle("LOW");
    expect(new Set([high.color, medium.color, low.color]).size).toBe(3);
  });
});
