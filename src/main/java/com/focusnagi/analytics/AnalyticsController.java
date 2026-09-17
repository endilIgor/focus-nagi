package com.focusnagi.analytics;

import java.time.LocalDate;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

  private final AnalyticsService analyticsService;

  public AnalyticsController(AnalyticsService analyticsService) {
    this.analyticsService = analyticsService;
  }

  @GetMapping("/focus/summary")
  FocusSummaryResponse summary(@RequestParam(defaultValue = "TODAY") AnalyticsPeriod period) {
    return analyticsService.summary(period);
  }

  @GetMapping("/streaks")
  StreaksResponse streaks() {
    return analyticsService.streaks();
  }

  @GetMapping("/heatmap")
  List<DayFocusResponse> heatmap(@RequestParam LocalDate from, @RequestParam LocalDate to) {
    return analyticsService.heatmap(from, to);
  }

  @GetMapping("/focus/by-day")
  List<DayFocusResponse> focusByDay(
      @RequestParam(required = false) LocalDate from,
      @RequestParam(required = false) LocalDate to) {
    return analyticsService.focusByDay(from, to);
  }

  @GetMapping("/focus/by-week")
  List<WeekFocusResponse> focusByWeek(
      @RequestParam(required = false) LocalDate from,
      @RequestParam(required = false) LocalDate to) {
    return analyticsService.focusByWeek(from, to);
  }

  @GetMapping("/focus/by-month")
  List<MonthFocusResponse> focusByMonth(
      @RequestParam(required = false) LocalDate from,
      @RequestParam(required = false) LocalDate to) {
    return analyticsService.focusByMonth(from, to);
  }

  @GetMapping("/focus/by-hour")
  List<HourFocusResponse> focusByHour(
      @RequestParam(required = false) LocalDate from,
      @RequestParam(required = false) LocalDate to) {
    return analyticsService.focusByHour(from, to);
  }

  @GetMapping("/focus/by-project")
  List<ProjectFocusBreakdownResponse> focusByProject() {
    return analyticsService.focusByProject();
  }
}
