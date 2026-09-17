package com.focusnagi.project;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record ProjectCreateRequest(
    @NotBlank(message = "is required") @Size(max = 120, message = "must be at most 120 characters")
        String title,
    @Size(max = 2000, message = "must be at most 2000 characters") String description,
    LocalDate startDate,
    LocalDate dueDate) {}
