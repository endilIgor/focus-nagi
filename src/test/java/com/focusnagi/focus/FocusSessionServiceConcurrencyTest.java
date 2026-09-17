package com.focusnagi.focus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.focusnagi.common.DomainException;
import com.focusnagi.project.ProjectRepository;
import com.focusnagi.task.TaskRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.function.Function;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

/**
 * Verifies that every mutating transition maps a database-level optimistic locking failure to a
 * consistent 409 domain error instead of leaking an infrastructure exception.
 */
@ExtendWith(MockitoExtension.class)
class FocusSessionServiceConcurrencyTest {

  private static final long ID = 42L;
  private static final Instant T0 = Instant.parse("2026-09-17T09:00:00Z");

  @Mock FocusSessionRepository focusSessionRepository;
  @Mock TaskRepository taskRepository;
  @Mock ProjectRepository projectRepository;

  private FocusSessionService service;

  @BeforeEach
  void setUp() {
    Clock clock = Clock.fixed(T0.plusSeconds(600), ZoneOffset.UTC);
    service =
        new FocusSessionService(
            focusSessionRepository, taskRepository, projectRepository, clock, ZoneOffset.UTC);
  }

  private static java.util.stream.Stream<org.junit.jupiter.params.provider.Arguments>
      transitions() {
    Function<FocusSessionService, Function<Long, FocusSessionResponse>> pause =
        s -> id -> s.pause(id);
    Function<FocusSessionService, Function<Long, FocusSessionResponse>> resume =
        s -> id -> s.resume(id);
    Function<FocusSessionService, Function<Long, FocusSessionResponse>> finish =
        s -> id -> s.finish(id);
    Function<FocusSessionService, Function<Long, FocusSessionResponse>> cancel =
        s -> id -> s.cancel(id);
    return java.util.stream.Stream.of(
        org.junit.jupiter.params.provider.Arguments.of("pause", runningSession(), pause),
        org.junit.jupiter.params.provider.Arguments.of("resume", pausedSession(), resume),
        org.junit.jupiter.params.provider.Arguments.of("finish", runningSession(), finish),
        org.junit.jupiter.params.provider.Arguments.of("cancel", runningSession(), cancel));
  }

  private static FocusSession runningSession() {
    return new FocusSession(25, null, null, null, T0);
  }

  private static FocusSession pausedSession() {
    FocusSession session = runningSession();
    session.pause(T0.plusSeconds(60));
    return session;
  }

  @ParameterizedTest(name = "{0} maps a concurrent modification to a 409 domain conflict")
  @MethodSource("transitions")
  void mapsOptimisticLockFailureToDomainConflict(
      String name,
      FocusSession existing,
      Function<FocusSessionService, Function<Long, FocusSessionResponse>> invoke) {
    when(focusSessionRepository.findById(ID)).thenReturn(Optional.of(existing));
    when(focusSessionRepository.saveAndFlush(any(FocusSession.class)))
        .thenThrow(new ObjectOptimisticLockingFailureException(FocusSession.class, ID));

    assertThatThrownBy(() -> invoke.apply(service).apply(ID))
        .isInstanceOf(DomainException.class)
        .satisfies(
            ex -> {
              DomainException domainException = (DomainException) ex;
              assertThat(domainException.code()).isEqualTo("FOCUS_SESSION_CONCURRENT_MODIFICATION");
              assertThat(domainException.status()).isEqualTo(HttpStatus.CONFLICT);
            });
  }
}
