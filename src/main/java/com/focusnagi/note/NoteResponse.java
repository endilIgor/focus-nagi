package com.focusnagi.note;

import java.time.Instant;

public record NoteResponse(
    Long id,
    String title,
    String content,
    boolean pinned,
    Long projectId,
    Instant createdAt,
    Instant updatedAt) {

  static NoteResponse from(Note note) {
    return new NoteResponse(
        note.getId(),
        note.getTitle(),
        note.getContent(),
        note.isPinned(),
        note.getProjectId(),
        note.getCreatedAt(),
        note.getUpdatedAt());
  }
}
