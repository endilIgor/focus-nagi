package com.focusnagi.focus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

import com.focusnagi.AbstractIntegrationTest;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.OptimisticLockingFailureException;

/**
 * Lost-update protection at the database level: two persistence contexts that both read the same
 * row must not both be able to write it — the second, stale write must be rejected instead of
 * silently overwriting the first.
 */
class FocusSessionConcurrencyTest extends AbstractIntegrationTest {

  @Autowired FocusSessionRepository focusSessionRepository;

  @Test
  @DisplayName("stale detached entity is rejected on save instead of overwriting a newer write")
  void shouldRejectStaleDetachedEntityOnConcurrentModification() {
    FocusSession session = new FocusSession(25, null, null, null, Instant.now());
    focusSessionRepository.saveAndFlush(session);
    long id = session.getId();

    // Two independent reads of the same row, simulating two callers acting on the same version.
    FocusSession first = focusSessionRepository.findById(id).orElseThrow();
    FocusSession stale = focusSessionRepository.findById(id).orElseThrow();

    first.pause(Instant.now());
    focusSessionRepository.saveAndFlush(first);
    // PostgreSQL timestamptz rounds to microsecond precision on write, which does not always
    // match a plain truncation of the in-memory nanosecond-precision Instant. Re-read the
    // persisted value so the comparison below reflects what the database actually stored.
    Instant persistedPauseInstant =
        focusSessionRepository.findById(id).orElseThrow().getLastPausedAt();

    stale.pause(Instant.now());
    try {
      focusSessionRepository.saveAndFlush(stale);
      fail("expected an optimistic locking failure");
    } catch (OptimisticLockingFailureException expected) {
      // the database rejected the stale write
    }

    FocusSession current = focusSessionRepository.findById(id).orElseThrow();
    assertThat(current.getStatus()).isEqualTo(FocusSessionStatus.PAUSED);
    assertThat(current.getLastPausedAt()).isEqualTo(persistedPauseInstant);
  }
}
