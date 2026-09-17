package com.focusnagi.journal;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.focusnagi.AbstractIntegrationTest;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

class JournalIntegrationTest extends AbstractIntegrationTest {

  @Autowired MockMvc mvc;

  private long createEntry(String date, String content) throws Exception {
    MvcResult result =
        mvc.perform(
                post("/api/journal")
                    .with(asOwner())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        "{\"entryDate\": \"%s\", \"content\": \"%s\"}".formatted(date, content)))
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
    void shouldCreateEntry() throws Exception {
      mvc.perform(
              post("/api/journal")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      "{\"entryDate\": \"2026-09-17\", \"content\": \"# Day 1\\nGreat progress\"}"))
          .andExpect(status().isCreated())
          .andExpect(jsonPath("$.entryDate").value("2026-09-17"))
          .andExpect(jsonPath("$.content").value("# Day 1\nGreat progress"));
    }

    @Test
    void shouldAllowMultipleEntriesPerDay() throws Exception {
      createEntry("2026-09-10", "morning entry");
      createEntry("2026-09-10", "evening entry");

      mvc.perform(get("/api/journal").with(asOwner()).param("date", "2026-09-10"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void shouldRejectFutureOrBlankEntry() throws Exception {
      String future = LocalDate.now(ZoneOffset.UTC).plusDays(2).toString();
      mvc.perform(
              post("/api/journal")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"entryDate\": \"%s\", \"content\": \"c\"}".formatted(future)))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("JOURNAL_FUTURE_DATE"));

      mvc.perform(
              post("/api/journal")
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"entryDate\": \"2026-09-01\", \"content\": \"  \"}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void shouldUpdateAndDeleteEntry() throws Exception {
      long id = createEntry("2026-09-05", "draft");
      mvc.perform(
              patch("/api/journal/{id}", id)
                  .with(asOwner())
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"content\": \"revised\"}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.content").value("revised"));

      mvc.perform(delete("/api/journal/{id}", id).with(asOwner()).with(csrf()))
          .andExpect(status().isNoContent());
      mvc.perform(get("/api/journal/recent").with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].id")
                  .value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem((int) id))));
    }
  }

  @Nested
  @DisplayName("queries")
  class Queries {

    @Test
    void shouldQueryByDateAndRange() throws Exception {
      createEntry("2026-09-01", "one");
      createEntry("2026-09-03", "two");
      createEntry("2026-09-05", "three");

      mvc.perform(get("/api/journal").with(asOwner()).param("date", "2026-09-03"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.length()").value(1))
          .andExpect(jsonPath("$[0].content").value("two"));

      mvc.perform(
              get("/api/journal/range")
                  .with(asOwner())
                  .param("from", "2026-09-02")
                  .param("to", "2026-09-05"))
          .andExpect(status().isOk())
          .andExpect(
              jsonPath("$.content[*].content")
                  .value(org.hamcrest.Matchers.hasItems("two", "three")));

      mvc.perform(
              get("/api/journal/range")
                  .with(asOwner())
                  .param("from", "2026-09-05")
                  .param("to", "2026-09-02"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("JOURNAL_INVALID_RANGE"));
    }

    @Test
    void shouldListRecentEntriesPaginated() throws Exception {
      createEntry("2026-08-01", "old");
      createEntry("2026-09-17", "new");

      mvc.perform(get("/api/journal/recent").with(asOwner()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.content[0].content").value("new"));

      mvc.perform(get("/api/journal/recent").with(asOwner()).param("size", "1"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.content.length()").value(1));
    }
  }
}
