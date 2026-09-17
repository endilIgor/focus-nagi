package com.focusnagi.project;

import com.focusnagi.focus.FocusSessionService;
import com.focusnagi.focus.ProjectFocusResponse;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
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
@RequestMapping("/api/projects")
public class ProjectController {

  private final ProjectService projectService;
  private final FocusSessionService focusSessionService;

  public ProjectController(ProjectService projectService, FocusSessionService focusSessionService) {
    this.projectService = projectService;
    this.focusSessionService = focusSessionService;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  ProjectResponse create(@Valid @RequestBody ProjectCreateRequest request) {
    return projectService.create(request);
  }

  @GetMapping
  Page<ProjectResponse> list(
      @RequestParam(required = false) ProjectStatus status,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return projectService.list(status, page, size);
  }

  @GetMapping("/{id}")
  ProjectResponse get(@PathVariable long id) {
    return projectService.get(id);
  }

  @PatchMapping("/{id}")
  ProjectResponse update(@PathVariable long id, @Valid @RequestBody ProjectUpdateRequest request) {
    return projectService.update(id, request);
  }

  @PostMapping("/{id}/complete")
  ProjectResponse complete(@PathVariable long id) {
    return projectService.complete(id);
  }

  @PostMapping("/{id}/archive")
  ProjectResponse archive(@PathVariable long id) {
    return projectService.archive(id);
  }

  @PostMapping("/{id}/restore")
  ProjectResponse restore(@PathVariable long id) {
    return projectService.restore(id);
  }

  @GetMapping("/{id}/focus")
  ProjectFocusResponse focus(@PathVariable long id) {
    return focusSessionService.projectFocus(id);
  }
}
