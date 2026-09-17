package com.focusnagi.project;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
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

class ProjectIntegrationTest extends AbstractIntegrationTest {

  @Autowired MockMvc mvc;

  private String createProject(String title) throws Exception {
    MvcResult result =
        mvc.perform(
                post("/api/projects")
                    .with(asOwner())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"title\": \"%s\"}".formatted(title)))
            .andExpect(status().isCreated())
            .andReturn();
    return result.getResponse().getContentAsString();
  }

  @Nested
  @DisplayName("create")
  class Create {

    @Test
    void shouldCreateProjectWithDefaults() throws Exception {
      mvc.perform(
              post("/api/projects")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      """
                      {"title": "Build app", "description": "desc", "startDate": "2026-01-10",
                       "dueDate": "2026-02-10"}
                      """))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.title").value("Build app"))
          .andExpect(jsonPath("$.status").value("ACTIVE"))
          .andExpect(jsonPath("$.archivedAt").doesNotExist())
          .andExpect(jsonPath("$.id").isNumber());
    }

    @Test
    void shouldRejectBlankTitle() throws Exception {
      mvc.perform(
              post("/api/projects")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"title\": \"  \"}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void shouldRejectDueDateBeforeStartDate() throws Exception {
      mvc.perform(
              post("/api/projects")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"title\": \"X\", \"startDate\": \"2026-03-01\", \"dueDate\": \"2026-02-01\"}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("PROJECT_INVALID_DATES"));
    }

    @Test
    void shouldRejectUnauthenticatedCreate() throws Exception {
      mvc.perform(
              post("/api/projects")
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"title\": \"X\"}"))
          .andExpect(status().isUnauthorized());
    }
  }

  @Nested
  @DisplayName("read")
  class Read {

    @Test
    void shouldListProjects() throws Exception {
      createProject("P1");
      createProject("P2");
      mvc.perform(get("/api/projects").with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].title").value(org.hamcrest.Matchers.hasItems("P1", "P2")));
    }

    @Test
    void shouldFilterProjectsByStatus() throws Exception {
      createProject("Active one");
      String json = createProject("To archive");
      long id = ((Number) com.jayway.jsonpath.JsonPath.read(json, "$.id")).longValue();
      mvc.perform(post("/api/projects/{id}/archive", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk());

      mvc.perform(get("/api/projects").with(asOwner()).param("status", "ARCHIVED"))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].status")
                  .value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is("ARCHIVED"))))
          .andExpect(
              jsonPath("$.content[*].title").value(org.hamcrest.Matchers.hasItem("To archive")));

      mvc.perform(get("/api/projects").with(asOwner()).param("status", "ACTIVE"))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].status")
                  .value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is("ACTIVE"))));
    }

    @Test
    void shouldGetProjectById() throws Exception {
      String json = createProject("Find me");
      long id = ((Number) com.jayway.jsonpath.JsonPath.read(json, "$.id")).longValue();
      mvc.perform(get("/api/projects/{id}", id).with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.title").value("Find me"));
    }

    @Test
    void shouldReturn404ForUnknownProject() throws Exception {
      mvc.perform(get("/api/projects/999999").with(asOwner()))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }
  }

  @Nested
  @DisplayName("update")
  class Update {

    @Test
    void shouldUpdateProjectFields() throws Exception {
      String json = createProject("Old title");
      long id = ((Number) com.jayway.jsonpath.JsonPath.read(json, "$.id")).longValue();
      mvc.perform(
              patch("/api/projects/{id}", id)
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"title\": \"New title\", \"dueDate\": \"2026-12-31\"}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.title").value("New title"))
          .andExpect(jsonPath("$.dueDate").value("2026-12-31"));
    }

    @Test
    void shouldNotChangeStatusThroughUpdate() throws Exception {
      String json = createProject("Keep active");
      long id = ((Number) com.jayway.jsonpath.JsonPath.read(json, "$.id")).longValue();
      mvc.perform(
              patch("/api/projects/{id}", id)
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"status\": \"ARCHIVED\"}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("ACTIVE"));
    }
  }

  @Nested
  @DisplayName("lifecycle")
  class Lifecycle {

    @Test
    void shouldCompleteActiveProject() throws Exception {
      String json = createProject("Finish me");
      long id = ((Number) com.jayway.jsonpath.JsonPath.read(json, "$.id")).longValue();
      mvc.perform(post("/api/projects/{id}/complete", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("COMPLETED"));
    }

    @Test
    void shouldArchiveAndRestoreProject() throws Exception {
      String json = createProject("Archive me");
      long id = ((Number) com.jayway.jsonpath.JsonPath.read(json, "$.id")).longValue();

      mvc.perform(post("/api/projects/{id}/archive", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("ARCHIVED"))
          .andExpect(jsonPath("$.archivedAt").isString());

      mvc.perform(post("/api/projects/{id}/restore", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("ACTIVE"))
          .andExpect(jsonPath("$.archivedAt").doesNotExist());
    }

    @Test
    void shouldRejectIllegalTransitions() throws Exception {
      String json = createProject("Illegal moves");
      long id = ((Number) com.jayway.jsonpath.JsonPath.read(json, "$.id")).longValue();

      mvc.perform(post("/api/projects/{id}/restore", id).with(asOwner()).with(csrf()))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("INVALID_PROJECT_STATE"));

      mvc.perform(post("/api/projects/{id}/complete", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk());
      mvc.perform(post("/api/projects/{id}/complete", id).with(asOwner()).with(csrf()))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("INVALID_PROJECT_STATE"));
    }
  }
}
