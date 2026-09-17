package com.focusnagi.journal;

import java.time.LocalDate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface JournalEntryRepository extends JpaRepository<JournalEntry, Long> {

  java.util.List<JournalEntry> findByEntryDateOrderByCreatedAtAsc(LocalDate entryDate);

  Page<JournalEntry> findByEntryDateBetween(LocalDate from, LocalDate to, Pageable pageable);
}
