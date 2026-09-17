package com.focusnagi.journal;

import java.time.Instant;
import java.time.LocalDate;

public record JournalEntryResponse(
    Long id, LocalDate entryDate, String content, Instant createdAt, Instant updatedAt) {

  static JournalEntryResponse from(JournalEntry entry) {
    return new JournalEntryResponse(
        entry.getId(),
        entry.getEntryDate(),
        entry.getContent(),
        entry.getCreatedAt(),
        entry.getUpdatedAt());
  }
}
