package com.focusnagi.goal;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.focusnagi.AbstractIntegrationTest;
import com.focusnagi.focus.FocusSession;
import com.focusnagi.focus.FocusSessionRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

class GoalIntegrationTest extends AbstractIntegrationTest {

  @Autowired MockMvc mvc;
  @Autowired FocusSessionRepository focusSessionRepository;

  private long createGoal(String body) throws Exception {
    MvcResult result =
        mvc.perform(
                post("/api/goals")
                    .with(asOwner())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body))
            .andExpect(status().isCreated())
            .andReturn();
    return ((Number)
            com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.id"))
        .longValue();
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

  /** Persists a COMPLETED focus session with the given actual minutes, started now. */
  private void completedSession(int actualMinutes, Long projectId) {
    Instant now = Instant.now();
    FocusSession session = new FocusSession(25, null, null, projectId, now.minusSeconds(3600));
    session.finish(now.minusSeconds(3600 - actualMinutes * 60L));
    focusSessionRepository.save(session);
  }

  private long completeTask(String title, Long projectId) throws Exception {
    String body =
        projectId == null
            ? "{\"title\": \"%s\"}".formatted(title)
            : "{\"title\": \"%s\", \"projectId\": %d}".formatted(title, projectId);
    MvcResult result =
        mvc.perform(
                post("/api/tasks")
                    .with(asOwner())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body))
            .andExpect(status().isCreated())
            .andReturn();
    long taskId =
        ((Number)
                com.jayway.jsonpath.JsonPath.read(
                    result.getResponse().getContentAsString(), "$.id"))
            .longValue();
    mvc.perform(post("/api/tasks/{id}/complete", taskId).with(asOwner()).with(csrf()))
        .andExpect(status().isOk());
    return taskId;
  }

  @Nested
  @DisplayName("crud")
  class Crud {

    @Test
    void shouldCreateGoal() throws Exception {
      mvc.perform(
              post("/api/goals")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      """
                      {"title": "Daily focus", "type": "FOCUS_MINUTES", "targetValue": 120,
                       "period": "DAILY", "startDate": "2026-09-01"}
                      """))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.status").value("ACTIVE"))
          .andExpect(jsonPath("$.targetValue").value(120));
    }

    @Test
    void shouldRejectInvalidGoal() throws Exception {
      mvc.perform(
              post("/api/goals")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"title\": \"Bad\", \"type\": \"FOCUS_MINUTES\", \"targetValue\": 0,"
                          + " \"period\": \"DAILY\", \"startDate\": \"2026-09-01\"}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

      mvc.perform(
              post("/api/goals")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"title\": \"Bad dates\", \"type\": \"FOCUS_SESSIONS\", \"targetValue\": 5,"
                          + " \"period\": \"CUSTOM\", \"startDate\": \"2026-09-10\", \"endDate\": \"2026-09-01\"}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("GOAL_INVALID_DATES"));

      mvc.perform(
              post("/api/goals")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"title\": \"No project\", \"type\": \"TASKS_COMPLETED\", \"targetValue\": 3,"
                          + " \"period\": \"DAILY\", \"startDate\": \"2026-09-01\", \"projectId\": 987654}"))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }

    @Test
    void shouldUpdateGoal() throws Exception {
      long id =
          createGoal(
              "{\"title\": \"Old\", \"type\": \"FOCUS_MINUTES\", \"targetValue\": 30,"
                  + " \"period\": \"WEEKLY\", \"startDate\": \"2026-09-01\"}");
      mvc.perform(
              patch("/api/goals/{id}", id)
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"title\": \"New\", \"targetValue\": 60}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.title").value("New"))
          .andExpect(jsonPath("$.targetValue").value(60));
    }

    @Test
    void shouldListAndGetGoals() throws Exception {
      long id =
          createGoal(
              "{\"title\": \"Listable\", \"type\": \"FOCUS_SESSIONS\", \"targetValue\": 4,"
                  + " \"period\": \"MONTHLY\", \"startDate\": \"2026-09-01\"}");
      mvc.perform(get("/api/goals").with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].title").value(org.hamcrest.Matchers.hasItem("Listable")));
      mvc.perform(get("/api/goals/{id}", id).with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.title").value("Listable"));
      mvc.perform(get("/api/goals/987654").with(asOwner()))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value("GOAL_NOT_FOUND"));
    }

    @Test
    void shouldCompleteArchiveAndRestoreGoal() throws Exception {
      long id =
          createGoal(
              "{\"title\": \"Lifecycle\", \"type\": \"FOCUS_MINUTES\", \"targetValue\": 30,"
                  + " \"period\": \"DAILY\", \"startDate\": \"2026-09-01\"}");
      mvc.perform(post("/api/goals/{id}/complete", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("COMPLETED"));
      mvc.perform(post("/api/goals/{id}/complete", id).with(asOwner()).with(csrf()))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("INVALID_GOAL_STATE"));
      mvc.perform(post("/api/goals/{id}/archive", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("ARCHIVED"));
      mvc.perform(post("/api/goals/{id}/restore", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("ACTIVE"));
    }
  }

  @Nested
  @DisplayName("progress")
  class Progress {

    @Test
    void shouldComputeFocusMinutesProgressForToday() throws Exception {
      long id =
          createGoal(
              "{\"title\": \"90 min\", \"type\": \"FOCUS_MINUTES\", \"targetValue\": 90,"
                  + " \"period\": \"DAILY\", \"startDate\": \"2026-09-01\"}");
      completedSession(60, null);

      mvc.perform(get("/api/goals/{id}/progress", id).with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.currentValue").value(60))
          .andExpect(jsonPath("$.targetValue").value(90))
          .andExpect(jsonPath("$.done").value(false))
          .andExpect(jsonPath("$.periodStart").value(LocalDate.now(ZoneOffset.UTC).toString()))
          .andExpect(jsonPath("$.periodEnd").value(LocalDate.now(ZoneOffset.UTC).toString()));

      completedSession(45, null);
      mvc.perform(get("/api/goals/{id}/progress", id).with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.currentValue").value(105))
          .andExpect(jsonPath("$.done").value(true));
    }

    @Test
    void shouldComputeFocusSessionsProgress() throws Exception {
      long id =
          createGoal(
              "{\"title\": \"4 pomodoros\", \"type\": \"FOCUS_SESSIONS\", \"targetValue\": 2,"
                  + " \"period\": \"DAILY\", \"startDate\": \"2026-09-01\"}");
      completedSession(25, null);
      completedSession(25, null);

      mvc.perform(get("/api/goals/{id}/progress", id).with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.currentValue").value(2))
          .andExpect(jsonPath("$.done").value(true));
    }

    @Test
    void shouldComputeTasksCompletedProgress() throws Exception {
      long id =
          createGoal(
              "{\"title\": \"Ship tasks\", \"type\": \"TASKS_COMPLETED\", \"targetValue\": 3,"
                  + " \"period\": \"DAILY\", \"startDate\": \"2026-09-01\"}");
      completeTask("T1", null);
      completeTask("T2", null);

      mvc.perform(get("/api/goals/{id}/progress", id).with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.currentValue").value(2))
          .andExpect(jsonPath("$.done").value(false));
    }

    @Test
    void shouldScopeProgressToGoalProject() throws Exception {
      long projectA = createProject("GoalProject A");
      createProject("OtherProject B");
      long id =
          createGoal(
              "{\"title\": \"Project scoped\", \"type\": \"FOCUS_MINUTES\", \"targetValue\": 50,"
                  + " \"period\": \"DAILY\", \"startDate\": \"2026-09-01\", \"projectId\": %d}"
                      .formatted(projectA));
      completedSession(30, projectA);
      completedSession(90, null); // not part of the goal's project

      mvc.perform(get("/api/goals/{id}/progress", id).with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.currentValue").value(30));
    }

    @Test
    void shouldReportWeeklyWindowBoundaries() throws Exception {
      long id =
          createGoal(
              "{\"title\": \"Weekly\", \"type\": \"FOCUS_MINUTES\", \"targetValue\": 300,"
                  + " \"period\": \"WEEKLY\", \"startDate\": \"2026-09-01\"}");
      LocalDate today = LocalDate.now(ZoneOffset.UTC);
      LocalDate monday =
          today.with(
              java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY));
      LocalDate sunday =
          today.with(java.time.temporal.TemporalAdjusters.nextOrSame(java.time.DayOfWeek.SUNDAY));

      mvc.perform(get("/api/goals/{id}/progress", id).with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.periodStart").value(monday.toString()))
          .andExpect(jsonPath("$.periodEnd").value(sunday.toString()));
    }
  }
}
