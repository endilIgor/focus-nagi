package com.focusnagi.focus;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.focusnagi.AbstractIntegrationTest;
import com.focusnagi.MutableClock;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** Verifies durations are computed exclusively from the injected server clock. */
class FocusSessionClockIntegrationTest extends AbstractIntegrationTest {

  private static final Instant START = Instant.parse("2026-09-17T12:00:00Z");
  private static final MutableClock CLOCK = new MutableClock(START);

  @Autowired MockMvc mvc;

  @TestConfiguration
  static class FixedClockConfig {
    @Bean
    @Primary
    Clock mutableClock() {
      return CLOCK;
    }
  }

  private long startSession() throws Exception {
    MvcResult result =
        mvc.perform(
                post("/api/focus-sessions")
                    .with(asOwner())
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"plannedFocusMinutes\": 25}"))
            .andExpect(status().isCreated())
            .andReturn();
    return ((Number)
            com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.id"))
        .longValue();
  }

  @Test
  void shouldComputeActualFocusSecondsFromServerClockAcrossMultiplePauses() throws Exception {
    long id = startSession();

    CLOCK.advance(Duration.ofMinutes(10));
    mvc.perform(post("/api/focus-sessions/{id}/pause", id).with(asOwner()).with(csrf()))
        .andExpect(status().isOk());

    CLOCK.advance(Duration.ofMinutes(5));
    mvc.perform(post("/api/focus-sessions/{id}/resume", id).with(asOwner()).with(csrf()))
        .andExpect(status().isOk());

    CLOCK.advance(Duration.ofMinutes(3));
    mvc.perform(post("/api/focus-sessions/{id}/pause", id).with(asOwner()).with(csrf()))
        .andExpect(status().isOk());

    CLOCK.advance(Duration.ofMinutes(2));
    mvc.perform(post("/api/focus-sessions/{id}/resume", id).with(asOwner()).with(csrf()))
        .andExpect(status().isOk());

    // elapsed 32min (1920s), paused 7min (420s) -> 25min (1500s) of actual focus
    CLOCK.advance(Duration.ofMinutes(12));
    mvc.perform(post("/api/focus-sessions/{id}/finish", id).with(asOwner()).with(csrf()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("COMPLETED"))
        .andExpect(jsonPath("$.actualFocusSeconds").value(1500));
  }

  @Test
  void shouldNotTrustClientSuppliedTime() throws Exception {
    long id = startSession();
    CLOCK.advance(Duration.ofMinutes(25));
    // even if a client tried to send its own timestamps, the server clock decides
    mvc.perform(post("/api/focus-sessions/{id}/finish", id).with(asOwner()).with(csrf()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.actualFocusSeconds").value(1500));
  }

  @Test
  void shouldEnforceSingleActiveSessionAtDatabaseLevel() {
    FocusSession first = new FocusSession(25, null, null, null, CLOCK.instant());
    FocusSession second = new FocusSession(25, null, null, null, CLOCK.instant());
    focusSessionRepository.saveAndFlush(first);
    assertThatThrownBy(() -> focusSessionRepository.saveAndFlush(second))
        .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    // cleanup so the slot is free for other tests
    first.cancel(CLOCK.instant());
    focusSessionRepository.saveAndFlush(first);
  }

  @Autowired FocusSessionRepository focusSessionRepository;
}
