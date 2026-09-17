package com.focusnagi.today;

import com.focusnagi.focus.FocusSessionResponse;
import java.time.LocalDate;
import java.util.List;

public record TodayResponse(
    LocalDate date,
    FocusSessionResponse currentSession,
    long focusedMinutesToday,
    long sessionsToday,
    long tasksCompletedToday,
    List<TodayTaskResponse> tasksDueToday,
    List<TodayTaskResponse> overdueTasks,
    List<TodayProjectResponse> activeProjects,
    List<TodayGoalResponse> goals) {}
