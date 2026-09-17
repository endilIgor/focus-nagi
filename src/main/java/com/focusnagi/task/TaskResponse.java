package com.focusnagi.task;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record TaskResponse(
    Long id,
    String title,
    String description,
    TaskStatus status,
    TaskPriority priority,
    Integer estimatedMinutes,
    LocalDate dueDate,
    Long projectId,
    Instant completedAt,
    Instant createdAt,
    Instant updatedAt,
    List<SubtaskResponse> subtasks) {

  static TaskResponse of(Task task, List<Subtask> subtasks) {
    return new TaskResponse(
        task.getId(),
        task.getTitle(),
        task.getDescription(),
        task.getStatus(),
        task.getPriority(),
        task.getEstimatedMinutes(),
        task.getDueDate(),
        task.getProjectId(),
        task.getCompletedAt(),
        task.getCreatedAt(),
        task.getUpdatedAt(),
        subtasks.stream().map(SubtaskResponse::from).toList());
  }

  static TaskResponse summary(Task task) {
    return new TaskResponse(
        task.getId(),
        task.getTitle(),
        task.getDescription(),
        task.getStatus(),
        task.getPriority(),
        task.getEstimatedMinutes(),
        task.getDueDate(),
        task.getProjectId(),
        task.getCompletedAt(),
        task.getCreatedAt(),
        task.getUpdatedAt(),
        null);
  }
}
