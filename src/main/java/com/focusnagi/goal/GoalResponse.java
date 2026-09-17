package com.focusnagi.goal;

import java.time.Instant;
import java.time.LocalDate;

public record GoalResponse(
    Long id,
    String title,
    String description,
    GoalType type,
    int targetValue,
    GoalPeriod period,
    LocalDate startDate,
    LocalDate endDate,
    GoalStatus status,
    Long projectId,
    Instant createdAt,
    Instant updatedAt) {

  static GoalResponse from(Goal goal) {
    return new GoalResponse(
        goal.getId(),
        goal.getTitle(),
        goal.getDescription(),
        goal.getType(),
        goal.getTargetValue(),
        goal.getPeriod(),
        goal.getStartDate(),
        goal.getEndDate(),
        goal.getStatus(),
        goal.getProjectId(),
        goal.getCreatedAt(),
        goal.getUpdatedAt());
  }
}
