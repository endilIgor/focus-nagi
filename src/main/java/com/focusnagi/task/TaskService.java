package com.focusnagi.task;

import com.focusnagi.common.DomainException;
import com.focusnagi.project.ProjectRepository;
import java.time.Clock;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TaskService {

  static final int MAX_PAGE_SIZE = 100;

  private final TaskRepository taskRepository;
  private final SubtaskRepository subtaskRepository;
  private final ProjectRepository projectRepository;
  private final com.focusnagi.focus.FocusSessionRepository focusSessionRepository;
  private final Clock clock;

  public TaskService(
      TaskRepository taskRepository,
      SubtaskRepository subtaskRepository,
      ProjectRepository projectRepository,
      com.focusnagi.focus.FocusSessionRepository focusSessionRepository,
      Clock clock) {
    this.taskRepository = taskRepository;
    this.subtaskRepository = subtaskRepository;
    this.projectRepository = projectRepository;
    this.focusSessionRepository = focusSessionRepository;
    this.clock = clock;
  }

  @Transactional
  public TaskResponse create(TaskCreateRequest request) {
    requireProjectExists(request.projectId());
    Task task =
        new Task(
            request.title().trim(),
            request.description(),
            request.priority(),
            request.estimatedMinutes(),
            request.dueDate(),
            request.projectId(),
            clock.instant());
    return TaskResponse.summary(taskRepository.save(task));
  }

  @Transactional(readOnly = true)
  public Page<TaskResponse> list(
      TaskStatus status, Long projectId, TaskPriority priority, int page, int size) {
    Specification<Task> spec = Specification.where(null);
    if (status != null) {
      spec = spec.and((root, q, cb) -> cb.equal(root.get("status"), status));
    }
    if (projectId != null) {
      spec = spec.and((root, q, cb) -> cb.equal(root.get("projectId"), projectId));
    }
    if (priority != null) {
      spec = spec.and((root, q, cb) -> cb.equal(root.get("priority"), priority));
    }
    Pageable pageable = pageable(page, size);
    return taskRepository.findAll(spec, pageable).map(TaskResponse::summary);
  }

  @Transactional(readOnly = true)
  public Page<TaskResponse> listByProject(long projectId, int page, int size) {
    if (!projectRepository.existsById(projectId)) {
      throw DomainException.notFound("PROJECT_NOT_FOUND", "Project not found.");
    }
    return taskRepository
        .findAll(
            (Specification<Task>) (root, q, cb) -> cb.equal(root.get("projectId"), projectId),
            pageable(page, size))
        .map(TaskResponse::summary);
  }

  @Transactional(readOnly = true)
  public TaskResponse get(long id) {
    return TaskResponse.of(find(id), subtaskRepository.findByTaskIdOrderByIdAsc(id));
  }

  @Transactional
  public TaskResponse update(long id, TaskUpdateRequest request) {
    Task task = find(id);
    requireProjectExists(request.projectId());
    task.update(
        request.title() == null ? null : request.title().trim(),
        request.description(),
        request.priority(),
        request.estimatedMinutes(),
        request.dueDate(),
        request.projectId(),
        clock.instant());
    return TaskResponse.of(
        taskRepository.save(task), subtaskRepository.findByTaskIdOrderByIdAsc(id));
  }

  @Transactional
  public TaskResponse start(long id) {
    Task task = find(id);
    task.start(clock.instant());
    return TaskResponse.summary(taskRepository.save(task));
  }

  @Transactional
  public TaskResponse complete(long id) {
    Task task = find(id);
    task.complete(clock.instant());
    return TaskResponse.summary(taskRepository.save(task));
  }

  @Transactional
  public TaskResponse reopen(long id) {
    Task task = find(id);
    task.reopen(clock.instant());
    return TaskResponse.summary(taskRepository.save(task));
  }

  @Transactional
  public TaskResponse cancel(long id) {
    Task task = find(id);
    task.cancel(clock.instant());
    return TaskResponse.summary(taskRepository.save(task));
  }

  @Transactional
  public void delete(long id) {
    Task task = find(id);
    if (focusSessionRepository.existsByTaskId(id)) {
      throw DomainException.conflict(
          "TASK_HAS_FOCUS_SESSIONS",
          "Task has focus sessions and cannot be deleted. Cancel it instead.");
    }
    taskRepository.delete(task);
  }

  @Transactional
  public SubtaskResponse addSubtask(long taskId, String title) {
    find(taskId);
    Subtask subtask = new Subtask(taskId, title.trim(), clock.instant());
    return SubtaskResponse.from(subtaskRepository.save(subtask));
  }

  @Transactional
  public SubtaskResponse completeSubtask(long taskId, long subtaskId) {
    Subtask subtask = findSubtask(taskId, subtaskId);
    subtask.complete();
    return SubtaskResponse.from(subtaskRepository.save(subtask));
  }

  @Transactional
  public SubtaskResponse reopenSubtask(long taskId, long subtaskId) {
    Subtask subtask = findSubtask(taskId, subtaskId);
    subtask.reopen();
    return SubtaskResponse.from(subtaskRepository.save(subtask));
  }

  @Transactional
  public void deleteSubtask(long taskId, long subtaskId) {
    Subtask subtask = findSubtask(taskId, subtaskId);
    subtaskRepository.delete(subtask);
  }

  Task find(long id) {
    return taskRepository
        .findById(id)
        .orElseThrow(() -> DomainException.notFound("TASK_NOT_FOUND", "Task not found."));
  }

  private Subtask findSubtask(long taskId, long subtaskId) {
    find(taskId);
    Subtask subtask =
        subtaskRepository
            .findById(subtaskId)
            .filter(s -> s.getTaskId().equals(taskId))
            .orElseThrow(() -> DomainException.notFound("SUBTASK_NOT_FOUND", "Subtask not found."));
    return subtask;
  }

  private void requireProjectExists(Long projectId) {
    if (projectId != null && !projectRepository.existsById(projectId)) {
      throw DomainException.notFound("PROJECT_NOT_FOUND", "Project not found.");
    }
  }

  private Pageable pageable(int page, int size) {
    int safePage = Math.max(page, 0);
    int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
    return PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.DESC, "createdAt"));
  }
}
