package com.focusnagi.auth;

import com.focusnagi.common.DomainException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;

/**
 * In-memory per username+IP brute-force guard. Conservative and per-instance only: locks after a
 * few failures for a few minutes. Not shared across multiple running instances.
 */
public class LoginRateLimiter {

  private final int maxFailures;
  private final Duration lockDuration;
  private final Clock clock;
  private final Map<String, Attempts> attempts = new ConcurrentHashMap<>();

  public LoginRateLimiter(LoginProperties properties, Clock clock) {
    this.maxFailures = properties.maxFailures();
    this.lockDuration = Duration.ofMinutes(properties.lockMinutes());
    this.clock = clock;
  }

  public void assertNotLocked(String key) {
    Attempts a = attempts.get(key);
    if (a != null && a.lockedUntil != null && Instant.now(clock).isBefore(a.lockedUntil)) {
      throw new DomainException(
          "LOGIN_LOCKED",
          "Too many failed attempts. Try again later.",
          HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  public void recordFailure(String key) {
    attempts.compute(
        key,
        (k, a) -> {
          int failures = (a == null ? 0 : a.failures) + 1;
          Instant lockedUntil =
              failures >= maxFailures ? Instant.now(clock).plus(lockDuration) : null;
          return new Attempts(failures, lockedUntil);
        });
  }

  public void recordSuccess(String key) {
    attempts.remove(key);
  }

  public void reset() {
    attempts.clear();
  }

  private record Attempts(int failures, Instant lockedUntil) {}
}
