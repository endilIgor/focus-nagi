package com.focusnagi.note;

import jakarta.validation.Valid;
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
@RequestMapping("/api/notes")
public class NoteController {

  private final NoteService noteService;

  public NoteController(NoteService noteService) {
    this.noteService = noteService;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  NoteResponse create(@Valid @RequestBody NoteCreateRequest request) {
    return noteService.create(request);
  }

  @GetMapping
  Page<NoteResponse> list(
      @RequestParam(required = false) Boolean pinned,
      @RequestParam(required = false) Long projectId,
      @RequestParam(required = false) String q,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return noteService.list(pinned, projectId, q, page, size);
  }

  @GetMapping("/{id}")
  NoteResponse get(@PathVariable long id) {
    return noteService.get(id);
  }

  @PatchMapping("/{id}")
  NoteResponse update(@PathVariable long id, @Valid @RequestBody NoteUpdateRequest request) {
    return noteService.update(id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void delete(@PathVariable long id) {
    noteService.delete(id);
  }

  @PostMapping("/{id}/pin")
  NoteResponse pin(@PathVariable long id) {
    return noteService.pin(id);
  }

  @PostMapping("/{id}/unpin")
  NoteResponse unpin(@PathVariable long id) {
    return noteService.unpin(id);
  }
}
