package com.focusnagi.analytics;

import java.time.LocalDate;

public record FocusSummaryResponse(
    AnalyticsPeriod period,
    LocalDate dateStart,
    LocalDate dateEnd,
    long focusedMinutes,
    long sessionCount,
    long tasksCompleted) {}
