import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { journalApi } from "../api/journal";
import { useTheme } from "../theme/ThemeContext";
import { todayIso, weekdayLabel } from "../utils/date";
import { describeApiError } from "../utils/errors";
import styles from "./JournalPage.module.css";

export function JournalPage() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const today = todayIso();
  const [draft, setDraft] = useState("");
  const [draftEdited, setDraftEdited] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const todayEntryQuery = useQuery({ queryKey: ["journal", "by-date", today], queryFn: () => journalApi.byDate(today) });
  const recentQuery = useQuery({ queryKey: ["journal", "recent", page], queryFn: () => journalApi.recent(page, 10) });

  const todayEntries = todayEntryQuery.data ?? [];
  const todayEntry = todayEntries.at(-1) ?? null;

  useEffect(() => {
    if (todayEntry && !draftEdited) setDraft(todayEntry.content);
  }, [todayEntry?.id]);

  const saveMutation = useMutation({
    mutationFn: () =>
      todayEntry ? journalApi.update(todayEntry.id, { content: draft }) : journalApi.create({ entryDate: today, content: draft }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["journal"] });
    },
    onError: (err) => setError(describeApiError(err)),
  });

  const entries = recentQuery.data?.content ?? [];
  const previousEntries = entries.filter((entry) => entry.id !== todayEntry?.id);

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
          {todayEntryQuery.isError && <div className="fn-error-banner">Não foi possível carregar a entrada de hoje. Recarregue a página e tente novamente.</div>}
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
              setDraftEdited(true);
              setSaved(false);
            }}
          />
          <div className={styles.editorFooter}>
            <span className="fn-mono-label">{draft.length} CARACTERES</span>
            <button className="fn-btn-primary" disabled={!todayEntryQuery.isSuccess || saveMutation.isPending || !draft.trim()} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Salvando..." : "Salvar entrada"}
            </button>
          </div>
        </div>

        <div className={styles.list}>
          <div className={styles.listHead}>Entradas anteriores</div>
          {previousEntries.map((e) => (
              <div key={e.id} className={styles.entry}>
                <div className={styles.entryHead}>
                  <span className={styles.entryDate} style={{ color: theme.acc2 }}>
                    {e.entryDate}
                  </span>
                  <span className={styles.entryWeekday}>{weekdayLabel(e.entryDate)}</span>
                </div>
                <div className={styles.entryExcerpt}>{e.content.length > 220 ? `${e.content.slice(0, 220)}…` : e.content}</div>
              </div>
            ))}
          {previousEntries.length === 0 && <div className="fn-empty">NENHUMA ENTRADA ANTERIOR</div>}
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
