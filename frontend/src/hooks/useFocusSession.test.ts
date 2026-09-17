import { describe, expect, it } from "vitest";
import { computeElapsedSeconds } from "./useFocusSession";
import type { FocusSessionResponse } from "../api/types";

function session(overrides: Partial<FocusSessionResponse>): FocusSessionResponse {
  return {
    id: 1,
    taskId: null,
    projectId: null,
    startedAt: "2026-09-17T10:00:00Z",
    endedAt: null,
    plannedFocusMinutes: 50,
    plannedBreakMinutes: null,
    pausedSecondsAccum: 0,
    lastPausedAt: null,
    actualFocusSeconds: null,
    status: "RUNNING",
    notes: null,
    createdAt: "2026-09-17T10:00:00Z",
    ...overrides,
  };
}

describe("computeElapsedSeconds", () => {
  it("counts elapsed time for a running session minus prior pauses", () => {
    const nowMs = Date.parse("2026-09-17T10:10:00Z");
    const s = session({ pausedSecondsAccum: 60 });
    // 600s elapsed - 60s paused = 540s
    expect(computeElapsedSeconds(s, nowMs)).toBe(540);
  });

  it("freezes elapsed time while paused, regardless of how long real time passes", () => {
    const s = session({
      status: "PAUSED",
      pausedSecondsAccum: 30,
      lastPausedAt: "2026-09-17T10:05:00Z", // paused 5 min (300s) after start
    });
    const elapsedAtPauseMoment = computeElapsedSeconds(s, Date.parse("2026-09-17T10:05:00Z"));
    const elapsedTenMinutesLater = computeElapsedSeconds(s, Date.parse("2026-09-17T10:15:00Z"));
    // 300s since start - 30s prior pauses = 270s, unaffected by how long the current pause lasts
    expect(elapsedAtPauseMoment).toBe(270);
    expect(elapsedTenMinutesLater).toBe(270);
  });

  it("never returns a negative value", () => {
    const s = session({ pausedSecondsAccum: 10_000 });
    expect(computeElapsedSeconds(s, Date.parse("2026-09-17T10:00:01Z"))).toBe(0);
  });
});
