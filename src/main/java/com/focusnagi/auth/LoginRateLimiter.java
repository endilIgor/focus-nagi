package com.focusnagi.auth;

import com.focusnagi.common.DomainException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * In-memory per username+IP brute-force guard. Conservative and per-instance only: locks after a
 * few failures for a few minutes. Not shared across multiple running instances.
 *
 * <p>Bounded and self-expiring so that an attacker cycling through many usernames/IPs cannot grow
 * this map without limit: entries older than the lock window are treated as stale and dropped
 * lazily, and the map additionally caps its size with least-recently-used eviction as a backstop.
 */
public class LoginRateLimiter {

  private static final int MAX_TRACKED_KEYS = 10_000;

  private final int maxFailures;
  private final Duration lockDuration;
  private final Clock clock;
  private final Map<String, Attempts> attempts;

  public LoginRateLimiter(LoginProperties properties, Clock clock) {
    this.maxFailures = properties.maxFailures();
    this.lockDuration = Duration.ofMinutes(properties.lockMinutes());
    this.clock = clock;
    this.attempts =
        Collections.synchronizedMap(
            new LinkedHashMap<>(16, 0.75f, true) {
              @Override
              protected boolean removeEldestEntry(Map.Entry<String, Attempts> eldest) {
                return size() > MAX_TRACKED_KEYS;
              }
            });
  }

  public void assertNotLocked(String key) {
    Instant now = Instant.now(clock);
    Attempts a = liveAttempts(key, now);
    if (a != null && a.lockedUntil != null && now.isBefore(a.lockedUntil)) {
      throw new DomainException(
          "LOGIN_LOCKED",
          "Too many failed attempts. Try again later.",
          HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  public void recordFailure(String key) {
    Instant now = Instant.now(clock);
    attempts.compute(
        key,
        (k, existing) -> {
          Attempts a = existing != null && !isExpired(existing, now) ? existing : null;
          int failures = (a == null ? 0 : a.failures) + 1;
          Instant lockedUntil = failures >= maxFailures ? now.plus(lockDuration) : null;
          return new Attempts(failures, lockedUntil, now);
        });
  }

  public void recordSuccess(String key) {
    attempts.remove(key);
  }

  public void reset() {
    attempts.clear();
  }

  /** Returns the entry for {@code key} unless it has expired, dropping it lazily if so. */
  private Attempts liveAttempts(String key, Instant now) {
    Attempts a = attempts.get(key);
    if (a != null && isExpired(a, now)) {
      attempts.remove(key, a);
      return null;
    }
    return a;
  }

  /**
   * A failure record expires once its lock (if any) has lapsed, or once the lock window has elapsed
   * since the last failure when it never reached a lock, so unlocked, stale failure counts do not
   * linger forever.
   */
  private boolean isExpired(Attempts a, Instant now) {
    Instant expiresAt = a.lockedUntil != null ? a.lockedUntil : a.lastFailureAt.plus(lockDuration);
    return !now.isBefore(expiresAt);
  }

  private record Attempts(int failures, Instant lockedUntil, Instant lastFailureAt) {}
}
