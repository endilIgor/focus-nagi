package com.focusnagi.focus;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FocusSessionRepository
    extends JpaRepository<FocusSession, Long>, JpaSpecificationExecutor<FocusSession> {

  boolean existsByStatusIn(List<FocusSessionStatus> statuses);

  boolean existsByTaskId(Long taskId);

  @Query(
      "select coalesce(sum(f.actualFocusSeconds), 0) from FocusSession f"
          + " where f.projectId = :projectId and f.status = 'COMPLETED'")
  long sumFocusSecondsByProject(@Param("projectId") long projectId);

  @Query(
      "select coalesce(sum(f.actualFocusSeconds), 0) from FocusSession f"
          + " where f.status = 'COMPLETED' and f.startedAt >= :from and f.startedAt < :to"
          + " and (:projectId is null or f.projectId = :projectId)")
  long sumFocusSecondsBetween(
      @Param("from") Instant from, @Param("to") Instant to, @Param("projectId") Long projectId);

  @Query(
      "select count(f) from FocusSession f"
          + " where f.status = 'COMPLETED' and f.startedAt >= :from and f.startedAt < :to"
          + " and (:projectId is null or f.projectId = :projectId)")
  long countCompletedBetween(
      @Param("from") Instant from, @Param("to") Instant to, @Param("projectId") Long projectId);

  interface DailyFocusRow {
    java.time.LocalDate getDay();

    long getSeconds();
  }

  interface WeekFocusRow {
    java.time.LocalDate getWeekStart();

    long getSeconds();
  }

  interface MonthFocusRow {
    String getMonth();

    long getSeconds();
  }

  interface HourFocusRow {
    int getHour();

    long getSeconds();
  }

  interface ProjectFocusRow {
    Long getProjectId();

    String getTitle();

    long getSeconds();
  }

  @Query(
      value =
          """
          SELECT d.day::date AS day, COALESCE(SUM(f.actual_focus_seconds), 0) AS seconds
          FROM generate_series(CAST(:from AS date), CAST(:to AS date), INTERVAL '1 day') AS d(day)
          LEFT JOIN focus_session f
            ON f.status = 'COMPLETED'
           AND f.started_at >= :fromInstant AND f.started_at < :toInstant
           AND (f.started_at AT TIME ZONE CAST(:zone AS text))::date = d.day::date
          GROUP BY d.day
          ORDER BY d.day
          """,
      nativeQuery = true)
  List<DailyFocusRow> dailyFocus(
      @Param("from") java.time.LocalDate from,
      @Param("to") java.time.LocalDate to,
      @Param("fromInstant") Instant fromInstant,
      @Param("toInstant") Instant toInstant,
      @Param("zone") String zone);

  @Query(
      value =
          """
          SELECT DISTINCT (started_at AT TIME ZONE CAST(:zone AS text))::date::text AS day
          FROM focus_session
          WHERE status = 'COMPLETED' AND actual_focus_seconds > 0
          ORDER BY 1
          """,
      nativeQuery = true)
  List<String> daysWithFocus(@Param("zone") String zone);

  @Query(
      value =
          """
          SELECT date_trunc('week', f.started_at AT TIME ZONE CAST(:zone AS text))::date AS weekStart,
                 SUM(f.actual_focus_seconds) AS seconds
          FROM focus_session f
          WHERE f.status = 'COMPLETED'
            AND f.started_at >= :fromInstant AND f.started_at < :toInstant
          GROUP BY 1
          ORDER BY 1
          """,
      nativeQuery = true)
  List<WeekFocusRow> weeklyFocus(
      @Param("fromInstant") Instant fromInstant,
      @Param("toInstant") Instant toInstant,
      @Param("zone") String zone);

  @Query(
      value =
          """
          SELECT to_char(date_trunc('month', f.started_at AT TIME ZONE CAST(:zone AS text)), 'YYYY-MM') AS month,
                 SUM(f.actual_focus_seconds) AS seconds
          FROM focus_session f
          WHERE f.status = 'COMPLETED'
            AND f.started_at >= :fromInstant AND f.started_at < :toInstant
          GROUP BY 1
          ORDER BY 1
          """,
      nativeQuery = true)
  List<MonthFocusRow> monthlyFocus(
      @Param("fromInstant") Instant fromInstant,
      @Param("toInstant") Instant toInstant,
      @Param("zone") String zone);

  @Query(
      value =
          """
          SELECT EXTRACT(HOUR FROM f.started_at AT TIME ZONE CAST(:zone AS text))::int AS hour,
                 SUM(f.actual_focus_seconds) AS seconds
          FROM focus_session f
          WHERE f.status = 'COMPLETED'
            AND f.started_at >= :fromInstant AND f.started_at < :toInstant
          GROUP BY 1
          ORDER BY 1
          """,
      nativeQuery = true)
  List<HourFocusRow> hourlyFocus(
      @Param("fromInstant") Instant fromInstant,
      @Param("toInstant") Instant toInstant,
      @Param("zone") String zone);

  @Query(
      value =
          """
          SELECT f.project_id AS projectId, p.title AS title,
                 SUM(f.actual_focus_seconds) AS seconds
          FROM focus_session f
          LEFT JOIN project p ON p.id = f.project_id
          WHERE f.status = 'COMPLETED'
          GROUP BY f.project_id, p.title
          ORDER BY seconds DESC
          """,
      nativeQuery = true)
  List<ProjectFocusRow> focusByProject();
}
