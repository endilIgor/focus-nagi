package com.focusnagi.journal;

import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record JournalEntryUpdateRequest(
    LocalDate entryDate,
    @Size(max = 50000, message = "must be at most 50000 characters") String content) {}
