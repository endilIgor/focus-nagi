package com.focusnagi.note;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record NoteCreateRequest(
    @NotBlank(message = "is required") @Size(max = 150, message = "must be at most 150 characters")
        String title,
    @Size(max = 20000, message = "must be at most 20000 characters") String content,
    Long projectId) {}
