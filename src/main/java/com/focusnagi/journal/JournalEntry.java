package com.focusnagi.journal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "journal_entry")
public class JournalEntry {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "entry_date", nullable = false)
  private LocalDate entryDate;

  @Column(nullable = false, columnDefinition = "TEXT")
  private String content;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected JournalEntry() {}

  public JournalEntry(LocalDate entryDate, String content, Instant now) {
    this.entryDate = entryDate;
    this.content = content;
    this.createdAt = now;
    this.updatedAt = now;
  }

  public void update(LocalDate entryDate, String content, Instant now) {
    if (entryDate != null) {
      this.entryDate = entryDate;
    }
    if (content != null) {
      this.content = content;
    }
    this.updatedAt = now;
  }

  public Long getId() {
    return id;
  }

  public LocalDate getEntryDate() {
    return entryDate;
  }

  public String getContent() {
    return content;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }
}
