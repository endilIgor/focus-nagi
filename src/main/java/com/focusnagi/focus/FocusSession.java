package com.focusnagi.focus;

import com.focusnagi.common.DomainException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;

@Entity
@Table(name = "focus_session")
public class FocusSession {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "task_id")
  private Long taskId;

  @Column(name = "project_id")
  private Long projectId;

  @Column(name = "started_at", nullable = false, updatable = false)
  private Instant startedAt;

  @Column(name = "ended_at")
  private Instant endedAt;

  @Column(name = "planned_focus_minutes", nullable = false)
  private int plannedFocusMinutes;

  @Column(name = "planned_break_minutes")
  private Integer plannedBreakMinutes;

  @Column(name = "paused_seconds_accum", nullable = false)
  private long pausedSecondsAccum;

  @Column(name = "last_paused_at")
  private Instant lastPausedAt;

  @Column(name = "actual_focus_seconds")
  private Long actualFocusSeconds;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private FocusSessionStatus status = FocusSessionStatus.RUNNING;

  @Column(columnDefinition = "TEXT")
  private String notes;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  protected FocusSession() {}

  public FocusSession(
      int plannedFocusMinutes,
      Integer plannedBreakMinutes,
      Long taskId,
      Long projectId,
      Instant now) {
    this.plannedFocusMinutes = plannedFocusMinutes;
    this.plannedBreakMinutes = plannedBreakMinutes;
    this.taskId = taskId;
    this.projectId = projectId;
    this.startedAt = now;
    this.createdAt = now;
  }

  public void pause(Instant now) {
    requireStatus(FocusSessionStatus.RUNNING);
    this.status = FocusSessionStatus.PAUSED;
    this.lastPausedAt = now;
  }

  public void resume(Instant now) {
    requireStatus(FocusSessionStatus.PAUSED);
    this.pausedSecondsAccum += Duration.between(this.lastPausedAt, now).getSeconds();
    this.lastPausedAt = null;
    this.status = FocusSessionStatus.RUNNING;
  }

  public void finish(Instant now) {
    requireStatus(FocusSessionStatus.RUNNING);
    long elapsed = Duration.between(this.startedAt, now).getSeconds();
    this.actualFocusSeconds = Math.max(elapsed - this.pausedSecondsAccum, 0);
    this.endedAt = now;
    this.status = FocusSessionStatus.COMPLETED;
  }

  public void cancel(Instant now) {
    requireStatus(FocusSessionStatus.RUNNING, FocusSessionStatus.PAUSED);
    this.endedAt = now;
    this.status = FocusSessionStatus.CANCELLED;
  }

  private void requireStatus(FocusSessionStatus... allowed) {
    for (FocusSessionStatus s : allowed) {
      if (this.status == s) {
        return;
      }
    }
    throw DomainException.conflict(
        "INVALID_FOCUS_SESSION_STATE", "Illegal focus session state transition.");
  }

  public Long getId() {
    return id;
  }

  public Long getTaskId() {
    return taskId;
  }

  public Long getProjectId() {
    return projectId;
  }

  public Instant getStartedAt() {
    return startedAt;
  }

  public Instant getEndedAt() {
    return endedAt;
  }

  public int getPlannedFocusMinutes() {
    return plannedFocusMinutes;
  }

  public Integer getPlannedBreakMinutes() {
    return plannedBreakMinutes;
  }

  public long getPausedSecondsAccum() {
    return pausedSecondsAccum;
  }

  public Instant getLastPausedAt() {
    return lastPausedAt;
  }

  public Long getActualFocusSeconds() {
    return actualFocusSeconds;
  }

  public FocusSessionStatus getStatus() {
    return status;
  }

  public String getNotes() {
    return notes;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
