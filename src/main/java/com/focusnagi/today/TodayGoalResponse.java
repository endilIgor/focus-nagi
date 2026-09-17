package com.focusnagi.today;

import com.focusnagi.goal.GoalType;

public record TodayGoalResponse(
    long id, String title, GoalType type, long currentValue, int targetValue, boolean done) {}
