package com.focusnagi.project;

import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectRepository extends JpaRepository<Project, Long> {

  Page<Project> findByStatus(ProjectStatus status, Pageable pageable);

  List<Project> findByStatus(ProjectStatus status);
}
