package com.focusnagi.analytics;

import java.time.LocalDate;

public record WeekFocusResponse(LocalDate weekStart, long focusedMinutes) {}
