package com.focusnagi.focus;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.focusnagi.AbstractIntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

class FocusSessionIntegrationTest extends AbstractIntegrationTest {

  @Autowired MockMvc mvc;

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

  private long createTask(String title, Long projectId) throws Exception {
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
    return ((Number)
            com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.id"))
        .longValue();
  }

  private long startSession(String body) throws Exception {
    MvcResult result =
        mvc.perform(
                post("/api/focus-sessions")
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

  @Nested
  @DisplayName("start")
  class Start {

    @Test
    void shouldStartRunningSession() throws Exception {
      mvc.perform(
              post("/api/focus-sessions")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      """
                      {"plannedFocusMinutes": 25, "plannedBreakMinutes": 5, "notes": "deep work"}
                      """))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.status").value("RUNNING"))
          .andExpect(jsonPath("$.startedAt").isString())
          .andExpect(jsonPath("$.actualFocusSeconds").doesNotExist());
    }

    @Test
    void shouldStartSessionLinkedToTaskAndDeriveProject() throws Exception {
      long projectId = createProject("Linked project");
      long taskId = createTask("Linked task", projectId);

      mvc.perform(
              post("/api/focus-sessions")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"plannedFocusMinutes\": 25, \"taskId\": %d}".formatted(taskId)))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.taskId").value(taskId))
          .andExpect(jsonPath("$.projectId").value(projectId));
    }

    @Test
    void shouldRejectConflictingProjectForTask() throws Exception {
      long projectA = createProject("PA");
      long projectB = createProject("PB");
      long taskId = createTask("Task of A", projectA);
      mvc.perform(
              post("/api/focus-sessions")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"plannedFocusMinutes\": 25, \"taskId\": %d, \"projectId\": %d}"
                          .formatted(taskId, projectB)))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("FOCUS_SESSION_PROJECT_MISMATCH"));
    }

    @Test
    void shouldRejectUnknownTaskOrProject() throws Exception {
      mvc.perform(
              post("/api/focus-sessions")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"plannedFocusMinutes\": 25, \"taskId\": 555111}"))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value("TASK_NOT_FOUND"));

      mvc.perform(
              post("/api/focus-sessions")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"plannedFocusMinutes\": 25, \"projectId\": 555111}"))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }

    @Test
    void shouldRejectInvalidPlannedMinutes() throws Exception {
      mvc.perform(
              post("/api/focus-sessions")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"plannedFocusMinutes\": 0}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void shouldNotStartSecondSessionWhileOneIsActive() throws Exception {
      startSession("{\"plannedFocusMinutes\": 25}");
      mvc.perform(
              post("/api/focus-sessions")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"plannedFocusMinutes\": 50}"))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("FOCUS_SESSION_ALREADY_RUNNING"));
    }
  }

  @Nested
  @DisplayName("current")
  class Current {

    @Test
    void shouldReturnCurrentSessionWhenActive() throws Exception {
      long id = startSession("{\"plannedFocusMinutes\": 25}");
      mvc.perform(get("/api/focus-sessions/current").with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.id").value(id))
          .andExpect(jsonPath("$.status").value("RUNNING"));
    }

    @Test
    void shouldReturn204WhenNoActiveSession() throws Exception {
      mvc.perform(get("/api/focus-sessions/current").with(asOwner()))
          .andExpect(status().isNoContent());
    }
  }

  @Nested
  @DisplayName("pause resume finish cancel")
  class Lifecycle {

    @Test
    void shouldPauseResumeAndFinishSession() throws Exception {
      long id = startSession("{\"plannedFocusMinutes\": 25}");

      mvc.perform(post("/api/focus-sessions/{id}/pause", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("PAUSED"));

      mvc.perform(post("/api/focus-sessions/{id}/resume", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("RUNNING"));

      mvc.perform(post("/api/focus-sessions/{id}/finish", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("COMPLETED"))
          .andExpect(jsonPath("$.endedAt").isString())
          .andExpect(jsonPath("$.actualFocusSeconds").isNumber());

      mvc.perform(get("/api/focus-sessions/current").with(asOwner()))
          .andExpect(status().isNoContent());
    }

    @Test
    void shouldCancelActiveSession() throws Exception {
      long id = startSession("{\"plannedFocusMinutes\": 25}");
      mvc.perform(post("/api/focus-sessions/{id}/pause", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk());
      mvc.perform(post("/api/focus-sessions/{id}/cancel", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("CANCELLED"))
          .andExpect(jsonPath("$.actualFocusSeconds").doesNotExist());

      // cancelled session frees the "single active" slot
      mvc.perform(
              post("/api/focus-sessions")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"plannedFocusMinutes\": 25}"))
          .andExpect(status().isCreated());
    }

    @Test
    void shouldRejectIllegalLifecycleTransitions() throws Exception {
      long id = startSession("{\"plannedFocusMinutes\": 25}");

      mvc.perform(post("/api/focus-sessions/{id}/resume", id).with(asOwner()).with(csrf()))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("INVALID_FOCUS_SESSION_STATE"));

      mvc.perform(post("/api/focus-sessions/{id}/finish", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk());

      mvc.perform(post("/api/focus-sessions/{id}/pause", id).with(asOwner()).with(csrf()))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("INVALID_FOCUS_SESSION_STATE"));

      mvc.perform(post("/api/focus-sessions/{id}/cancel", id).with(asOwner()).with(csrf()))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("INVALID_FOCUS_SESSION_STATE"));
    }

    @Test
    void shouldReturn404ForUnknownSession() throws Exception {
      mvc.perform(post("/api/focus-sessions/424242/pause").with(asOwner()).with(csrf()))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value("FOCUS_SESSION_NOT_FOUND"));
    }
  }

  @Nested
  @DisplayName("history")
  class History {

    @Test
    void shouldListHistoryWithFilters() throws Exception {
      long projectId = createProject("Focused project");
      long id =
          startSession("{\"plannedFocusMinutes\": 25, \"projectId\": %d}".formatted(projectId));
      mvc.perform(post("/api/focus-sessions/{id}/finish", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk());

      mvc.perform(get("/api/focus-sessions").with(asOwner()).param("status", "COMPLETED"))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].status").value(org.hamcrest.Matchers.hasItem("COMPLETED")));

      mvc.perform(
              get("/api/focus-sessions")
                  .with(asOwner())
                  .param("projectId", String.valueOf(projectId)))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].projectId")
                  .value(org.hamcrest.Matchers.hasItem((int) projectId)));

      mvc.perform(
              get("/api/focus-sessions")
                  .with(asOwner())
                  .param("from", "2026-01-01")
                  .param("to", "2026-12-31"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.content.length()").value(org.hamcrest.Matchers.greaterThan(0)));
    }
  }

  @Nested
  @DisplayName("referential safety")
  class ReferentialSafety {

    @Test
    void shouldRejectTaskDeletionWhenFocusSessionsReferenceIt() throws Exception {
      long taskId = createTask("Task with focus", null);
      long sessionId =
          startSession("{\"plannedFocusMinutes\": 25, \"taskId\": %d}".formatted(taskId));
      mvc.perform(post("/api/focus-sessions/{id}/finish", sessionId).with(asOwner()).with(csrf()))
          .andExpect(status().isOk());

      mvc.perform(delete("/api/tasks/{id}", taskId).with(asOwner()).with(csrf()))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("TASK_HAS_FOCUS_SESSIONS"));
    }

    @Test
    void shouldExposeAccumulatedFocusPerProject() throws Exception {
      long projectId = createProject("Accumulating");
      long sessionId =
          startSession("{\"plannedFocusMinutes\": 25, \"projectId\": %d}".formatted(projectId));
      mvc.perform(post("/api/focus-sessions/{id}/finish", sessionId).with(asOwner()).with(csrf()))
          .andExpect(status().isOk());

      mvc.perform(get("/api/projects/{id}/focus", projectId).with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.projectId").value(projectId))
          .andExpect(jsonPath("$.totalFocusSeconds").isNumber());

      mvc.perform(get("/api/projects/{id}/focus", 424242).with(asOwner()))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }
  }
}
