package com.focusnagi.project;

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
@Table(name = "project")
public class Project {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 120)
  private String title;

  @Column(columnDefinition = "TEXT")
  private String description;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private ProjectStatus status = ProjectStatus.ACTIVE;

  @Column(name = "start_date")
  private LocalDate startDate;

  @Column(name = "due_date")
  private LocalDate dueDate;

  @Column(name = "archived_at")
  private Instant archivedAt;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected Project() {}

  public Project(
      String title, String description, LocalDate startDate, LocalDate dueDate, Instant now) {
    this.title = title;
    this.description = description;
    this.startDate = startDate;
    this.dueDate = dueDate;
    this.createdAt = now;
    this.updatedAt = now;
  }

  public void update(
      String title, String description, LocalDate startDate, LocalDate dueDate, Instant now) {
    if (title != null) {
      this.title = title;
    }
    if (description != null) {
      this.description = description;
    }
    if (startDate != null) {
      this.startDate = startDate;
    }
    if (dueDate != null) {
      this.dueDate = dueDate;
    }
    if (this.startDate != null && this.dueDate != null && this.dueDate.isBefore(this.startDate)) {
      throw DomainException.badRequest(
          "PROJECT_INVALID_DATES", "Due date cannot be before start date.");
    }
    this.updatedAt = now;
  }

  public void complete(Instant now) {
    if (this.status != ProjectStatus.ACTIVE) {
      throw DomainException.conflict(
          "INVALID_PROJECT_STATE", "Only an active project can be completed.");
    }
    this.status = ProjectStatus.COMPLETED;
    this.updatedAt = now;
  }

  public void archive(Instant now) {
    if (this.status == ProjectStatus.ARCHIVED) {
      throw DomainException.conflict("INVALID_PROJECT_STATE", "Project is already archived.");
    }
    this.status = ProjectStatus.ARCHIVED;
    this.archivedAt = now;
    this.updatedAt = now;
  }

  public void restore(Instant now) {
    if (this.status != ProjectStatus.ARCHIVED) {
      throw DomainException.conflict(
          "INVALID_PROJECT_STATE", "Only an archived project can be restored.");
    }
    this.status = ProjectStatus.ACTIVE;
    this.archivedAt = null;
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

  public ProjectStatus getStatus() {
    return status;
  }

  public LocalDate getStartDate() {
    return startDate;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public Instant getArchivedAt() {
    return archivedAt;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }
}
