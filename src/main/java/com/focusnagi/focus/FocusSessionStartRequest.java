package com.focusnagi.focus;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record FocusSessionStartRequest(
    @NotNull(message = "is required")
        @Min(value = 1, message = "must be at least 1")
        @Max(value = 1440, message = "must be at most 1440")
        Integer plannedFocusMinutes,
    @Min(value = 0, message = "must be at least 0")
        @Max(value = 1440, message = "must be at most 1440")
        Integer plannedBreakMinutes,
    Long taskId,
    Long projectId,
    @Size(max = 2000, message = "must be at most 2000 characters") String notes) {}
