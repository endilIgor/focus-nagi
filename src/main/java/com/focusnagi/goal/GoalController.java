package com.focusnagi.goal;

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
@RequestMapping("/api/goals")
public class GoalController {

  private final GoalService goalService;

  public GoalController(GoalService goalService) {
    this.goalService = goalService;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  GoalResponse create(@Valid @RequestBody GoalCreateRequest request) {
    return goalService.create(request);
  }

  @GetMapping
  Page<GoalResponse> list(
      @RequestParam(required = false) GoalStatus status,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size) {
    return goalService.list(status, page, size);
  }

  @GetMapping("/{id}")
  GoalResponse get(@PathVariable long id) {
    return goalService.get(id);
  }

  @PatchMapping("/{id}")
  GoalResponse update(@PathVariable long id, @Valid @RequestBody GoalUpdateRequest request) {
    return goalService.update(id, request);
  }

  @PostMapping("/{id}/complete")
  GoalResponse complete(@PathVariable long id) {
    return goalService.complete(id);
  }

  @PostMapping("/{id}/archive")
  GoalResponse archive(@PathVariable long id) {
    return goalService.archive(id);
  }

  @PostMapping("/{id}/restore")
  GoalResponse restore(@PathVariable long id) {
    return goalService.restore(id);
  }

  @GetMapping("/{id}/progress")
  GoalProgressResponse progress(@PathVariable long id) {
    return goalService.progress(id);
  }
}
