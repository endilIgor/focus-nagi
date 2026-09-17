package com.focusnagi.task;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record TaskUpdateRequest(
    @Size(max = 200, message = "must be at most 200 characters") String title,
    @Size(max = 5000, message = "must be at most 5000 characters") String description,
    TaskPriority priority,
    @Min(value = 1, message = "must be at least 1")
        @Max(value = 10080, message = "must be at most 10080")
        Integer estimatedMinutes,
    LocalDate dueDate,
    Long projectId) {}
