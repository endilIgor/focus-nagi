package com.focusnagi;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;

/** Mutable clock for deterministic time-based tests. Not thread-safe by design. */
public class MutableClock extends Clock {

  private Instant current;
  private final ZoneId zone;

  public MutableClock(Instant initial) {
    this(initial, ZoneId.of("UTC"));
  }

  private MutableClock(Instant current, ZoneId zone) {
    this.current = current;
    this.zone = zone;
  }

  public void advance(Duration duration) {
    current = current.plus(duration);
  }

  @Override
  public ZoneId getZone() {
    return zone;
  }

  @Override
  public Clock withZone(ZoneId zone) {
    return new MutableClock(current, zone);
  }

  @Override
  public Instant instant() {
    return current;
  }
}
