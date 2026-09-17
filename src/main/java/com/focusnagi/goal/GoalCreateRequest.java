package com.focusnagi.goal;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record GoalCreateRequest(
    @NotBlank(message = "is required") @Size(max = 150, message = "must be at most 150 characters")
        String title,
    @Size(max = 2000, message = "must be at most 2000 characters") String description,
    @NotNull(message = "is required") GoalType type,
    @NotNull(message = "is required")
        @Min(value = 1, message = "must be at least 1")
        @Max(value = 1000000, message = "must be at most 1000000")
        Integer targetValue,
    @NotNull(message = "is required") GoalPeriod period,
    @NotNull(message = "is required") LocalDate startDate,
    LocalDate endDate,
    Long projectId) {}
