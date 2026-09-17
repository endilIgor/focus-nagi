package com.focusnagi.note;

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
public class NoteService {

  static final int MAX_PAGE_SIZE = 100;

  private final NoteRepository noteRepository;
  private final ProjectRepository projectRepository;
  private final Clock clock;

  public NoteService(
      NoteRepository noteRepository, ProjectRepository projectRepository, Clock clock) {
    this.noteRepository = noteRepository;
    this.projectRepository = projectRepository;
    this.clock = clock;
  }

  @Transactional
  public NoteResponse create(NoteCreateRequest request) {
    requireProjectExists(request.projectId());
    Note note =
        new Note(request.title().trim(), request.content(), request.projectId(), clock.instant());
    return NoteResponse.from(noteRepository.save(note));
  }

  @Transactional(readOnly = true)
  public Page<NoteResponse> list(Boolean pinned, Long projectId, String q, int page, int size) {
    Specification<Note> spec = Specification.where(null);
    if (pinned != null) {
      spec = spec.and((root, query, cb) -> cb.equal(root.get("pinned"), pinned));
    }
    if (projectId != null) {
      spec = spec.and((root, query, cb) -> cb.equal(root.get("projectId"), projectId));
    }
    if (q != null && !q.isBlank()) {
      String pattern = "%" + escapeLike(q.trim().toLowerCase()) + "%";
      spec =
          spec.and(
              (root, query, cb) ->
                  cb.or(
                      cb.like(cb.lower(root.get("title")), pattern, '\\'),
                      cb.like(cb.lower(root.get("content")), pattern, '\\')));
    }
    Pageable pageable =
        PageRequest.of(
            Math.max(page, 0),
            Math.min(Math.max(size, 1), MAX_PAGE_SIZE),
            Sort.by(Sort.Order.desc("pinned"), Sort.Order.desc("updatedAt")));
    return noteRepository.findAll(spec, pageable).map(NoteResponse::from);
  }

  @Transactional(readOnly = true)
  public NoteResponse get(long id) {
    return NoteResponse.from(find(id));
  }

  @Transactional
  public NoteResponse update(long id, NoteUpdateRequest request) {
    requireProjectExists(request.projectId());
    Note note = find(id);
    note.update(
        request.title() == null ? null : request.title().trim(),
        request.content(),
        request.projectId(),
        clock.instant());
    return NoteResponse.from(noteRepository.save(note));
  }

  @Transactional
  public void delete(long id) {
    noteRepository.delete(find(id));
  }

  @Transactional
  public NoteResponse pin(long id) {
    Note note = find(id);
    note.pin();
    return NoteResponse.from(noteRepository.save(note));
  }

  @Transactional
  public NoteResponse unpin(long id) {
    Note note = find(id);
    note.unpin();
    return NoteResponse.from(noteRepository.save(note));
  }

  Note find(long id) {
    return noteRepository
        .findById(id)
        .orElseThrow(() -> DomainException.notFound("NOTE_NOT_FOUND", "Note not found."));
  }

  private void requireProjectExists(Long projectId) {
    if (projectId != null && !projectRepository.existsById(projectId)) {
      throw DomainException.notFound("PROJECT_NOT_FOUND", "Project not found.");
    }
  }

  private String escapeLike(String value) {
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
  }
}
