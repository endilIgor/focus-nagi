package com.focusnagi.journal;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record JournalEntryCreateRequest(
    @NotNull(message = "is required") LocalDate entryDate,
    @NotBlank(message = "is required")
        @Size(max = 50000, message = "must be at most 50000 characters")
        String content) {}
