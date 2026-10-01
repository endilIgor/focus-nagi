import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { analyticsApi } from "../api/analytics";
import { journalApi } from "../api/journal";
import type { JournalEntryResponse, Page } from "../api/types";
import { ParticleAnchor } from "../components/particles/ParticleScene";
import { formatMinutesAsHm } from "../hooks/useClock";
import { addDaysIso, todayIso } from "../utils/date";
import { describeApiError } from "../utils/errors";
import styles from "./JournalPage.module.css";

type ActivityFilter = "all" | "journal" | "focus" | "checklist";

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "Tudo" },
  { id: "journal", label: "Diário" },
  { id: "focus", label: "Foco" },
  { id: "checklist", label: "Checklist" },
];

type TimelineEvent =
  | { kind: "journal"; key: string; text: string }
  | { kind: "focus"; key: string; minutes: number }
  | { kind: "checklist"; key: string; total: number; completed: number };

interface TimelineDay {
  date: string;
  label: string;
  events: TimelineEvent[];
}

interface TimelineMonth {
  label: string;
  days: TimelineDay[];
}

function dayLabel(date: string, today: string): string {
  if (date === today) return "hoje";
  if (date === addDaysIso(today, -1)) return "ontem";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
    .replace(/\./g, "");
}

function monthLabelOf(date: string): string {
  return new Date(`${date.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function JournalPage() {
  const queryClient = useQueryClient();
  const today = todayIso();
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<ActivityFilter>("all");

  const recentQuery = useQuery({ queryKey: ["journal", "recent", page], queryFn: () => journalApi.recent(page, 10) });

  const saveMutation = useMutation({
    mutationFn: () => journalApi.create({ entryDate: today, content: draft }),
    onMutate: () => queryClient.cancelQueries({ queryKey: ["journal", "recent"] }),
    onSuccess: async (entry) => {
      await queryClient.cancelQueries({ queryKey: ["journal", "recent"] });
      queryClient.setQueryData<Page<JournalEntryResponse>>(["journal", "recent", 0], (old) => {
        const current = old ?? {
          content: [], totalElements: 0, totalPages: 1, size: 10, number: 0,
          numberOfElements: 0, first: true, last: true, empty: true,
        };
        const content = [entry, ...current.content.filter((item) => item.id !== entry.id)].slice(0, current.size);
        const totalElements = current.totalElements + 1;
        return {
          ...current, content, totalElements, totalPages: Math.ceil(totalElements / current.size),
          numberOfElements: content.length, empty: false, last: totalElements <= current.size,
        };
      });
      setPage(0);
      setDraft("");
      setError(null);
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["journal", "recent"], predicate: (query) => query.queryKey[2] !== 0 });
    },
    onError: (err) => setError(describeApiError(err)),
  });

  const entries = recentQuery.data?.content ?? [];
  const entryDates = entries.map((item) => item.entryDate);
  // Activity covers the interval of the visible journal page. The first page
  // always reaches today, so focus/checklist days without a note still show up
  // (an empty or failed journal falls back to today alone); historical pages
  // keep their own interval.
  let activityFrom: string | null = null;
  let activityTo: string | null = null;
  if (!recentQuery.isPending) {
    const bounds = page === 0 ? [...entryDates, today] : entryDates;
    if (bounds.length > 0) {
      activityFrom = bounds.reduce((min, date) => (date < min ? date : min));
      activityTo = bounds.reduce((max, date) => (date > max ? date : max));
    }
  }
  const focusActivityQuery = useQuery({
    queryKey: ["analytics", "by-day", activityFrom, activityTo],
    queryFn: () => analyticsApi.byDay(activityFrom!, activityTo!),
    enabled: activityFrom !== null && activityTo !== null,
  });
  const checklistActivityQuery = useQuery({
    queryKey: ["analytics", "checklist", activityFrom, activityTo],
    queryFn: () => analyticsApi.checklistDaily(activityFrom!, activityTo!),
    enabled: activityFrom !== null && activityTo !== null,
  });
  const inRange = (date: string) =>
    activityFrom !== null && activityTo !== null && date >= activityFrom && date <= activityTo;
  const focusByDate = new Map(
    (focusActivityQuery.data ?? [])
      .filter((day) => day.focusedMinutes > 0 && inRange(day.date))
      .map((day) => [day.date, day.focusedMinutes]),
  );
  const checklistByDate = new Map(
    (checklistActivityQuery.data ?? []).filter((day) => day.total > 0 && inRange(day.date)).map((day) => [day.date, day]),
  );
  // Focus bars are relative to the busiest day of the interval, not to a goal.
  const maxFocusMinutes = Math.max(0, ...focusByDate.values());
  const activityLoading = focusActivityQuery.isLoading || checklistActivityQuery.isLoading;

  const matchesFilter = (event: TimelineEvent) => filter === "all" || event.kind === filter;

  // Each day of the union of journal, focus and checklist dates merges the real
  // activity of that date, newest first, grouped by calendar month.
  const dates = Array.from(new Set([...entryDates, ...focusByDate.keys(), ...checklistByDate.keys()])).sort(
    (a, b) => (a < b ? 1 : a > b ? -1 : 0),
  );
  const months: TimelineMonth[] = [];
  let lastMonth: TimelineMonth | null = null;
  for (const date of dates) {
    const events: TimelineEvent[] = [];
    for (const item of entries.filter((candidate) => candidate.entryDate === date)) {
      events.push({ kind: "journal", key: `journal-${item.id}`, text: item.content });
    }
    const focusedMinutes = focusByDate.get(date);
    if (focusedMinutes !== undefined) {
      events.push({ kind: "focus", key: `focus-${date}`, minutes: focusedMinutes });
    }
    const checklistDay = checklistByDate.get(date);
    if (checklistDay) {
      events.push({
        kind: "checklist",
        key: `checklist-${date}`,
        total: checklistDay.total,
        completed: checklistDay.completed,
      });
    }
    const monthLabel = monthLabelOf(date);
    if (!lastMonth || lastMonth.label !== monthLabel) {
      lastMonth = { label: monthLabel, days: [] };
      months.push(lastMonth);
    }
    lastMonth.days.push({ date, label: dayLabel(date, today), events: events.filter(matchesFilter) });
  }
  const visibleMonths = months.filter((month) => month.days.some((day) => day.events.length > 0));
  const totalFocusMinutes = Array.from(focusByDate.values()).reduce((sum, minutes) => sum + minutes, 0);
  // Never present an unknown total as a confirmed zero.
  const focusSummary =
    focusActivityQuery.isSuccess || (activityFrom === null && !recentQuery.isPending)
      ? formatMinutesAsHm(totalFocusMinutes)
      : focusActivityQuery.isError
        ? "foco indisponível"
        : "foco —";
  const summary = `${dates.length} ${dates.length === 1 ? "dia" : "dias"} · ${focusSummary} · ${entries.length} ${
    entries.length === 1 ? "entrada" : "entradas"
  }`;
  const recent = recentQuery.data;

  return (
    <div className={styles.page}>
      <section className="fn-hero">
        <div className="fn-hero-copy">
          <div className="fn-eyebrow">
            <span className="fn-eyebrow-bar" aria-hidden="true" />
            <span className="fn-eyebrow-text">Registro pessoal · {today}</span>
          </div>
          <h1 className="fn-h1">Diário.</h1>
        </div>
        <ParticleAnchor className="fn-hero-anchor" shape="cloud" aria-hidden="true" />
      </section>

      <div className={styles.columns}>
        <div className={styles.editorColumn}>
          <div className={styles.editorInner}>
            {saved && !error && (
              <div role="status" className={styles.saved}>
                Dia salvo.
              </div>
            )}
            {error && (
              <div className="fn-error-banner" role="alert">
                {error}
              </div>
            )}
            {recentQuery.isError && (
              <div className="fn-error-banner">
                Não foi possível carregar os registros. Recarregue a página e tente novamente.
              </div>
            )}
            <textarea
              className={styles.editor}
              rows={9}
              placeholder="O que travou, o que fluiu, o que amanhã herda..."
              value={draft}
              disabled={saveMutation.isPending}
              onChange={(e) => {
                setDraft(e.target.value);
                setSaved(false);
              }}
            />
            <div className={styles.editorFooter}>
              <span className={styles.charCount}>{draft.length} caracteres</span>
              <button
                type="button"
                className="fn-btn-primary"
                disabled={saveMutation.isPending || !draft.trim()}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? "Salvando..." : "Salvar entrada"}
              </button>
            </div>
          </div>
        </div>

        <div className={styles.timelineColumn}>
          <div className={styles.timelineHead}>
            <h2 className={`fn-h2 ${styles.timelineTitle}`}>Atividade</h2>
            <span className="fn-mono-label">{summary}</span>
          </div>
          <div className={styles.filters} role="group" aria-label="Filtrar atividade">
            {FILTERS.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className={`fn-chip ${filter === choice.id ? "is-active" : ""}`}
                aria-pressed={filter === choice.id}
                onClick={() => setFilter(choice.id)}
              >
                {choice.label}
              </button>
            ))}
          </div>

          {focusActivityQuery.isError && (
            <div className="fn-error-banner" role="alert">
              Não foi possível carregar o foco do período. A atividade de foco pode estar incompleta.
            </div>
          )}
          {checklistActivityQuery.isError && (
            <div className="fn-error-banner" role="alert">
              Não foi possível carregar a checklist do período. A atividade de checklist pode estar incompleta.
            </div>
          )}
          {activityLoading && (
            <p className="fn-mono-label" aria-live="polite">
              Carregando atividade de foco e checklist...
            </p>
          )}

          {visibleMonths.map((month) => (
            <div key={month.label} className={styles.month}>
              <div className={styles.monthLabel}>
                <span>{month.label}</span>
                <span className={styles.monthRule} aria-hidden="true" />
              </div>
              {month.days.map((day) =>
                day.events.length === 0 ? null : (
                  <section key={day.date} className={styles.day} aria-label={day.date}>
                    <header className={styles.dayHead}>
                      <span className={styles.dayLabel}>{day.label}</span>
                      <time className={styles.dayDate} dateTime={day.date}>
                        {day.date}
                      </time>
                    </header>
                    <ol className={styles.events}>
                      {day.events.map((event) => (
                        <li key={event.key} className={`${styles.event} ${styles[event.kind]}`}>
                          <span className={styles.dot} aria-hidden="true" />
                          {event.kind === "journal" ? (
                            <>
                              <div className={styles.eventTitle}>
                                <span className={styles.glyph} aria-hidden="true">
                                  ✎
                                </span>
                                Escreveu no diário
                              </div>
                              <p className={styles.entryText}>{event.text}</p>
                            </>
                          ) : (
                            <>
                              <div className={styles.eventTitle}>
                                <span className={styles.glyph} aria-hidden="true">
                                  {event.kind === "focus" ? "●" : "✓"}
                                </span>
                                {event.kind === "focus" ? (
                                  <>Focou {formatMinutesAsHm(event.minutes)}</>
                                ) : (
                                  <>
                                    Concluiu {event.completed} de {event.total}{" "}
                                    {event.total === 1 ? "missão" : "missões"}
                                  </>
                                )}
                              </div>
                              {event.kind === "focus" ? (
                                <div className={styles.eventBar}>
                                  <div className={styles.track}>
                                    <div
                                      className={styles.fill}
                                      style={{
                                        width: `${Math.round((event.minutes / maxFocusMinutes) * 100)}%`,
                                        background: event.minutes === maxFocusMinutes ? "var(--amber)" : "var(--violet)",
                                      }}
                                    />
                                  </div>
                                  <span className={styles.caption}>
                                    {event.minutes === maxFocusMinutes
                                      ? "Maior foco do período"
                                      : "Relativo ao maior foco do período"}
                                  </span>
                                </div>
                              ) : (
                                <div className={styles.eventBar}>
                                  <div className={styles.track}>
                                    <div
                                      className={styles.fill}
                                      style={{
                                        width: `${Math.round((event.completed / event.total) * 100)}%`,
                                        background: event.completed === event.total ? "var(--amber)" : "#c7d3ea",
                                      }}
                                    />
                                  </div>
                                  <span className={styles.caption}>
                                    {event.completed === event.total
                                      ? "Checklist completa"
                                      : `${event.total - event.completed} ${
                                          event.total - event.completed === 1 ? "pendente" : "pendentes"
                                        }`}
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>
                ),
              )}
            </div>
          ))}

          {recentQuery.isSuccess && dates.length === 0 && !activityLoading && (
            <p className="fn-empty">Nenhum registro ainda.</p>
          )}

          {recent && recent.totalPages > 1 && (
            <div className="fn-pager">
              <button
                type="button"
                className="fn-btn-ghost"
                disabled={recent.first}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span className="fn-mono-label">
                Página {page + 1} de {recent.totalPages}
              </span>
              <button
                type="button"
                className="fn-btn-ghost"
                disabled={recent.last}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
