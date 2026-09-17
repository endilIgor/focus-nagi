package com.focusnagi.goal;

import com.focusnagi.common.DomainException;
import com.focusnagi.focus.FocusSessionRepository;
import com.focusnagi.project.ProjectRepository;
import com.focusnagi.task.TaskRepository;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GoalService {

  static final int MAX_PAGE_SIZE = 100;

  private final GoalRepository goalRepository;
  private final FocusSessionRepository focusSessionRepository;
  private final TaskRepository taskRepository;
  private final ProjectRepository projectRepository;
  private final Clock clock;
  private final ZoneId zoneId;

  public GoalService(
      GoalRepository goalRepository,
      FocusSessionRepository focusSessionRepository,
      TaskRepository taskRepository,
      ProjectRepository projectRepository,
      Clock clock,
      ZoneId appZoneId) {
    this.goalRepository = goalRepository;
    this.focusSessionRepository = focusSessionRepository;
    this.taskRepository = taskRepository;
    this.projectRepository = projectRepository;
    this.clock = clock;
    this.zoneId = appZoneId;
  }

  @Transactional
  public GoalResponse create(GoalCreateRequest request) {
    validateDates(request.startDate(), request.endDate());
    if (request.projectId() != null && !projectRepository.existsById(request.projectId())) {
      throw DomainException.notFound("PROJECT_NOT_FOUND", "Project not found.");
    }
    Goal goal =
        new Goal(
            request.title().trim(),
            request.description(),
            request.type(),
            request.targetValue(),
            request.period(),
            request.startDate(),
            request.endDate(),
            request.projectId(),
            clock.instant());
    return GoalResponse.from(goalRepository.save(goal));
  }

  @Transactional(readOnly = true)
  public Page<GoalResponse> list(GoalStatus status, int page, int size) {
    Pageable pageable =
        PageRequest.of(
            Math.max(page, 0),
            Math.min(Math.max(size, 1), MAX_PAGE_SIZE),
            Sort.by(Sort.Direction.DESC, "createdAt"));
    Page<Goal> goals =
        status == null
            ? goalRepository.findAll(pageable)
            : goalRepository.findByStatus(status, pageable);
    return goals.map(GoalResponse::from);
  }

  @Transactional(readOnly = true)
  public GoalResponse get(long id) {
    return GoalResponse.from(find(id));
  }

  @Transactional
  public GoalResponse update(long id, GoalUpdateRequest request) {
    Goal goal = find(id);
    LocalDate startDate = request.startDate() == null ? goal.getStartDate() : request.startDate();
    LocalDate endDate =
        request.endDate() == null && request.startDate() == null
            ? goal.getEndDate()
            : request.endDate();
    goal.update(
        request.title() == null ? null : request.title().trim(),
        request.description(),
        request.targetValue(),
        startDate,
        endDate,
        clock.instant());
    return GoalResponse.from(goalRepository.save(goal));
  }

  @Transactional
  public GoalResponse complete(long id) {
    Goal goal = find(id);
    goal.complete(clock.instant());
    return GoalResponse.from(goalRepository.save(goal));
  }

  @Transactional
  public GoalResponse archive(long id) {
    Goal goal = find(id);
    goal.archive(clock.instant());
    return GoalResponse.from(goalRepository.save(goal));
  }

  @Transactional
  public GoalResponse restore(long id) {
    Goal goal = find(id);
    goal.restore(clock.instant());
    return GoalResponse.from(goalRepository.save(goal));
  }

  @Transactional(readOnly = true)
  public GoalProgressResponse progress(long id) {
    Goal goal = find(id);
    LocalDate[] window = currentWindow(goal);
    Instant from = window[0].atStartOfDay(zoneId).toInstant();
    Instant to = window[1].plusDays(1).atStartOfDay(zoneId).toInstant();

    long current =
        switch (goal.getType()) {
          case FOCUS_MINUTES ->
              focusSessionRepository.sumFocusSecondsBetween(from, to, goal.getProjectId()) / 60;
          case FOCUS_SESSIONS ->
              focusSessionRepository.countCompletedBetween(from, to, goal.getProjectId());
          case TASKS_COMPLETED ->
              taskRepository.countCompletedBetween(from, to, goal.getProjectId());
        };

    return new GoalProgressResponse(
        goal.getId(),
        goal.getType(),
        current,
        goal.getTargetValue(),
        current >= goal.getTargetValue(),
        window[0],
        window[1]);
  }

  /**
   * Resolves the current progress window for the goal. DAILY/WEEKLY/MONTHLY track the rolling
   * calendar window containing today (in the configured app timezone); CUSTOM uses the goal's own
   * date range.
   */
  LocalDate[] currentWindow(Goal goal) {
    if (goal.getPeriod() == GoalPeriod.CUSTOM) {
      LocalDate end = goal.getEndDate() == null ? goal.getStartDate() : goal.getEndDate();
      return new LocalDate[] {goal.getStartDate(), end};
    }
    LocalDate today = LocalDate.ofInstant(clock.instant(), zoneId);
    return switch (goal.getPeriod()) {
      case DAILY -> new LocalDate[] {today, today};
      case WEEKLY ->
          new LocalDate[] {
            today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)),
            today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY))
          };
      case MONTHLY ->
          new LocalDate[] {
            today.with(TemporalAdjusters.firstDayOfMonth()),
            today.with(TemporalAdjusters.lastDayOfMonth())
          };
      case CUSTOM -> throw new IllegalStateException("handled above");
    };
  }

  Goal find(long id) {
    return goalRepository
        .findById(id)
        .orElseThrow(() -> DomainException.notFound("GOAL_NOT_FOUND", "Goal not found."));
  }

  private void validateDates(LocalDate startDate, LocalDate endDate) {
    if (endDate != null && startDate != null && endDate.isBefore(startDate)) {
      throw DomainException.badRequest(
          "GOAL_INVALID_DATES", "End date cannot be before start date.");
    }
  }
}
