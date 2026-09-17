package com.focusnagi.goal;

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
@Table(name = "goal")
public class Goal {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 150)
  private String title;

  @Column(columnDefinition = "TEXT")
  private String description;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 30)
  private GoalType type;

  @Column(name = "target_value", nullable = false)
  private int targetValue;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private GoalPeriod period;

  @Column(name = "start_date", nullable = false)
  private LocalDate startDate;

  @Column(name = "end_date")
  private LocalDate endDate;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private GoalStatus status = GoalStatus.ACTIVE;

  @Column(name = "project_id")
  private Long projectId;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected Goal() {}

  public Goal(
      String title,
      String description,
      GoalType type,
      int targetValue,
      GoalPeriod period,
      LocalDate startDate,
      LocalDate endDate,
      Long projectId,
      Instant now) {
    this.title = title;
    this.description = description;
    this.type = type;
    this.targetValue = targetValue;
    this.period = period;
    this.startDate = startDate;
    this.endDate = endDate;
    this.projectId = projectId;
    this.createdAt = now;
    this.updatedAt = now;
  }

  public void update(
      String title,
      String description,
      Integer targetValue,
      LocalDate startDate,
      LocalDate endDate,
      Instant now) {
    if (title != null) {
      this.title = title;
    }
    if (description != null) {
      this.description = description;
    }
    if (targetValue != null) {
      this.targetValue = targetValue;
    }
    if (startDate != null) {
      this.startDate = startDate;
    }
    this.endDate = endDate;
    if (this.endDate != null && this.endDate.isBefore(this.startDate)) {
      throw DomainException.badRequest(
          "GOAL_INVALID_DATES", "End date cannot be before start date.");
    }
    this.updatedAt = now;
  }

  public void complete(Instant now) {
    if (this.status != GoalStatus.ACTIVE) {
      throw DomainException.conflict("INVALID_GOAL_STATE", "Only an active goal can be completed.");
    }
    this.status = GoalStatus.COMPLETED;
    this.updatedAt = now;
  }

  public void archive(Instant now) {
    if (this.status == GoalStatus.ARCHIVED) {
      throw DomainException.conflict("INVALID_GOAL_STATE", "Goal is already archived.");
    }
    this.status = GoalStatus.ARCHIVED;
    this.updatedAt = now;
  }

  public void restore(Instant now) {
    if (this.status != GoalStatus.ARCHIVED) {
      throw DomainException.conflict(
          "INVALID_GOAL_STATE", "Only an archived goal can be restored.");
    }
    this.status = GoalStatus.ACTIVE;
    this.updatedAt = now;
  }

  public Long getId() {
    return id;
  }

  public String getTitle() {
    return title;
  }

  public String getDescription() {
    return description;
  }

  public GoalType getType() {
    return type;
  }

  public int getTargetValue() {
    return targetValue;
  }

  public GoalPeriod getPeriod() {
    return period;
  }

  public LocalDate getStartDate() {
    return startDate;
  }

  public LocalDate getEndDate() {
    return endDate;
  }

  public GoalStatus getStatus() {
    return status;
  }

  public Long getProjectId() {
    return projectId;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }
}
