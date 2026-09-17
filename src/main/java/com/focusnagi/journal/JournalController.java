package com.focusnagi.journal;

import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
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
@RequestMapping("/api/journal")
public class JournalController {

  private final JournalService journalService;

  public JournalController(JournalService journalService) {
    this.journalService = journalService;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  JournalEntryResponse create(@Valid @RequestBody JournalEntryCreateRequest request) {
    return journalService.create(request);
  }

  @GetMapping
  List<JournalEntryResponse> byDate(@RequestParam LocalDate date) {
    return journalService.byDate(date);
  }

  @GetMapping("/range")
  Page<JournalEntryResponse> range(
      @RequestParam LocalDate from,
      @RequestParam LocalDate to,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return journalService.range(from, to, page, size);
  }

  @GetMapping("/recent")
  Page<JournalEntryResponse> recent(
      @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
    return journalService.recent(page, size);
  }

  @PatchMapping("/{id}")
  JournalEntryResponse update(
      @PathVariable long id, @Valid @RequestBody JournalEntryUpdateRequest request) {
    return journalService.update(id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void delete(@PathVariable long id) {
    journalService.delete(id);
  }
}
