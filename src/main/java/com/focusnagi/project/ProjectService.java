package com.focusnagi.project;

import com.focusnagi.common.DomainException;
import java.time.Clock;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProjectService {

  static final int MAX_PAGE_SIZE = 100;

  private final ProjectRepository projectRepository;
  private final Clock clock;

  public ProjectService(ProjectRepository projectRepository, Clock clock) {
    this.projectRepository = projectRepository;
    this.clock = clock;
  }

  @Transactional
  public ProjectResponse create(ProjectCreateRequest request) {
    validateDates(request.startDate(), request.dueDate());
    Project project =
        new Project(
            request.title().trim(),
            request.description(),
            request.startDate(),
            request.dueDate(),
            clock.instant());
    return ProjectResponse.from(projectRepository.save(project));
  }

  @Transactional(readOnly = true)
  public Page<ProjectResponse> list(ProjectStatus status, int page, int size) {
    Pageable pageable =
        PageRequest.of(page, clampSize(size), Sort.by(Sort.Direction.DESC, "createdAt"));
    Page<Project> projects =
        status == null
            ? projectRepository.findAll(pageable)
            : projectRepository.findByStatus(status, pageable);
    return projects.map(ProjectResponse::from);
  }

  @Transactional(readOnly = true)
  public ProjectResponse get(long id) {
    return ProjectResponse.from(find(id));
  }

  @Transactional
  public ProjectResponse update(long id, ProjectUpdateRequest request) {
    Project project = find(id);
    project.update(
        request.title() == null ? null : request.title().trim(),
        request.description(),
        request.startDate(),
        request.dueDate(),
        clock.instant());
    return ProjectResponse.from(projectRepository.save(project));
  }

  @Transactional
  public ProjectResponse complete(long id) {
    Project project = find(id);
    project.complete(clock.instant());
    return ProjectResponse.from(projectRepository.save(project));
  }

  @Transactional
  public ProjectResponse archive(long id) {
    Project project = find(id);
    project.archive(clock.instant());
    return ProjectResponse.from(projectRepository.save(project));
  }

  @Transactional
  public ProjectResponse restore(long id) {
    Project project = find(id);
    project.restore(clock.instant());
    return ProjectResponse.from(projectRepository.save(project));
  }

  Project find(long id) {
    return projectRepository
        .findById(id)
        .orElseThrow(() -> DomainException.notFound("PROJECT_NOT_FOUND", "Project not found."));
  }

  private void validateDates(java.time.LocalDate startDate, java.time.LocalDate dueDate) {
    if (startDate != null && dueDate != null && dueDate.isBefore(startDate)) {
      throw DomainException.badRequest(
          "PROJECT_INVALID_DATES", "Due date cannot be before start date.");
    }
  }

  private int clampSize(int size) {
    return Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
  }
}
