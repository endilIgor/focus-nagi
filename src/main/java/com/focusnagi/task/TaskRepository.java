package com.focusnagi.task;

import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TaskRepository extends JpaRepository<Task, Long>, JpaSpecificationExecutor<Task> {

  @Query(
      "select count(t) from Task t"
          + " where t.completedAt >= :from and t.completedAt < :to"
          + " and (:projectId is null or t.projectId = :projectId)")
  long countCompletedBetween(
      @Param("from") Instant from, @Param("to") Instant to, @Param("projectId") Long projectId);
}
