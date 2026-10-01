import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { analyticsApi } from "../api/analytics";
import { checklistApi } from "../api/checklist";
import { ParticleAnchor } from "../components/particles/ParticleScene";
import { addDaysIso, formatDateShort, formatWeekRangePt, todayIso, weekdayIndex, weekStartMondayIso } from "../utils/date";
import { describeApiError } from "../utils/errors";
import styles from "./ChecklistPage.module.css";

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAY_LONG = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reused by Today so both surfaces share the same date-keyed server state. */
export function ChecklistPanel({ date }: { date: string }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const queryKey = ["checklist", date];
  const list = useQuery({ queryKey, queryFn: () => checklistApi.byDate(date), enabled: !!date });
  // Day lists and week progress live under ["checklist"]; Analytics keeps its own checklist totals.
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["checklist"] }),
      client.invalidateQueries({ queryKey: ["analytics", "checklist"] }),
    ]);
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
    <section className={`fn-glass ${styles.panel}`} aria-label="Checklist diária">
      <form className={styles.form} onSubmit={add}>
        <div className={styles.formField}>
          <label className="fn-label" htmlFor={`checklist-title-${date}`}>Nova missão</label>
          <input
            id={`checklist-title-${date}`}
            className={`fn-underline ${styles.formInput}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={200}
            placeholder="O que fazer neste dia?"
          />
        </div>
        <button className="fn-btn-primary" type="submit" disabled={busy || !draft.trim()}>Adicionar missão</button>
      </form>
      {error && <div role="alert" className="fn-error-banner">{error}</div>}
      {list.isError && <div role="alert" className="fn-error-banner">{describeApiError(list.error)}</div>}
      {list.isPending && <span className="fn-spinner" aria-label="Carregando checklist" />}
      <ul className={styles.list} aria-label="Missões do dia">
        {(list.data ?? []).map((item) => (
          <li key={item.id} className={styles.row}>
            <label className={styles.item}>
              <input
                type="checkbox"
                className={styles.check}
                checked={item.completed}
                disabled={busy}
                onChange={() => update.mutate({ id: item.id, completed: !item.completed })}
              />
              <span className={item.completed ? `${styles.title} ${styles.done}` : styles.title}>{item.title}</span>
            </label>
            <button type="button" className={styles.remove} aria-label={`Excluir ${item.title}`} disabled={busy} onClick={() => remove.mutate(item.id)}>Excluir</button>
          </li>
        ))}
      </ul>
      {list.isSuccess && list.data.length === 0 && <p className="fn-empty">Nenhuma missão neste dia.</p>}
    </section>
  );
}

export function ChecklistPage() {
  const today = todayIso();
  // `date` is always a valid day; the picker may be transiently empty while the user edits it.
  const [date, setDate] = useState(todayIso);
  const [pickerValue, setPickerValue] = useState(date);
  const selectDate = (next: string) => {
    setDate(next);
    setPickerValue(next);
  };

  const weekStart = weekStartMondayIso(date);
  const weekEnd = addDaysIso(weekStart, 6);
  const weekQuery = useQuery({
    queryKey: ["checklist", "week", weekStart, weekEnd],
    queryFn: () => analyticsApi.checklistDaily(weekStart, weekEnd),
  });
  const progressByDate = new Map((weekQuery.data ?? []).map((day) => [day.date, day]));
  const weekTotal = (weekQuery.data ?? []).reduce((sum, day) => sum + day.total, 0);
  const weekDone = (weekQuery.data ?? []).reduce((sum, day) => sum + day.completed, 0);
  const weekPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;
  const days = Array.from({ length: 7 }, (_, offset) => addDaysIso(weekStart, offset));

  return (
    <div className={styles.page}>
      <section className="fn-hero">
        <div className="fn-hero-copy">
          <div className="fn-eyebrow">
            <span className="fn-eyebrow-bar" aria-hidden="true" />
            <span className="fn-eyebrow-text">Operação do dia</span>
          </div>
          <h1 className="fn-h1">Checklist diária</h1>
          <p className="fn-lead">Cada dia tem sua própria lista. Escolha o dia, adicione missões e marque ao concluir.</p>
          <div className={styles.weekProgress}>
            <span className={styles.weekProgressText}>
              {weekQuery.isSuccess ? `${weekDone} de ${weekTotal} missões concluídas na semana` : "…"}
            </span>
            <span className={styles.weekProgressTrack} aria-hidden="true">
              <span className={styles.weekProgressFill} style={{ width: `${weekPct}%` }} />
            </span>
          </div>
        </div>
        <ParticleAnchor className="fn-hero-anchor" shape="cloud" aria-hidden="true" />
      </section>

      <section className={styles.weekSection} aria-label="Semana">
        <div className={styles.weekBar}>
          <button type="button" className="fn-chip" onClick={() => selectDate(addDaysIso(date, -7))}>Semana anterior</button>
          <span className={styles.weekRange}>{formatWeekRangePt(weekStart, weekEnd)}</span>
          <button type="button" className="fn-chip" onClick={() => selectDate(addDaysIso(date, 7))}>Próxima semana</button>
          <label className={styles.dateField}>
            <span className="fn-label">Data da checklist</span>
            <input
              className="fn-input"
              type="date"
              value={pickerValue}
              onChange={(event) => {
                setPickerValue(event.target.value);
                if (ISO_DATE.test(event.target.value)) setDate(event.target.value);
              }}
            />
          </label>
        </div>
        {weekQuery.isError && <div role="alert" className="fn-error-banner">{describeApiError(weekQuery.error)}</div>}
        <div className={styles.days} role="group" aria-label="Semana da checklist">
          {days.map((day) => {
            const progress = progressByDate.get(day);
            const total = progress?.total ?? 0;
            const done = progress?.completed ?? 0;
            const pct = total ? Math.round((done / total) * 100) : 0;
            const isToday = day === today;
            const weekday = weekdayIndex(day);
            const summary = total ? `${done} de ${total} missões concluídas` : "sem missões";
            return (
              <button
                key={day}
                type="button"
                className={styles.day}
                aria-pressed={day === date}
                aria-label={`${isToday ? "Hoje, " : ""}${WEEKDAY_LONG[weekday]}, ${formatDateShort(day)}: ${summary}`}
                onClick={() => selectDate(day)}
              >
                <span className={styles.dayLabel}>{isToday ? "Hoje" : WEEKDAY_SHORT[weekday]}</span>
                <span className={styles.dayNum}>{day.slice(8)}</span>
                <span className={styles.dayTrack}>
                  <span className={styles.dayFill} data-complete={total > 0 && done === total} style={{ width: `${pct}%` }} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.daySection}>
        <div className={`fn-mono-label ${styles.selected}`}>
          Dia selecionado · {date === today ? "hoje" : formatDateShort(date)}
        </div>
        <ChecklistPanel date={date} />
      </section>
    </div>
  );
}
