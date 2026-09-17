package com.focusnagi.goal;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record GoalUpdateRequest(
    @Size(max = 150, message = "must be at most 150 characters") String title,
    @Size(max = 2000, message = "must be at most 2000 characters") String description,
    @Min(value = 1, message = "must be at least 1")
        @Max(value = 1000000, message = "must be at most 1000000")
        Integer targetValue,
    LocalDate startDate,
    LocalDate endDate) {}
