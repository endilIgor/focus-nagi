package com.focusnagi.focus;

import jakarta.validation.Valid;
import java.time.LocalDate;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/focus-sessions")
public class FocusSessionController {

  private final FocusSessionService focusSessionService;

  public FocusSessionController(FocusSessionService focusSessionService) {
    this.focusSessionService = focusSessionService;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  FocusSessionResponse start(@Valid @RequestBody FocusSessionStartRequest request) {
    return focusSessionService.start(request);
  }

  @GetMapping("/current")
  ResponseEntity<FocusSessionResponse> current() {
    FocusSessionResponse current = focusSessionService.currentOrNull();
    if (current == null) {
      return ResponseEntity.noContent().build();
    }
    return ResponseEntity.ok(current);
  }

  @GetMapping
  Page<FocusSessionResponse> history(
      @RequestParam(required = false) FocusSessionStatus status,
      @RequestParam(required = false) Long projectId,
      @RequestParam(required = false) Long taskId,
      @RequestParam(required = false) LocalDate from,
      @RequestParam(required = false) LocalDate to,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return focusSessionService.history(status, projectId, taskId, from, to, page, size);
  }

  @PostMapping("/{id}/pause")
  FocusSessionResponse pause(@PathVariable long id) {
    return focusSessionService.pause(id);
  }

  @PostMapping("/{id}/resume")
  FocusSessionResponse resume(@PathVariable long id) {
    return focusSessionService.resume(id);
  }

  @PostMapping("/{id}/finish")
  FocusSessionResponse finish(@PathVariable long id) {
    return focusSessionService.finish(id);
  }

  @PostMapping("/{id}/cancel")
  FocusSessionResponse cancel(@PathVariable long id) {
    return focusSessionService.cancel(id);
  }
}
