package com.focusnagi.task;

import java.time.Instant;

public record SubtaskResponse(Long id, String title, boolean completed, Instant createdAt) {

  static SubtaskResponse from(Subtask subtask) {
    return new SubtaskResponse(
        subtask.getId(), subtask.getTitle(), subtask.isCompleted(), subtask.getCreatedAt());
  }
}
