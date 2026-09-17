package com.focusnagi.analytics;

import com.focusnagi.common.DomainException;
import com.focusnagi.focus.FocusSessionRepository;
import com.focusnagi.task.TaskRepository;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Aggregated read model over focus sessions, tasks and goals. All day/week/month boundaries are
 * computed in the configured app timezone ({@code APP_TIME_ZONE}, default UTC); focused minutes are
 * whole minutes (seconds / 60, floored). Only COMPLETED sessions count.
 */
@Service
public class AnalyticsService {

  private static final long MAX_HEATMAP_DAYS = 366;

  private final FocusSessionRepository focusSessionRepository;
  private final TaskRepository taskRepository;
  private final Clock clock;
  private final ZoneId zoneId;

  public AnalyticsService(
      FocusSessionRepository focusSessionRepository,
      TaskRepository taskRepository,
      Clock clock,
      ZoneId appZoneId) {
    this.focusSessionRepository = focusSessionRepository;
    this.taskRepository = taskRepository;
    this.clock = clock;
    this.zoneId = appZoneId;
  }

  @Transactional(readOnly = true)
  public FocusSummaryResponse summary(AnalyticsPeriod period) {
    AnalyticsPeriod p = period == null ? AnalyticsPeriod.TODAY : period;
    LocalDate[] window =
        switch (p) {
          case TODAY -> new LocalDate[] {today(), today()};
          case WEEK ->
              new LocalDate[] {
                today().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)),
                today().with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY))
              };
          case MONTH ->
              new LocalDate[] {
                today().with(TemporalAdjusters.firstDayOfMonth()),
                today().with(TemporalAdjusters.lastDayOfMonth())
              };
        };
    Instant from = window[0].atStartOfDay(zoneId).toInstant();
    Instant to = window[1].plusDays(1).atStartOfDay(zoneId).toInstant();
    long focusedSeconds = focusSessionRepository.sumFocusSecondsBetween(from, to, null);
    long sessionCount = focusSessionRepository.countCompletedBetween(from, to, null);
    long tasksCompleted = taskRepository.countCompletedBetween(from, to, null);
    return new FocusSummaryResponse(
        p, window[0], window[1], focusedSeconds / 60, sessionCount, tasksCompleted);
  }

  /**
   * Streak semantics: a day counts when it has at least one COMPLETED focus minute. The current
   * streak is the run of counting days ending today, or ending yesterday when today has no focus
   * yet (the day is not over). The longest streak is the maximum run over all history.
   */
  @Transactional(readOnly = true)
  public StreaksResponse streaks() {
    List<LocalDate> days =
        focusSessionRepository.daysWithFocus(zoneId.getId()).stream()
            .map(LocalDate::parse)
            .toList();
    Set<LocalDate> focusDays = new HashSet<>(days);

    long current = 0;
    LocalDate cursor = focusDays.contains(today()) ? today() : today().minusDays(1);
    while (focusDays.contains(cursor)) {
      current++;
      cursor = cursor.minusDays(1);
    }

    long longest = 0;
    long run = 0;
    LocalDate previous = null;
    for (LocalDate day : days) {
      run = (previous != null && day.equals(previous.plusDays(1))) ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = day;
    }
    return new StreaksResponse(current, longest);
  }

  @Transactional(readOnly = true)
  public List<DayFocusResponse> heatmap(LocalDate from, LocalDate to) {
    LocalDate[] range = requireValidRange(from, to, MAX_HEATMAP_DAYS);
    return focusSessionRepository.dailyFocus(range[0], range[1], zoneId.getId()).stream()
        .map(row -> new DayFocusResponse(row.getDay(), row.getSeconds() / 60))
        .toList();
  }

  @Transactional(readOnly = true)
  public List<DayFocusResponse> focusByDay(LocalDate from, LocalDate to) {
    LocalDate end = to == null ? today() : to;
    LocalDate start = from == null ? end.minusDays(29) : from;
    return heatmap(start, end);
  }

  @Transactional(readOnly = true)
  public List<WeekFocusResponse> focusByWeek(LocalDate from, LocalDate to) {
    LocalDate end = to == null ? today() : to;
    LocalDate start = from == null ? end.minusDays(83) : from;
    requireValidRange(start, end, 372);
    return focusSessionRepository.weeklyFocus(start, end, zoneId.getId()).stream()
        .map(row -> new WeekFocusResponse(row.getWeekStart(), row.getSeconds() / 60))
        .toList();
  }

  @Transactional(readOnly = true)
  public List<MonthFocusResponse> focusByMonth(LocalDate from, LocalDate to) {
    LocalDate end = to == null ? today() : to;
    LocalDate start = from == null ? end.minusMonths(12) : from;
    requireValidRange(start, end, 366 * 5);
    return focusSessionRepository.monthlyFocus(start, end, zoneId.getId()).stream()
        .map(row -> new MonthFocusResponse(row.getMonth(), row.getSeconds() / 60))
        .toList();
  }

  @Transactional(readOnly = true)
  public List<HourFocusResponse> focusByHour(LocalDate from, LocalDate to) {
    Instant fromInstant = from == null ? Instant.EPOCH : from.atStartOfDay(zoneId).toInstant();
    Instant toInstant =
        to == null ? clock.instant() : to.plusDays(1).atStartOfDay(zoneId).toInstant();
    return focusSessionRepository.hourlyFocus(fromInstant, toInstant, zoneId.getId()).stream()
        .map(row -> new HourFocusResponse(row.getHour(), row.getSeconds() / 60))
        .toList();
  }

  @Transactional(readOnly = true)
  public List<ProjectFocusBreakdownResponse> focusByProject() {
    return focusSessionRepository.focusByProject().stream()
        .map(
            row ->
                new ProjectFocusBreakdownResponse(
                    row.getProjectId(), row.getTitle(), row.getSeconds() / 60))
        .toList();
  }

  private LocalDate today() {
    return LocalDate.ofInstant(clock.instant(), zoneId);
  }

  private LocalDate[] requireValidRange(LocalDate from, LocalDate to, long maxDays) {
    if (from == null || to == null || to.isBefore(from)) {
      throw DomainException.badRequest("ANALYTICS_INVALID_RANGE", "Invalid date range.");
    }
    if (java.time.temporal.ChronoUnit.DAYS.between(from, to) >= maxDays) {
      throw DomainException.badRequest("ANALYTICS_RANGE_TOO_LARGE", "Date range is too large.");
    }
    return new LocalDate[] {from, to};
  }
}
