package com.focusnagi.journal;

import com.focusnagi.common.DomainException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JournalService {

  static final int MAX_PAGE_SIZE = 100;

  private final JournalEntryRepository journalEntryRepository;
  private final Clock clock;
  private final ZoneId zoneId;

  public JournalService(
      JournalEntryRepository journalEntryRepository, Clock clock, ZoneId appZoneId) {
    this.journalEntryRepository = journalEntryRepository;
    this.clock = clock;
    this.zoneId = appZoneId;
  }

  @Transactional
  public JournalEntryResponse create(JournalEntryCreateRequest request) {
    rejectFutureDate(request.entryDate());
    JournalEntry entry =
        new JournalEntry(request.entryDate(), request.content().trim(), clock.instant());
    return JournalEntryResponse.from(journalEntryRepository.save(entry));
  }

  @Transactional(readOnly = true)
  public List<JournalEntryResponse> byDate(LocalDate date) {
    return journalEntryRepository.findByEntryDateOrderByCreatedAtAsc(date).stream()
        .map(JournalEntryResponse::from)
        .toList();
  }

  @Transactional(readOnly = true)
  public Page<JournalEntryResponse> range(LocalDate from, LocalDate to, int page, int size) {
    if (from == null || to == null || to.isBefore(from)) {
      throw DomainException.badRequest("JOURNAL_INVALID_RANGE", "Invalid date range.");
    }
    Pageable pageable =
        PageRequest.of(
            Math.max(page, 0),
            Math.min(Math.max(size, 1), MAX_PAGE_SIZE),
            Sort.by(Sort.Direction.ASC, "entryDate").and(Sort.by(Sort.Direction.ASC, "createdAt")));
    return journalEntryRepository
        .findByEntryDateBetween(from, to, pageable)
        .map(JournalEntryResponse::from);
  }

  @Transactional(readOnly = true)
  public Page<JournalEntryResponse> recent(int page, int size) {
    Pageable pageable =
        PageRequest.of(
            Math.max(page, 0),
            Math.min(Math.max(size, 1), MAX_PAGE_SIZE),
            Sort.by(Sort.Direction.DESC, "entryDate")
                .and(Sort.by(Sort.Direction.DESC, "createdAt")));
    return journalEntryRepository.findAll(pageable).map(JournalEntryResponse::from);
  }

  @Transactional
  public JournalEntryResponse update(long id, JournalEntryUpdateRequest request) {
    JournalEntry entry = find(id);
    if (request.entryDate() != null) {
      rejectFutureDate(request.entryDate());
    }
    entry.update(request.entryDate(), request.content(), clock.instant());
    return JournalEntryResponse.from(journalEntryRepository.save(entry));
  }

  @Transactional
  public void delete(long id) {
    journalEntryRepository.delete(find(id));
  }

  private void rejectFutureDate(LocalDate date) {
    LocalDate today = LocalDate.ofInstant(clock.instant(), zoneId);
    if (date.isAfter(today)) {
      throw DomainException.badRequest(
          "JOURNAL_FUTURE_DATE", "Entry date cannot be in the future.");
    }
  }

  private JournalEntry find(long id) {
    return journalEntryRepository
        .findById(id)
        .orElseThrow(
            () -> DomainException.notFound("JOURNAL_ENTRY_NOT_FOUND", "Journal entry not found."));
  }
}
