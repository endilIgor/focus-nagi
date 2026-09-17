package com.focusnagi.focus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.focusnagi.common.DomainException;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FocusSessionTest {

  private static final Instant T0 = Instant.parse("2026-09-17T10:00:00Z");

  private FocusSession runningSession() {
    return new FocusSession(25, 5, null, null, T0);
  }

  @Test
  void shouldComputeActualFocusSecondsWithoutPauses() {
    FocusSession session = runningSession();
    session.finish(T0.plusSeconds(1500));

    assertThat(session.getStatus()).isEqualTo(FocusSessionStatus.COMPLETED);
    assertThat(session.getActualFocusSeconds()).isEqualTo(1500);
    assertThat(session.getEndedAt()).isEqualTo(T0.plusSeconds(1500));
  }

  @Test
  void shouldExcludeSinglePauseFromActualFocusSeconds() {
    FocusSession session = runningSession();
    session.pause(T0.plusSeconds(600));
    session.resume(T0.plusSeconds(900));
    session.finish(T0.plusSeconds(1500));

    assertThat(session.getStatus()).isEqualTo(FocusSessionStatus.COMPLETED);
    assertThat(session.getActualFocusSeconds()).isEqualTo(1200);
  }

  @Test
  void shouldExcludeMultiplePausesFromActualFocusSeconds() {
    FocusSession session = runningSession();
    session.pause(T0.plusSeconds(300));
    session.resume(T0.plusSeconds(600)); // 300s paused
    session.pause(T0.plusSeconds(900));
    session.resume(T0.plusSeconds(1200)); // another 300s paused
    session.finish(T0.plusSeconds(1800));

    assertThat(session.getStatus()).isEqualTo(FocusSessionStatus.COMPLETED);
    assertThat(session.getActualFocusSeconds()).isEqualTo(1200);
    assertThat(session.getPausedSecondsAccum()).isEqualTo(600);
    assertThat(session.getLastPausedAt()).isNull();
  }

  @Test
  void shouldNotStartSecondPauseWhilePaused() {
    FocusSession session = runningSession();
    session.pause(T0.plusSeconds(60));
    assertThatThrownBy(() -> session.pause(T0.plusSeconds(120)))
        .isInstanceOf(DomainException.class)
        .extracting(e -> ((DomainException) e).code())
        .isEqualTo("INVALID_FOCUS_SESSION_STATE");
  }

  @Test
  void shouldRejectIllegalTransitions() {
    FocusSession session = runningSession();

    assertThatThrownBy(() -> session.resume(T0.plusSeconds(10)))
        .extracting(e -> ((DomainException) e).code())
        .isEqualTo("INVALID_FOCUS_SESSION_STATE");

    session.cancel(T0.plusSeconds(10));
    assertThat(session.getStatus()).isEqualTo(FocusSessionStatus.CANCELLED);
    assertThat(session.getActualFocusSeconds()).isNull();

    assertThatThrownBy(() -> session.finish(T0.plusSeconds(20)))
        .extracting(e -> ((DomainException) e).code())
        .isEqualTo("INVALID_FOCUS_SESSION_STATE");
  }

  @Test
  void shouldKeepActualFocusNullForCancelledSession() {
    FocusSession session = runningSession();
    session.pause(T0.plusSeconds(100));
    session.cancel(T0.plusSeconds(200));

    assertThat(session.getStatus()).isEqualTo(FocusSessionStatus.CANCELLED);
    assertThat(session.getActualFocusSeconds()).isNull();
    assertThat(session.getEndedAt()).isEqualTo(T0.plusSeconds(200));
  }

  @Test
  @DisplayName("planned break minutes are stored as data, not enforced by the server")
  void shouldStorePlannedBreakMinutes() {
    FocusSession session = new FocusSession(50, 10, null, null, T0);
    assertThat(session.getPlannedFocusMinutes()).isEqualTo(50);
    assertThat(session.getPlannedBreakMinutes()).isEqualTo(10);
  }
}
