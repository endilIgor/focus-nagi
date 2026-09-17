package com.focusnagi.today;

import com.focusnagi.focus.FocusSessionRepository;
import com.focusnagi.focus.FocusSessionResponse;
import com.focusnagi.focus.FocusSessionService;
import com.focusnagi.goal.Goal;
import com.focusnagi.goal.GoalProgressResponse;
import com.focusnagi.goal.GoalRepository;
import com.focusnagi.goal.GoalService;
import com.focusnagi.goal.GoalStatus;
import com.focusnagi.project.ProjectRepository;
import com.focusnagi.project.ProjectStatus;
import com.focusnagi.task.Task;
import com.focusnagi.task.TaskRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TodayService {

  private final FocusSessionService focusSessionService;
  private final FocusSessionRepository focusSessionRepository;
  private final TaskRepository taskRepository;
  private final ProjectRepository projectRepository;
  private final GoalRepository goalRepository;
  private final GoalService goalService;
  private final Clock clock;
  private final ZoneId zoneId;

  public TodayService(
      FocusSessionService focusSessionService,
      FocusSessionRepository focusSessionRepository,
      TaskRepository taskRepository,
      ProjectRepository projectRepository,
      GoalRepository goalRepository,
      GoalService goalService,
      Clock clock,
      ZoneId appZoneId) {
    this.focusSessionService = focusSessionService;
    this.focusSessionRepository = focusSessionRepository;
    this.taskRepository = taskRepository;
    this.projectRepository = projectRepository;
    this.goalRepository = goalRepository;
    this.goalService = goalService;
    this.clock = clock;
    this.zoneId = appZoneId;
  }

  @Transactional(readOnly = true)
  public TodayResponse today() {
    LocalDate today = LocalDate.ofInstant(clock.instant(), zoneId);
    Instant dayStart = today.atStartOfDay(zoneId).toInstant();
    Instant dayEnd = today.plusDays(1).atStartOfDay(zoneId).toInstant();

    FocusSessionResponse current = focusSessionService.currentOrNull();
    long focusedSeconds = focusSessionRepository.sumFocusSecondsBetween(dayStart, dayEnd, null);
    long sessionsToday = focusSessionRepository.countCompletedBetween(dayStart, dayEnd, null);
    long tasksCompletedToday = taskRepository.countCompletedBetween(dayStart, dayEnd, null);

    List<TodayTaskResponse> dueToday =
        taskRepository.findPendingDueOn(today).stream().map(this::toTaskResponse).toList();
    List<TodayTaskResponse> overdue =
        taskRepository.findOverdue(today).stream().map(this::toTaskResponse).toList();

    List<TodayProjectResponse> activeProjects =
        projectRepository.findByStatus(ProjectStatus.ACTIVE).stream()
            .map(p -> new TodayProjectResponse(p.getId(), p.getTitle()))
            .toList();

    List<TodayGoalResponse> goals =
        goalRepository.findByStatus(GoalStatus.ACTIVE).stream().map(this::toGoalResponse).toList();

    return new TodayResponse(
        today,
        current,
        focusedSeconds / 60,
        sessionsToday,
        tasksCompletedToday,
        dueToday,
        overdue,
        activeProjects,
        goals);
  }

  private TodayTaskResponse toTaskResponse(Task task) {
    return new TodayTaskResponse(
        task.getId(), task.getTitle(), task.getDueDate(), task.getPriority(), task.getProjectId());
  }

  private TodayGoalResponse toGoalResponse(Goal goal) {
    GoalProgressResponse progress = goalService.progress(goal.getId());
    return new TodayGoalResponse(
        goal.getId(),
        goal.getTitle(),
        goal.getType(),
        progress.currentValue(),
        progress.targetValue(),
        progress.done());
  }
}
