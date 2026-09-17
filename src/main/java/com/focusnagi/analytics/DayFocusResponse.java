package com.focusnagi.analytics;

import java.time.LocalDate;

public record DayFocusResponse(LocalDate date, long focusedMinutes) {}
