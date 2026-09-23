import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { journalApi } from "../api/journal";
import type { JournalEntryResponse, Page } from "../api/types";
import { useTheme } from "../theme/ThemeContext";
import { todayIso, weekdayLabel } from "../utils/date";
import { describeApiError } from "../utils/errors";
import styles from "./JournalPage.module.css";

export function JournalPage() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const today = todayIso();
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

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
  const days = entries.reduce<{ date: string; entries: JournalEntryResponse[] }[]>((groups, entry) => {
    const last = groups.at(-1);
    if (last?.date === entry.entryDate) last.entries.push(entry);
    else groups.push({ date: entry.entryDate, entries: [entry] });
    return groups;
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div className="fn-eyebrow">
          <span className="fn-eyebrow-bar" />
          <span className="fn-eyebrow-text">REGISTRO PESSOAL</span>
        </div>
        <h1 className="fn-h1">Diário</h1>
      </div>

      <div className={styles.grid}>
        <div className={styles.editor}>
          <div className="fn-corner-tl" style={{ borderColor: theme.acc2, left: "auto", right: -1 }} />
          <div className={styles.editorHead}>
            <div className={styles.editorTitle}>Entrada de hoje</div>
            <span className="fn-mono-label">{today}</span>
          </div>
          {error && <div className="fn-error-banner">{error}</div>}
          {recentQuery.isError && <div className="fn-error-banner">Não foi possível carregar os registros. Recarregue a página e tente novamente.</div>}
          {saved && !error && <div role="status">Entrada salva.</div>}
          <textarea
            className="fn-textarea"
            rows={13}
            style={{ width: "100%" }}
            placeholder="O que travou, o que fluiu, o que amanhã herda..."
            value={draft}
            disabled={saveMutation.isPending}
            onChange={(e) => {
              setDraft(e.target.value);
              setSaved(false);
            }}
          />
          <div className={styles.editorFooter}>
            <span className="fn-mono-label">{draft.length} CARACTERES</span>
            <button className="fn-btn-primary" disabled={!recentQuery.isSuccess || saveMutation.isPending || !draft.trim()} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Salvando..." : "Salvar entrada"}
            </button>
          </div>
        </div>

        <div className={styles.list}>
          <div className={styles.listHead}>Registros por dia</div>
          {days.map((day) => (
            <section key={day.date} className={styles.day}>
              <div className={styles.entryHead}>
                <span className={styles.entryDate} style={{ color: theme.acc2 }}>{day.date}</span>
                <span className={styles.entryWeekday}>{weekdayLabel(day.date)}</span>
              </div>
              {day.entries.map((entry) => (
                <div key={entry.id} className={styles.entryExcerpt}>{entry.content}</div>
              ))}
            </section>
          ))}
          {recentQuery.isSuccess && days.length === 0 && <div className="fn-empty">NENHUM REGISTRO AINDA</div>}
          {recentQuery.data && recentQuery.data.totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 20px" }}>
              <button className="fn-btn-ghost" style={{ padding: "6px 12px", fontSize: 10 }} disabled={recentQuery.data.first} onClick={() => setPage((p) => p - 1)}>
                ANTERIOR
              </button>
              <button className="fn-btn-ghost" style={{ padding: "6px 12px", fontSize: 10 }} disabled={recentQuery.data.last} onClick={() => setPage((p) => p + 1)}>
                PRÓXIMA
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
