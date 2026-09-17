package com.focusnagi.focus;

import com.focusnagi.common.DomainException;
import com.focusnagi.project.ProjectRepository;
import com.focusnagi.task.TaskRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FocusSessionService {

  static final int MAX_PAGE_SIZE = 100;
  private static final List<FocusSessionStatus> ACTIVE_STATUSES =
      List.of(FocusSessionStatus.RUNNING, FocusSessionStatus.PAUSED);

  private final FocusSessionRepository focusSessionRepository;
  private final TaskRepository taskRepository;
  private final ProjectRepository projectRepository;
  private final Clock clock;
  private final ZoneId zoneId;

  public FocusSessionService(
      FocusSessionRepository focusSessionRepository,
      TaskRepository taskRepository,
      ProjectRepository projectRepository,
      Clock clock,
      ZoneId appZoneId) {
    this.focusSessionRepository = focusSessionRepository;
    this.taskRepository = taskRepository;
    this.projectRepository = projectRepository;
    this.clock = clock;
    this.zoneId = appZoneId;
  }

  @Transactional
  public FocusSessionResponse start(FocusSessionStartRequest request) {
    Long projectId = resolveProject(request.taskId(), request.projectId());

    if (focusSessionRepository.existsByStatusIn(ACTIVE_STATUSES)) {
      throw alreadyRunning();
    }
    FocusSession session =
        new FocusSession(
            request.plannedFocusMinutes(),
            request.plannedBreakMinutes(),
            request.taskId(),
            projectId,
            clock.instant());
    try {
      return FocusSessionResponse.from(focusSessionRepository.saveAndFlush(session));
    } catch (DataIntegrityViolationException ex) {
      // Concurrency backstop: the partial unique index guards the single active session.
      throw alreadyRunning();
    }
  }

  @Transactional(readOnly = true)
  public FocusSessionResponse current() {
    return focusSessionRepository.findAll(activeSpec()).stream()
        .findFirst()
        .map(FocusSessionResponse::from)
        .orElseThrow(
            () -> DomainException.notFound("FOCUS_SESSION_NOT_FOUND", "No active focus session."));
  }

  @Transactional(readOnly = true)
  public FocusSessionResponse currentOrNull() {
    return focusSessionRepository.findAll(activeSpec()).stream()
        .findFirst()
        .map(FocusSessionResponse::from)
        .orElse(null);
  }

  @Transactional(readOnly = true)
  public Page<FocusSessionResponse> history(
      FocusSessionStatus status,
      Long projectId,
      Long taskId,
      LocalDate from,
      LocalDate to,
      int page,
      int size) {
    Specification<FocusSession> spec = Specification.where(null);
    if (status != null) {
      spec = spec.and((root, q, cb) -> cb.equal(root.get("status"), status));
    }
    if (projectId != null) {
      spec = spec.and((root, q, cb) -> cb.equal(root.get("projectId"), projectId));
    }
    if (taskId != null) {
      spec = spec.and((root, q, cb) -> cb.equal(root.get("taskId"), taskId));
    }
    if (from != null) {
      spec =
          spec.and(
              (root, q, cb) ->
                  cb.greaterThanOrEqualTo(
                      root.get("startedAt"), from.atStartOfDay(zoneId).toInstant()));
    }
    if (to != null) {
      spec =
          spec.and(
              (root, q, cb) ->
                  cb.lessThan(
                      root.get("startedAt"), to.plusDays(1).atStartOfDay(zoneId).toInstant()));
    }
    Pageable pageable =
        PageRequest.of(
            Math.max(page, 0),
            Math.min(Math.max(size, 1), MAX_PAGE_SIZE),
            Sort.by(Sort.Direction.DESC, "startedAt"));
    return focusSessionRepository.findAll(spec, pageable).map(FocusSessionResponse::from);
  }

  @Transactional
  public FocusSessionResponse pause(long id) {
    FocusSession session = find(id);
    session.pause(clock.instant());
    return FocusSessionResponse.from(focusSessionRepository.save(session));
  }

  @Transactional
  public FocusSessionResponse resume(long id) {
    FocusSession session = find(id);
    session.resume(clock.instant());
    return FocusSessionResponse.from(focusSessionRepository.save(session));
  }

  @Transactional
  public FocusSessionResponse finish(long id) {
    FocusSession session = find(id);
    session.finish(clock.instant());
    return FocusSessionResponse.from(focusSessionRepository.save(session));
  }

  @Transactional
  public FocusSessionResponse cancel(long id) {
    FocusSession session = find(id);
    session.cancel(clock.instant());
    return FocusSessionResponse.from(focusSessionRepository.save(session));
  }

  @Transactional(readOnly = true)
  public ProjectFocusResponse projectFocus(long projectId) {
    if (!projectRepository.existsById(projectId)) {
      throw DomainException.notFound("PROJECT_NOT_FOUND", "Project not found.");
    }
    return new ProjectFocusResponse(
        projectId, focusSessionRepository.sumFocusSecondsByProject(projectId));
  }

  private Long resolveProject(Long taskId, Long projectId) {
    if (taskId == null) {
      if (projectId != null && !projectRepository.existsById(projectId)) {
        throw DomainException.notFound("PROJECT_NOT_FOUND", "Project not found.");
      }
      return projectId;
    }
    var task =
        taskRepository
            .findById(taskId)
            .orElseThrow(() -> DomainException.notFound("TASK_NOT_FOUND", "Task not found."));
    Long taskProjectId = task.getProjectId();
    if (taskProjectId != null) {
      if (projectId != null && !projectId.equals(taskProjectId)) {
        throw DomainException.badRequest(
            "FOCUS_SESSION_PROJECT_MISMATCH", "Task belongs to a different project.");
      }
      return taskProjectId;
    }
    if (projectId != null && !projectRepository.existsById(projectId)) {
      throw DomainException.notFound("PROJECT_NOT_FOUND", "Project not found.");
    }
    return projectId;
  }

  private Specification<FocusSession> activeSpec() {
    return (root, q, cb) -> root.get("status").in(ACTIVE_STATUSES);
  }

  private FocusSession find(long id) {
    return focusSessionRepository
        .findById(id)
        .orElseThrow(
            () -> DomainException.notFound("FOCUS_SESSION_NOT_FOUND", "Focus session not found."));
  }

  private DomainException alreadyRunning() {
    return DomainException.conflict(
        "FOCUS_SESSION_ALREADY_RUNNING", "There is already an active focus session.");
  }
}
