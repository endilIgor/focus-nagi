package com.focusnagi.today;

import com.focusnagi.task.TaskPriority;
import java.time.LocalDate;

public record TodayTaskResponse(
    Long id, String title, LocalDate dueDate, TaskPriority priority, Long projectId) {}
