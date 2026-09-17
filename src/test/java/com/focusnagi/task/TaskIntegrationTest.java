package com.focusnagi.task;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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

class TaskIntegrationTest extends AbstractIntegrationTest {

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

  @Nested
  @DisplayName("create")
  class Create {

    @Test
    void shouldCreateTaskWithoutProject() throws Exception {
      mvc.perform(
              post("/api/tasks")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      """
                      {"title": "Read book", "description": "chapters 1-3", "priority": "HIGH",
                       "estimatedMinutes": 90, "dueDate": "2026-10-01"}
                      """))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.title").value("Read book"))
          .andExpect(jsonPath("$.status").value("TODO"))
          .andExpect(jsonPath("$.priority").value("HIGH"))
          .andExpect(jsonPath("$.estimatedMinutes").value(90))
          .andExpect(jsonPath("$.projectId").doesNotExist());
    }

    @Test
    void shouldCreateTaskWithExistingProject() throws Exception {
      long projectId = createProject("Study project");
      mvc.perform(
              post("/api/tasks")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"title\": \"T\", \"projectId\": %d}".formatted(projectId)))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.projectId").value(projectId));
    }

    @Test
    void shouldRejectTaskWithUnknownProject() throws Exception {
      mvc.perform(
              post("/api/tasks")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"title\": \"T\", \"projectId\": 424242}"))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }

    @Test
    void shouldRejectInvalidTask() throws Exception {
      mvc.perform(
              post("/api/tasks")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"title\": \"  \"}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

      mvc.perform(
              post("/api/tasks")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"title\": \"T\", \"estimatedMinutes\": 0}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }
  }

  @Nested
  @DisplayName("list and filters")
  class List {

    @Test
    void shouldListTasksOfProject() throws Exception {
      long projectId = createProject("ProjWithTasks");
      createTask("PT-1", projectId);
      createTask("PT-2", projectId);

      mvc.perform(get("/api/projects/{id}/tasks", projectId).with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].title").value(org.hamcrest.Matchers.hasItems("PT-1", "PT-2")));

      mvc.perform(get("/api/projects/{id}/tasks", 987654).with(asOwner()))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }

    @Test
    void shouldListTasksPaginatedWithFilters() throws Exception {
      long projectA = createProject("PA");
      long projectB = createProject("PB");
      createTask("Task-A1", projectA);
      createTask("Task-A2", projectA);
      long highTask = createTask("Task-B-high", projectB);
      mvc.perform(
          patch("/api/tasks/{id}", highTask)
              .with(asOwner())
              .with(csrf())
              .contentType(MediaType.APPLICATION_JSON)
              .content("{\"priority\": \"HIGH\"}"));

      mvc.perform(get("/api/tasks").with(asOwner()).param("projectId", String.valueOf(projectA)))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.content.length()").value(2));

      mvc.perform(get("/api/tasks").with(asOwner()).param("priority", "HIGH"))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].title").value(org.hamcrest.Matchers.hasItem("Task-B-high")));

      mvc.perform(
              get("/api/tasks")
                  .with(asOwner())
                  .param("status", "TODO")
                  .param("priority", "HIGH")
                  .param("size", "50"))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].title").value(org.hamcrest.Matchers.hasItem("Task-B-high")));

      mvc.perform(get("/api/tasks").with(asOwner()).param("size", "1"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.content.length()").value(1))
          .andExpect(jsonPath("$.totalElements").isNumber());
    }
  }

  @Nested
  @DisplayName("update")
  class Update {

    @Test
    void shouldUpdateTaskAndMoveProject() throws Exception {
      long projectA = createProject("PA");
      long projectB = createProject("PB");
      long taskId = createTask("Move me", projectA);

      mvc.perform(
              patch("/api/tasks/{id}", taskId)
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"title\": \"Moved\", \"projectId\": %d, \"dueDate\": \"2026-11-05\"}"
                          .formatted(projectB)))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.title").value("Moved"))
          .andExpect(jsonPath("$.projectId").value(projectB))
          .andExpect(jsonPath("$.dueDate").value("2026-11-05"));
    }

    @Test
    void shouldDetachTaskFromProject() throws Exception {
      long projectA = createProject("PA");
      long taskId = createTask("Detach me", projectA);
      mvc.perform(
              patch("/api/tasks/{id}", taskId)
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"projectId\": null}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.projectId").doesNotExist());
    }
  }

  @Nested
  @DisplayName("transitions")
  class Transitions {

    @Test
    void shouldCompleteAndReopenTask() throws Exception {
      long taskId = createTask("Cycle", null);
      mvc.perform(post("/api/tasks/{id}/start", taskId).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("IN_PROGRESS"));

      mvc.perform(post("/api/tasks/{id}/complete", taskId).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("COMPLETED"))
          .andExpect(jsonPath("$.completedAt").isString());

      mvc.perform(post("/api/tasks/{id}/reopen", taskId).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("TODO"))
          .andExpect(jsonPath("$.completedAt").doesNotExist());
    }

    @Test
    void shouldCancelTask() throws Exception {
      long taskId = createTask("Cancel me", null);
      mvc.perform(post("/api/tasks/{id}/cancel", taskId).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void shouldRejectIllegalTransitions() throws Exception {
      long taskId = createTask("No jumps", null);

      mvc.perform(post("/api/tasks/{id}/reopen", taskId).with(asOwner()).with(csrf()))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("INVALID_TASK_STATE"));

      mvc.perform(post("/api/tasks/{id}/cancel", taskId).with(asOwner()).with(csrf()))
          .andExpect(status().isOk());
      mvc.perform(post("/api/tasks/{id}/complete", taskId).with(asOwner()).with(csrf()))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("INVALID_TASK_STATE"));

      mvc.perform(post("/api/tasks/{id}/start", taskId).with(asOwner()).with(csrf()))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("INVALID_TASK_STATE"));
    }
  }

  @Nested
  @DisplayName("delete")
  class Delete {

    @Test
    void shouldDeleteTaskWithoutFocusSessions() throws Exception {
      long taskId = createTask("Delete me", null);
      mvc.perform(delete("/api/tasks/{id}", taskId).with(asOwner()).with(csrf()))
          .andExpect(status().isNoContent());
      mvc.perform(get("/api/tasks/{id}", taskId).with(asOwner()))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value("TASK_NOT_FOUND"));
    }
  }

  @Nested
  @DisplayName("subtasks")
  class Subtasks {

    @Test
    void shouldAddCompleteReopenAndRemoveSubtask() throws Exception {
      long taskId = createTask("With checklist", null);

      MvcResult added =
          mvc.perform(
                  post("/api/tasks/{id}/subtasks", taskId)
                      .with(asOwner())
                      .with(csrf())
                      .contentType(MediaType.APPLICATION_JSON)
                      .content("{\"title\": \"Step 1\"}"))
              .andExpect(status().isCreated())
              .andExpect(jsonPath("$.completed").value(false))
              .andReturn();
      long subtaskId =
          ((Number)
                  com.jayway.jsonpath.JsonPath.read(
                      added.getResponse().getContentAsString(), "$.id"))
              .longValue();

      mvc.perform(
              post("/api/tasks/{id}/subtasks/{sid}/complete", taskId, subtaskId)
                  .with(asOwner())
                  .with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.completed").value(true));

      mvc.perform(
              post("/api/tasks/{id}/subtasks/{sid}/reopen", taskId, subtaskId)
                  .with(asOwner())
                  .with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.completed").value(false));

      mvc.perform(
              delete("/api/tasks/{id}/subtasks/{sid}", taskId, subtaskId)
                  .with(asOwner())
                  .with(csrf()))
          .andExpect(status().isNoContent());

      mvc.perform(get("/api/tasks/{id}", taskId).with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.subtasks").isEmpty());
    }

    @Test
    void shouldListSubtasksWithinTask() throws Exception {
      long taskId = createTask("Checklist", null);
      for (int i = 1; i <= 3; i++) {
        mvc.perform(
                post("/api/tasks/{id}/subtasks", taskId)
                    .with(asOwner())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"title\": \"Item %d\"}".formatted(i)))
            .andExpect(status().isCreated());
      }
      mvc.perform(get("/api/tasks/{id}", taskId).with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.subtasks.length()").value(3));
    }

    @Test
    void shouldRejectSubtaskOnUnknownTask() throws Exception {
      mvc.perform(
              post("/api/tasks/{id}/subtasks", 987654)
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"title\": \"Step\"}"))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value("TASK_NOT_FOUND"));
    }
  }
}
