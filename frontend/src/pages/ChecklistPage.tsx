import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checklistApi } from "../api/checklist";
import { todayIso } from "../utils/date";
import { describeApiError } from "../utils/errors";
import styles from "./ChecklistPage.module.css";

/** Reused by Today so both surfaces share the same date-keyed server state. */
export function ChecklistPanel({ date }: { date: string }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const queryKey = ["checklist", date];
  const list = useQuery({ queryKey, queryFn: () => checklistApi.byDate(date), enabled: !!date });
  const refresh = () => client.invalidateQueries({ queryKey: ["checklist"] });
  const create = useMutation({
    mutationFn: (title: string) => checklistApi.create({ title, date }),
    onSuccess: async () => { setDraft(""); setError(""); await refresh(); },
    onError: (err) => setError(describeApiError(err)),
  });
  const update = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) => checklistApi.update(id, { completed }),
    onSuccess: async () => { setError(""); await refresh(); },
    onError: (err) => setError(describeApiError(err)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => checklistApi.remove(id),
    onSuccess: async () => { setError(""); await refresh(); },
    onError: (err) => setError(describeApiError(err)),
  });
  const busy = create.isPending || update.isPending || remove.isPending;
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setError("");
    create.mutate(draft.trim());
  };

  return (
    <section className={styles.panel} aria-label="Checklist diária">
      <form className={styles.form} onSubmit={add}>
        <label htmlFor={`checklist-title-${date}`}>Nova missão</label>
        <div className={styles.formRow}>
          <input id={`checklist-title-${date}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={200} placeholder="O que fazer neste dia?" />
          <button className="fn-btn-primary" type="submit" disabled={busy || !draft.trim()}>Adicionar missão</button>
        </div>
      </form>
      {error && <div role="alert" className="fn-error-banner">{error}</div>}
      {list.isError && <div role="alert" className="fn-error-banner">{describeApiError(list.error)}</div>}
      {list.isPending && <span className="fn-spinner" aria-label="Carregando checklist" />}
      <ul className={styles.list} aria-label="Missões do dia">
        {(list.data ?? []).map((item) => (
          <li key={item.id} className={styles.row}>
            <label className={styles.item}>
              <input type="checkbox" checked={item.completed} disabled={busy} onChange={() => update.mutate({ id: item.id, completed: !item.completed })} />
              <span className={item.completed ? styles.done : undefined}>{item.title}</span>
            </label>
            <button type="button" className={styles.remove} aria-label={`Excluir ${item.title}`} disabled={busy} onClick={() => remove.mutate(item.id)}>Excluir</button>
          </li>
        ))}
      </ul>
      {list.isSuccess && list.data.length === 0 && <div className="fn-empty">NENHUMA MISSÃO NESTE DIA</div>}
    </section>
  );
}

export function ChecklistPage() {
  const [date, setDate] = useState(todayIso);
  return (
    <div className={styles.page}>
      <div className="fn-eyebrow"><span className="fn-eyebrow-bar" /><span className="fn-eyebrow-text">OPERAÇÃO DO DIA</span></div>
      <h1 className="fn-h1">Checklist diária</h1>
      <label className={styles.dateLabel} htmlFor="checklist-date">Data da checklist</label>
      <input id="checklist-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      <ChecklistPanel date={date} />
    </div>
  );
}
