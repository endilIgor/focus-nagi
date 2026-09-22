import { describe, expect, it } from "vitest";
import {
  COUNTDOWN_NOTICE_THRESHOLD_SECONDS,
  isCountdownNoticeVisible,
  shouldTriggerCountdownNotice,
} from "./useCountdownNotice";
import type { FocusSessionResponse } from "../api/types";

function session(overrides: Partial<FocusSessionResponse> = {}): FocusSessionResponse {
  return {
    id: 1,
    taskId: null,
    projectId: null,
    startedAt: "2026-09-21T12:00:00Z",
    endedAt: null,
    plannedFocusMinutes: 25,
    plannedBreakMinutes: null,
    pausedSecondsAccum: 0,
    lastPausedAt: null,
    actualFocusSeconds: null,
    status: "RUNNING",
    notes: null,
    createdAt: "2026-09-21T12:00:00Z",
    ...overrides,
  };
}

describe("shouldTriggerCountdownNotice", () => {
  it("triggers when a RUNNING session crosses into the final minute", () => {
    expect(shouldTriggerCountdownNotice(session(), 60, null)).toBe(true);
    expect(shouldTriggerCountdownNotice(session(), 59, null)).toBe(true);
    expect(shouldTriggerCountdownNotice(session(), 1, null)).toBe(true);
  });

  it("uses the threshold constant as the inclusive upper bound", () => {
    expect(COUNTDOWN_NOTICE_THRESHOLD_SECONDS).toBe(60);
    expect(shouldTriggerCountdownNotice(session(), 61, null)).toBe(false);
  });

  it("never triggers at or below zero remaining (finished or overtime)", () => {
    expect(shouldTriggerCountdownNotice(session(), 0, null)).toBe(false);
    expect(shouldTriggerCountdownNotice(session(), -5, null)).toBe(false);
  });

  it("never triggers for paused, completed, cancelled, or missing sessions", () => {
    expect(shouldTriggerCountdownNotice(session({ status: "PAUSED" }), 45, null)).toBe(false);
    expect(shouldTriggerCountdownNotice(session({ status: "COMPLETED" }), 45, null)).toBe(false);
    expect(shouldTriggerCountdownNotice(session({ status: "CANCELLED" }), 45, null)).toBe(false);
    expect(shouldTriggerCountdownNotice(null, 45, null)).toBe(false);
    expect(shouldTriggerCountdownNotice(undefined, 45, null)).toBe(false);
  });

  it("does not re-trigger for a session that was already notified", () => {
    expect(shouldTriggerCountdownNotice(session(), 45, 1)).toBe(false);
  });

  it("arms again for a newly started session with a different id", () => {
    expect(shouldTriggerCountdownNotice(session({ id: 2 }), 45, 1)).toBe(true);
  });
});

describe("isCountdownNoticeVisible", () => {
  it("stays visible for the notified session while it is RUNNING and above zero", () => {
    expect(isCountdownNoticeVisible(session(), 45, 1)).toBe(true);
    expect(isCountdownNoticeVisible(session(), 1, 1)).toBe(true);
  });

  it("hides when the session is paused, finished, or missing", () => {
    expect(isCountdownNoticeVisible(session({ status: "PAUSED" }), 45, 1)).toBe(false);
    expect(isCountdownNoticeVisible(session({ status: "COMPLETED" }), 45, 1)).toBe(false);
    expect(isCountdownNoticeVisible(session({ status: "CANCELLED" }), 45, 1)).toBe(false);
    expect(isCountdownNoticeVisible(null, 45, 1)).toBe(false);
    expect(isCountdownNoticeVisible(undefined, 45, 1)).toBe(false);
  });

  it("hides at or below zero remaining (overtime)", () => {
    expect(isCountdownNoticeVisible(session(), 0, 1)).toBe(false);
    expect(isCountdownNoticeVisible(session(), -10, 1)).toBe(false);
  });

  it("is not visible above the threshold even after the session was notified", () => {
    expect(isCountdownNoticeVisible(session(), 61, 1)).toBe(false);
    expect(isCountdownNoticeVisible(session(), 300, 1)).toBe(false);
  });

  it("does not show for a session that was never notified", () => {
    expect(isCountdownNoticeVisible(session(), 45, null)).toBe(false);
    expect(isCountdownNoticeVisible(session(), 45, 99)).toBe(false);
  });
});
