package com.focusnagi.task;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class TaskController {

  private final TaskService taskService;

  public TaskController(TaskService taskService) {
    this.taskService = taskService;
  }

  @PostMapping("/tasks")
  @ResponseStatus(HttpStatus.CREATED)
  TaskResponse create(@Valid @RequestBody TaskCreateRequest request) {
    return taskService.create(request);
  }

  @GetMapping("/tasks")
  Page<TaskResponse> list(
      @RequestParam(required = false) TaskStatus status,
      @RequestParam(required = false) Long projectId,
      @RequestParam(required = false) TaskPriority priority,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return taskService.list(status, projectId, priority, page, size);
  }

  @GetMapping("/projects/{projectId}/tasks")
  Page<TaskResponse> listByProject(
      @PathVariable long projectId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size) {
    return taskService.listByProject(projectId, page, size);
  }

  @GetMapping("/tasks/{id}")
  TaskResponse get(@PathVariable long id) {
    return taskService.get(id);
  }

  @PatchMapping("/tasks/{id}")
  TaskResponse update(@PathVariable long id, @Valid @RequestBody TaskUpdateRequest request) {
    return taskService.update(id, request);
  }

  @PostMapping("/tasks/{id}/start")
  TaskResponse start(@PathVariable long id) {
    return taskService.start(id);
  }

  @PostMapping("/tasks/{id}/complete")
  TaskResponse complete(@PathVariable long id) {
    return taskService.complete(id);
  }

  @PostMapping("/tasks/{id}/reopen")
  TaskResponse reopen(@PathVariable long id) {
    return taskService.reopen(id);
  }

  @PostMapping("/tasks/{id}/cancel")
  TaskResponse cancel(@PathVariable long id) {
    return taskService.cancel(id);
  }

  @DeleteMapping("/tasks/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void delete(@PathVariable long id) {
    taskService.delete(id);
  }

  @PostMapping("/tasks/{id}/subtasks")
  @ResponseStatus(HttpStatus.CREATED)
  SubtaskResponse addSubtask(
      @PathVariable long id, @Valid @RequestBody SubtaskCreateRequest request) {
    return taskService.addSubtask(id, request.title());
  }

  @PostMapping("/tasks/{id}/subtasks/{subtaskId}/complete")
  SubtaskResponse completeSubtask(@PathVariable long id, @PathVariable long subtaskId) {
    return taskService.completeSubtask(id, subtaskId);
  }

  @PostMapping("/tasks/{id}/subtasks/{subtaskId}/reopen")
  SubtaskResponse reopenSubtask(@PathVariable long id, @PathVariable long subtaskId) {
    return taskService.reopenSubtask(id, subtaskId);
  }

  @DeleteMapping("/tasks/{id}/subtasks/{subtaskId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void deleteSubtask(@PathVariable long id, @PathVariable long subtaskId) {
    taskService.deleteSubtask(id, subtaskId);
  }

  public record SubtaskCreateRequest(
      @NotBlank(message = "is required")
          @Size(max = 200, message = "must be at most 200 characters")
          String title) {}
}
