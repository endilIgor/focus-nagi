package com.focusnagi.project;

import java.time.Instant;
import java.time.LocalDate;

public record ProjectResponse(
    Long id,
    String title,
    String description,
    ProjectStatus status,
    LocalDate startDate,
    LocalDate dueDate,
    Instant archivedAt,
    Instant createdAt,
    Instant updatedAt) {

  static ProjectResponse from(Project project) {
    return new ProjectResponse(
        project.getId(),
        project.getTitle(),
        project.getDescription(),
        project.getStatus(),
        project.getStartDate(),
        project.getDueDate(),
        project.getArchivedAt(),
        project.getCreatedAt(),
        project.getUpdatedAt());
  }
}
