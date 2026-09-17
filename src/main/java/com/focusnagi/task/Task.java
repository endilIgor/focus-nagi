package com.focusnagi.task;

import com.focusnagi.common.DomainException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "task")
public class Task {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "project_id")
  private Long projectId;

  @Column(nullable = false, length = 200)
  private String title;

  @Column(columnDefinition = "TEXT")
  private String description;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private TaskStatus status = TaskStatus.TODO;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 10)
  private TaskPriority priority = TaskPriority.MEDIUM;

  @Column(name = "estimated_minutes")
  private Integer estimatedMinutes;

  @Column(name = "due_date")
  private LocalDate dueDate;

  @Column(name = "completed_at")
  private Instant completedAt;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected Task() {}

  public Task(
      String title,
      String description,
      TaskPriority priority,
      Integer estimatedMinutes,
      LocalDate dueDate,
      Long projectId,
      Instant now) {
    this.title = title;
    this.description = description;
    this.priority = priority == null ? TaskPriority.MEDIUM : priority;
    this.estimatedMinutes = estimatedMinutes;
    this.dueDate = dueDate;
    this.projectId = projectId;
    this.createdAt = now;
    this.updatedAt = now;
  }

  public void update(
      String title,
      String description,
      TaskPriority priority,
      Integer estimatedMinutes,
      LocalDate dueDate,
      Long projectId,
      Instant now) {
    if (title != null) {
      this.title = title;
    }
    if (description != null) {
      this.description = description;
    }
    if (priority != null) {
      this.priority = priority;
    }
    if (estimatedMinutes != null) {
      this.estimatedMinutes = estimatedMinutes;
    }
    // dueDate and projectId are nullable fields: always apply, including explicit nulls.
    this.dueDate = dueDate;
    this.projectId = projectId;
    this.updatedAt = now;
  }

  public void start(Instant now) {
    if (this.status != TaskStatus.TODO) {
      throw DomainException.conflict("INVALID_TASK_STATE", "Only a pending task can be started.");
    }
    this.status = TaskStatus.IN_PROGRESS;
    this.updatedAt = now;
  }

  public void complete(Instant now) {
    if (this.status != TaskStatus.TODO && this.status != TaskStatus.IN_PROGRESS) {
      throw DomainException.conflict(
          "INVALID_TASK_STATE", "Only a pending or in-progress task can be completed.");
    }
    this.status = TaskStatus.COMPLETED;
    this.completedAt = now;
    this.updatedAt = now;
  }

  public void reopen(Instant now) {
    if (this.status != TaskStatus.COMPLETED) {
      throw DomainException.conflict(
          "INVALID_TASK_STATE", "Only a completed task can be reopened.");
    }
    this.status = TaskStatus.TODO;
    this.completedAt = null;
    this.updatedAt = now;
  }

  public void cancel(Instant now) {
    if (this.status != TaskStatus.TODO && this.status != TaskStatus.IN_PROGRESS) {
      throw DomainException.conflict(
          "INVALID_TASK_STATE", "Only a pending or in-progress task can be cancelled.");
    }
    this.status = TaskStatus.CANCELLED;
    this.updatedAt = now;
  }

  public Long getId() {
    return id;
  }

  public Long getProjectId() {
    return projectId;
  }

  public String getTitle() {
    return title;
  }

  public String getDescription() {
    return description;
  }

  public TaskStatus getStatus() {
    return status;
  }

  public TaskPriority getPriority() {
    return priority;
  }

  public Integer getEstimatedMinutes() {
    return estimatedMinutes;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public Instant getCompletedAt() {
    return completedAt;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }
}
