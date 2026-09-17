package com.focusnagi.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.focusnagi.common.DomainException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/**
 * Deterministic, Clock-driven checks for the brute-force guard: locking after enough failures,
 * unlocking once the lock window elapses, forgetting stale (never-locked) failure counts, and
 * bounding memory when many distinct keys are tracked.
 */
class LoginRateLimiterTest {

  private static final Instant T0 = Instant.parse("2026-09-17T09:00:00Z");

  private LoginRateLimiter limiterWithClock(AtomicReference<Instant> now) {
    LoginProperties properties = new LoginProperties(3, 5);
    return new LoginRateLimiter(properties, new MutableClock(now));
  }

  @Test
  void shouldAllowAttemptsBelowTheFailureThreshold() {
    AtomicReference<Instant> now = new AtomicReference<>(T0);
    LoginRateLimiter limiter = limiterWithClock(now);

    limiter.recordFailure("owner|127.0.0.1");
    limiter.recordFailure("owner|127.0.0.1");

    assertThatCode(() -> limiter.assertNotLocked("owner|127.0.0.1")).doesNotThrowAnyException();
  }

  @Test
  void shouldLockWithConflictCodeAfterReachingMaxFailures() {
    AtomicReference<Instant> now = new AtomicReference<>(T0);
    LoginRateLimiter limiter = limiterWithClock(now);

    limiter.recordFailure("owner|127.0.0.1");
    limiter.recordFailure("owner|127.0.0.1");
    limiter.recordFailure("owner|127.0.0.1");

    assertThatThrownBy(() -> limiter.assertNotLocked("owner|127.0.0.1"))
        .isInstanceOfSatisfying(
            DomainException.class,
            ex -> {
              assertThat(ex.code()).isEqualTo("LOGIN_LOCKED");
              assertThat(ex.status()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
            });
  }

  @Test
  void shouldOnlyLockTheOffendingKeyNotOtherUsernamesOrIps() {
    AtomicReference<Instant> now = new AtomicReference<>(T0);
    LoginRateLimiter limiter = limiterWithClock(now);

    limiter.recordFailure("owner|127.0.0.1");
    limiter.recordFailure("owner|127.0.0.1");
    limiter.recordFailure("owner|127.0.0.1");

    assertThatCode(() -> limiter.assertNotLocked("owner|10.0.0.9")).doesNotThrowAnyException();
    assertThatCode(() -> limiter.assertNotLocked("ghost|127.0.0.1")).doesNotThrowAnyException();
  }

  @Test
  void shouldUnlockOnceTheLockWindowElapses() {
    AtomicReference<Instant> now = new AtomicReference<>(T0);
    LoginRateLimiter limiter = limiterWithClock(now);

    limiter.recordFailure("owner|127.0.0.1");
    limiter.recordFailure("owner|127.0.0.1");
    limiter.recordFailure("owner|127.0.0.1");
    assertThatThrownBy(() -> limiter.assertNotLocked("owner|127.0.0.1"))
        .isInstanceOf(DomainException.class);

    now.set(T0.plus(Duration.ofMinutes(5)));

    assertThatCode(() -> limiter.assertNotLocked("owner|127.0.0.1")).doesNotThrowAnyException();
  }

  @Test
  void shouldForgetStaleFailuresThatNeverReachedTheLock() {
    AtomicReference<Instant> now = new AtomicReference<>(T0);
    LoginRateLimiter limiter = limiterWithClock(now);

    limiter.recordFailure("owner|127.0.0.1");
    limiter.recordFailure("owner|127.0.0.1");

    // Past the lock window, but this key never actually locked; its failure count must not
    // linger indefinitely and combine with a later, unrelated failure into a false lock.
    now.set(T0.plus(Duration.ofMinutes(5).plusSeconds(1)));
    limiter.recordFailure("owner|127.0.0.1");

    assertThatCode(() -> limiter.assertNotLocked("owner|127.0.0.1")).doesNotThrowAnyException();
  }

  @Test
  void shouldClearFailuresOnSuccess() {
    AtomicReference<Instant> now = new AtomicReference<>(T0);
    LoginRateLimiter limiter = limiterWithClock(now);

    limiter.recordFailure("owner|127.0.0.1");
    limiter.recordFailure("owner|127.0.0.1");
    limiter.recordSuccess("owner|127.0.0.1");
    limiter.recordFailure("owner|127.0.0.1");

    assertThatCode(() -> limiter.assertNotLocked("owner|127.0.0.1")).doesNotThrowAnyException();
  }

  @Test
  void shouldBoundMemoryWhenManyDistinctKeysAreTracked() {
    AtomicReference<Instant> now = new AtomicReference<>(T0);
    LoginRateLimiter limiter = limiterWithClock(now);

    limiter.recordFailure("attacker-0|10.0.0.1");
    limiter.recordFailure("attacker-0|10.0.0.1");
    limiter.recordFailure("attacker-0|10.0.0.1");
    assertThatThrownBy(() -> limiter.assertNotLocked("attacker-0|10.0.0.1"))
        .isInstanceOf(DomainException.class);

    for (int i = 1; i < 10_050; i++) {
      limiter.recordFailure("attacker-" + i + "|10.0.0.1");
    }

    // The locked first key must have been evicted once the bound was exceeded.
    assertThatCode(() -> limiter.assertNotLocked("attacker-0|10.0.0.1")).doesNotThrowAnyException();
  }

  /** A Clock whose instant is read from a mutable reference, so tests can move time forward. */
  private static final class MutableClock extends Clock {
    private final AtomicReference<Instant> now;

    MutableClock(AtomicReference<Instant> now) {
      this.now = now;
    }

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now.get();
    }
  }
}
