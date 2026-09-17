package com.focusnagi.task;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SubtaskRepository extends JpaRepository<Subtask, Long> {

  List<Subtask> findByTaskIdOrderByIdAsc(Long taskId);
}
