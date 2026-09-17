package com.focusnagi.note;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "note")
public class Note {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 150)
  private String title;

  @Column(columnDefinition = "TEXT")
  private String content;

  @Column(nullable = false)
  private boolean pinned;

  @Column(name = "project_id")
  private Long projectId;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected Note() {}

  public Note(String title, String content, Long projectId, Instant now) {
    this.title = title;
    this.content = content;
    this.projectId = projectId;
    this.createdAt = now;
    this.updatedAt = now;
  }

  public void update(String title, String content, Long projectId, Instant now) {
    if (title != null) {
      this.title = title;
    }
    this.content = content;
    this.projectId = projectId;
    this.updatedAt = now;
  }

  public void pin() {
    this.pinned = true;
  }

  public void unpin() {
    this.pinned = false;
  }

  public Long getId() {
    return id;
  }

  public String getTitle() {
    return title;
  }

  public String getContent() {
    return content;
  }

  public boolean isPinned() {
    return pinned;
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
