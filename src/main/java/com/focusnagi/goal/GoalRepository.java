package com.focusnagi.goal;

import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GoalRepository extends JpaRepository<Goal, Long> {

  Page<Goal> findByStatus(GoalStatus status, Pageable pageable);

  List<Goal> findByStatus(GoalStatus status);
}
