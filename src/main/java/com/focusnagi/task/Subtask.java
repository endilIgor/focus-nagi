package com.focusnagi.task;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "subtask")
public class Subtask {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "task_id", nullable = false)
  private Long taskId;

  @Column(nullable = false, length = 200)
  private String title;

  @Column(nullable = false)
  private boolean completed;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  protected Subtask() {}

  public Subtask(Long taskId, String title, Instant now) {
    this.taskId = taskId;
    this.title = title;
    this.createdAt = now;
  }

  public void complete() {
    this.completed = true;
  }

  public void reopen() {
    this.completed = false;
  }

  public Long getId() {
    return id;
  }

  public Long getTaskId() {
    return taskId;
  }

  public String getTitle() {
    return title;
  }

  public boolean isCompleted() {
    return completed;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
