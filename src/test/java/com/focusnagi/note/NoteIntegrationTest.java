package com.focusnagi.note;

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

class NoteIntegrationTest extends AbstractIntegrationTest {

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

  private long createNote(String title, String content) throws Exception {
    MvcResult result =
        mvc.perform(
                post("/api/notes")
                    .with(asOwner())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"title\": \"%s\", \"content\": \"%s\"}".formatted(title, content)))
            .andExpect(status().isCreated())
            .andReturn();
    return ((Number)
            com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.id"))
        .longValue();
  }

  @Nested
  @DisplayName("crud")
  class Crud {

    @Test
    void shouldCreateNote() throws Exception {
      long projectId = createProject("Notes project");
      mvc.perform(
              post("/api/notes")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      """
                      {"title": "Ideas", "content": "# Markdown\\nworks", "projectId": %d}
                      """
                          .formatted(projectId)))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.title").value("Ideas"))
          .andExpect(jsonPath("$.pinned").value(false))
          .andExpect(jsonPath("$.projectId").value(projectId));
    }

    @Test
    void shouldRejectNoteWithUnknownProject() throws Exception {
      mvc.perform(
              post("/api/notes")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"title\": \"T\", \"projectId\": 987654}"))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }

    @Test
    void shouldUpdateAndDeleteNote() throws Exception {
      long id = createNote("Old", "body");
      mvc.perform(
              patch("/api/notes/{id}", id)
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"title\": \"New\", \"content\": \"updated\"}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.title").value("New"))
          .andExpect(jsonPath("$.content").value("updated"));

      mvc.perform(delete("/api/notes/{id}", id).with(asOwner()).with(csrf()))
          .andExpect(status().isNoContent());
      mvc.perform(get("/api/notes/{id}", id).with(asOwner()))
          .andExpect(status().isNotFound())
          .andExpect(jsonPath("$.code").value("NOTE_NOT_FOUND"));
    }
  }

  @Nested
  @DisplayName("pin and search")
  class PinAndSearch {

    @Test
    void shouldPinAndUnpinNote() throws Exception {
      long id = createNote("Pinnable", "c");
      mvc.perform(post("/api/notes/{id}/pin", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.pinned").value(true));
      mvc.perform(post("/api/notes/{id}/unpin", id).with(asOwner()).with(csrf()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.pinned").value(false));
    }

    @Test
    void shouldListPinnedFirst() throws Exception {
      long pinnedId = createNote("Regular note", "c");
      createNote("Z other", "c");
      mvc.perform(post("/api/notes/{id}/pin", pinnedId).with(asOwner()).with(csrf()))
          .andExpect(status().isOk());

      mvc.perform(get("/api/notes").with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.content[0].id").value((int) pinnedId))
          .andExpect(jsonPath("$.content[0].pinned").value(true));
    }

    @Test
    void shouldSearchNotesByTextSafely() throws Exception {
      createNote("Meeting notes", "Discussed the 50%_growth plan");
      createNote("Shopping", "apples and milk");

      mvc.perform(get("/api/notes").with(asOwner()).param("q", "meeting"))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].title").value(org.hamcrest.Matchers.hasItem("Meeting notes")));

      // LIKE wildcards in the query are treated as literals
      mvc.perform(get("/api/notes").with(asOwner()).param("q", "%_"))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].title").value(org.hamcrest.Matchers.hasItem("Meeting notes")));

      mvc.perform(get("/api/notes").with(asOwner()).param("q", "apples"))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].title").value(org.hamcrest.Matchers.hasItem("Shopping")));
    }
  }
}
