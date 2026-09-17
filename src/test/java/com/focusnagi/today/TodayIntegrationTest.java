package com.focusnagi.today;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.focusnagi.AbstractIntegrationTest;
import com.focusnagi.focus.FocusSession;
import com.focusnagi.focus.FocusSessionRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

class TodayIntegrationTest extends AbstractIntegrationTest {

  @Autowired MockMvc mvc;
  @Autowired FocusSessionRepository focusSessionRepository;

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

  private long createTask(String title, String dueDate) throws Exception {
    String content =
        dueDate == null
            ? "{\"title\": \"%s\"}".formatted(title)
            : "{\"title\": \"%s\", \"dueDate\": \"%s\"}".formatted(title, dueDate);
    MvcResult result =
        mvc.perform(
                post("/api/tasks")
                    .with(asOwner())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(content))
            .andExpect(status().isCreated())
            .andReturn();
    return ((Number)
            com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.id"))
        .longValue();
  }

  private void completeSessionAt(Instant startedAt, int minutes) {
    FocusSession session = new FocusSession(25, null, null, null, startedAt);
    session.finish(startedAt.plusSeconds(minutes * 60L));
    focusSessionRepository.save(session);
  }

  @Test
  void shouldReturnCompactTodayProjection() throws Exception {
    long activeProject = createProject("Active today");
    long archivedProject = createProject("Archived one");
    mvc.perform(post("/api/projects/{id}/archive", archivedProject).with(asOwner()).with(csrf()))
        .andExpect(status().isOk());

    LocalDate today = LocalDate.now(ZoneOffset.UTC);
    long dueToday = createTask("Due today", today.toString());
    createTask("Overdue one", today.minusDays(1).toString());
    createTask("Overdue two", today.minusDays(3).toString());
    createTask("No date", null);
    long completedTask = createTask("Done today", today.toString());
    mvc.perform(post("/api/tasks/{id}/complete", completedTask).with(asOwner()).with(csrf()))
        .andExpect(status().isOk());

    completeSessionAt(today.atTime(LocalTime.of(8, 0)).toInstant(ZoneOffset.UTC), 30);
    completeSessionAt(today.atTime(LocalTime.of(9, 0)).toInstant(ZoneOffset.UTC), 15);

    long goalId;
    MvcResult goal =
        mvc.perform(
                post("/api/goals")
                    .with(asOwner())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        "{\"title\": \"Daily 60\", \"type\": \"FOCUS_MINUTES\", \"targetValue\": 60,"
                            + " \"period\": \"DAILY\", \"startDate\": \"%s\"}".formatted(today)))
            .andExpect(status().isCreated())
            .andReturn();
    goalId =
        ((Number)
                com.jayway.jsonpath.JsonPath.read(goal.getResponse().getContentAsString(), "$.id"))
            .longValue();

    long runningId;
    MvcResult running =
        mvc.perform(
                post("/api/focus-sessions")
                    .with(asOwner())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"plannedFocusMinutes\": 25}"))
            .andExpect(status().isCreated())
            .andReturn();
    runningId =
        ((Number)
                com.jayway.jsonpath.JsonPath.read(
                    running.getResponse().getContentAsString(), "$.id"))
            .longValue();

    mvc.perform(get("/api/today").with(asOwner()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.date").value(today.toString()))
        .andExpect(jsonPath("$.currentSession.id").value((int) runningId))
        .andExpect(jsonPath("$.currentSession.status").value("RUNNING"))
        .andExpect(jsonPath("$.focusedMinutesToday").value(45))
        .andExpect(jsonPath("$.sessionsToday").value(2))
        .andExpect(jsonPath("$.tasksCompletedToday").value(1))
        .andExpect(jsonPath("$.tasksDueToday.length()").value(1))
        .andExpect(jsonPath("$.tasksDueToday[0].id").value((int) dueToday))
        .andExpect(jsonPath("$.overdueTasks.length()").value(2))
        .andExpect(jsonPath("$.activeProjects.length()").value(1))
        .andExpect(jsonPath("$.activeProjects[0].id").value((int) activeProject))
        .andExpect(jsonPath("$.goals.length()").value(1))
        .andExpect(jsonPath("$.goals[0].id").value((int) goalId))
        .andExpect(jsonPath("$.goals[0].currentValue").value(45))
        .andExpect(jsonPath("$.goals[0].done").value(false))
        .andExpect(jsonPath("$.activeProjects[0].title").value("Active today"));

    // cleanup active session so other tests are unaffected
    mvc.perform(post("/api/focus-sessions/{id}/cancel", runningId).with(asOwner()).with(csrf()))
        .andExpect(status().isOk());
  }

  @Test
  void shouldReturnEmptyProjectionWithoutData() throws Exception {
    LocalDate today = LocalDate.now(ZoneOffset.UTC);
    mvc.perform(get("/api/today").with(asOwner()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.date").value(today.toString()))
        .andExpect(jsonPath("$.currentSession").doesNotExist())
        .andExpect(jsonPath("$.focusedMinutesToday").value(0))
        .andExpect(jsonPath("$.tasksDueToday.length()").value(0))
        .andExpect(jsonPath("$.overdueTasks.length()").value(0))
        .andExpect(jsonPath("$.activeProjects.length()").value(0))
        .andExpect(jsonPath("$.goals.length()").value(0));
  }
}
