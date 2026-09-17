package com.focusnagi.focus;

import java.time.Instant;

public record FocusSessionResponse(
    Long id,
    Long taskId,
    Long projectId,
    Instant startedAt,
    Instant endedAt,
    int plannedFocusMinutes,
    Integer plannedBreakMinutes,
    long pausedSecondsAccum,
    Instant lastPausedAt,
    Long actualFocusSeconds,
    FocusSessionStatus status,
    String notes,
    Instant createdAt) {

  static FocusSessionResponse from(FocusSession session) {
    return new FocusSessionResponse(
        session.getId(),
        session.getTaskId(),
        session.getProjectId(),
        session.getStartedAt(),
        session.getEndedAt(),
        session.getPlannedFocusMinutes(),
        session.getPlannedBreakMinutes(),
        session.getPausedSecondsAccum(),
        session.getLastPausedAt(),
        session.getActualFocusSeconds(),
        session.getStatus(),
        session.getNotes(),
        session.getCreatedAt());
  }
}
