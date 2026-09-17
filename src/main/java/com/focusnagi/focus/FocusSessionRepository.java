package com.focusnagi.focus;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FocusSessionRepository
    extends JpaRepository<FocusSession, Long>, JpaSpecificationExecutor<FocusSession> {

  boolean existsByStatusIn(List<FocusSessionStatus> statuses);

  boolean existsByTaskId(Long taskId);

  @Query(
      "select coalesce(sum(f.actualFocusSeconds), 0) from FocusSession f"
          + " where f.projectId = :projectId and f.status = 'COMPLETED'")
  long sumFocusSecondsByProject(@Param("projectId") long projectId);

  @Query(
      "select coalesce(sum(f.actualFocusSeconds), 0) from FocusSession f"
          + " where f.status = 'COMPLETED' and f.startedAt >= :from and f.startedAt < :to"
          + " and (:projectId is null or f.projectId = :projectId)")
  long sumFocusSecondsBetween(
      @Param("from") Instant from, @Param("to") Instant to, @Param("projectId") Long projectId);

  @Query(
      "select count(f) from FocusSession f"
          + " where f.status = 'COMPLETED' and f.startedAt >= :from and f.startedAt < :to"
          + " and (:projectId is null or f.projectId = :projectId)")
  long countCompletedBetween(
      @Param("from") Instant from, @Param("to") Instant to, @Param("projectId") Long projectId);
}
