package com.focusnagi.analytics;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.focusnagi.AbstractIntegrationTest;
import com.focusnagi.focus.FocusSession;
import com.focusnagi.focus.FocusSessionRepository;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

class AnalyticsIntegrationTest extends AbstractIntegrationTest {

  @Autowired MockMvc mvc;
  @Autowired FocusSessionRepository focusSessionRepository;

  /** Completed session with explicit start instant and duration in minutes. */
  private void completedSessionAt(java.time.Instant startedAt, int actualMinutes, Long projectId) {
    FocusSession session = new FocusSession(25, null, null, projectId, startedAt);
    session.finish(startedAt.plusSeconds(actualMinutes * 60L));
    focusSessionRepository.save(session);
  }

  private long createProject(String title) throws Exception {
    MvcResult result =
        mvc.perform(
                post("/api/projects")
                    .with(asOwner())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"title\": \"%s\"}".formatted(title)))
            .andExpect(status().isCreated())
            .andReturn();
    return ((Number)
            com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.id"))
        .longValue();
  }

  private void completeTask(String title) throws Exception {
    MvcResult result =
        mvc.perform(
                post("/api/tasks")
                    .with(asOwner())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"title\": \"%s\"}".formatted(title)))
            .andExpect(status().isCreated())
            .andReturn();
    long taskId =
        ((Number)
                com.jayway.jsonpath.JsonPath.read(
                    result.getResponse().getContentAsString(), "$.id"))
            .longValue();
    mvc.perform(post("/api/tasks/{id}/complete", taskId).with(asOwner()).with(csrf()))
        .andExpect(status().isOk());
  }

  private java.time.Instant todayAt(int hourUtc) {
    return LocalDate.now(ZoneOffset.UTC).atTime(LocalTime.of(hourUtc, 0)).toInstant(ZoneOffset.UTC);
  }

  @Nested
  @DisplayName("summary")
  class Summary {

    @Test
    void shouldSummarizeToday() throws Exception {
      completedSessionAt(todayAt(9), 30, null);
      completedSessionAt(todayAt(10), 45, null);
      completeTask("Task done today");

      mvc.perform(get("/api/analytics/focus/summary").with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.period").value("TODAY"))
          .andExpect(jsonPath("$.focusedMinutes").value(75))
          .andExpect(jsonPath("$.sessionCount").value(2))
          .andExpect(jsonPath("$.tasksCompleted").value(1))
          .andExpect(jsonPath("$.dateStart").value(LocalDate.now(ZoneOffset.UTC).toString()));
    }

    @Test
    void shouldSummarizeWeekAndMonth() throws Exception {
      completedSessionAt(todayAt(8), 20, null);

      mvc.perform(get("/api/analytics/focus/summary").with(asOwner()).param("period", "WEEK"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.period").value("WEEK"))
          .andExpect(jsonPath("$.focusedMinutes").value(20));

      mvc.perform(get("/api/analytics/focus/summary").with(asOwner()).param("period", "MONTH"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.focusedMinutes").value(20));
    }
  }

  @Nested
  @DisplayName("streaks")
  class Streaks {

    @Test
    void shouldComputeCurrentAndLongestStreak() throws Exception {
      completedSessionAt(todayAt(12), 25, null);
      completedSessionAt(todayAt(12).minus(java.time.Duration.ofDays(1)), 25, null);
      completedSessionAt(todayAt(12).minus(java.time.Duration.ofDays(2)), 25, null);
      // gap of two days, then an older run
      completedSessionAt(todayAt(12).minus(java.time.Duration.ofDays(5)), 25, null);
      completedSessionAt(todayAt(12).minus(java.time.Duration.ofDays(6)), 25, null);

      mvc.perform(get("/api/analytics/streaks").with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.currentStreak").value(3))
          .andExpect(jsonPath("$.longestStreak").value(3));
    }

    @Test
    void shouldNotBreakStreakWhenTodayHasNoFocusYet() throws Exception {
      completedSessionAt(todayAt(12).minus(java.time.Duration.ofDays(1)), 25, null);
      completedSessionAt(todayAt(12).minus(java.time.Duration.ofDays(2)), 25, null);

      mvc.perform(get("/api/analytics/streaks").with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.currentStreak").value(2));
    }
  }

  @Nested
  @DisplayName("breakdowns")
  class Breakdowns {

    @Test
    void shouldReturnHeatmapWithZeros() throws Exception {
      completedSessionAt(todayAt(11), 40, null);

      LocalDate today = LocalDate.now(ZoneOffset.UTC);
      mvc.perform(
              get("/api/analytics/heatmap")
                  .with(asOwner())
                  .param("from", today.minusDays(2).toString())
                  .param("to", today.toString()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.length()").value(3))
          .andExpect(jsonPath("$[0].date").value(today.minusDays(2).toString()))
          .andExpect(jsonPath("$[0].focusedMinutes").value(0))
          .andExpect(jsonPath("$[2].date").value(today.toString()))
          .andExpect(jsonPath("$[2].focusedMinutes").value(40));
    }

    @Test
    void shouldRejectOversizedHeatmapRange() throws Exception {
      mvc.perform(
              get("/api/analytics/heatmap")
                  .with(asOwner())
                  .param("from", "2024-01-01")
                  .param("to", "2026-12-31"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("ANALYTICS_RANGE_TOO_LARGE"));
    }

    @Test
    void shouldReturnFocusByDayWeekAndMonth() throws Exception {
      completedSessionAt(todayAt(10), 60, null);

      LocalDate today = LocalDate.now(ZoneOffset.UTC);
      mvc.perform(
              get("/api/analytics/focus/by-day")
                  .with(asOwner())
                  .param("from", today.minusDays(1).toString())
                  .param("to", today.toString()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.length()").value(2))
          .andExpect(jsonPath("$[1].focusedMinutes").value(60));

      mvc.perform(
              get("/api/analytics/focus/by-week")
                  .with(asOwner())
                  .param("from", today.minusDays(7).toString())
                  .param("to", today.toString()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$[0].focusedMinutes").value(60));

      mvc.perform(
              get("/api/analytics/focus/by-month")
                  .with(asOwner())
                  .param("from", today.minusMonths(1).toString())
                  .param("to", today.toString()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$[0].focusedMinutes").value(60));
    }

    @Test
    void shouldExcludeSessionsOutsideTheRequestedRangeBoundaries() throws Exception {
      LocalDate today = LocalDate.now(ZoneOffset.UTC);
      // Just before and just after the [from, to] window, to catch off-by-one errors in the
      // sargable started_at bounds used to filter these queries.
      completedSessionAt(today.minusDays(3).atTime(23, 59).toInstant(ZoneOffset.UTC), 90, null);
      completedSessionAt(today.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC), 90, null);
      completedSessionAt(todayAt(12), 20, null);

      mvc.perform(
              get("/api/analytics/focus/by-day")
                  .with(asOwner())
                  .param("from", today.minusDays(2).toString())
                  .param("to", today.toString()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.length()").value(3))
          .andExpect(jsonPath("$[0].focusedMinutes").value(0))
          .andExpect(jsonPath("$[1].focusedMinutes").value(0))
          .andExpect(jsonPath("$[2].focusedMinutes").value(20));

      mvc.perform(
              get("/api/analytics/focus/by-week")
                  .with(asOwner())
                  .param("from", today.minusDays(2).toString())
                  .param("to", today.toString()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$[0].focusedMinutes").value(20));

      mvc.perform(
              get("/api/analytics/focus/by-month")
                  .with(asOwner())
                  .param("from", today.minusDays(2).toString())
                  .param("to", today.toString()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$[0].focusedMinutes").value(20));
    }

    @Test
    void shouldReturnFocusByHour() throws Exception {
      completedSessionAt(todayAt(14), 30, null);

      mvc.perform(get("/api/analytics/focus/by-hour").with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$[0].hour").value(14))
          .andExpect(jsonPath("$[0].focusedMinutes").value(30));
    }

    @Test
    void shouldReturnFocusByProject() throws Exception {
      long projectA = createProject("Analytics A");
      createProject("Analytics B");
      completedSessionAt(todayAt(9), 30, projectA);
      completedSessionAt(todayAt(10), 15, null);

      mvc.perform(get("/api/analytics/focus/by-project").with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$[0].projectId").value((int) projectA))
          .andExpect(jsonPath("$[0].title").value("Analytics A"))
          .andExpect(jsonPath("$[0].focusedMinutes").value(30));
    }
  }
}
