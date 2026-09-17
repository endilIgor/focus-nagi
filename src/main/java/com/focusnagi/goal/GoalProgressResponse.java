package com.focusnagi.goal;

import java.time.LocalDate;

public record GoalProgressResponse(
    long goalId,
    GoalType type,
    long currentValue,
    int targetValue,
    boolean done,
    LocalDate periodStart,
    LocalDate periodEnd) {}
