import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notesApi } from "../api/notes";
import { fetchAllContent } from "../api/pagination";
import { projectsApi } from "../api/projects";
import type { NoteResponse } from "../api/types";
import { useTheme } from "../theme/ThemeContext";
import { describeApiError } from "../utils/errors";
import styles from "./NotesPage.module.css";

export function NotesPage() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const notesQuery = useQuery({
    queryKey: ["notes", search, pinnedOnly],
    queryFn: () =>
      fetchAllContent((page, size) => notesApi.list({ q: search || undefined, pinned: pinnedOnly || undefined, page, size })),
  });
  const projectsQuery = useQuery({
    queryKey: ["projects", "for-notes"],
    queryFn: () => fetchAllContent((page, size) => projectsApi.list(undefined, page, size)),
  });
  const projectsById = new Map((projectsQuery.data ?? []).map((p) => [p.id, p.title]));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notes"] });

  const togglePin = useMutation({
    mutationFn: (n: NoteResponse) => (n.pinned ? notesApi.unpin(n.id) : notesApi.pin(n.id)),
    onSuccess: invalidate,
    onError: (err) => setRowError(describeApiError(err)),
  });
  const removeNote = useMutation({
    mutationFn: (id: number) => notesApi.remove(id),
    onSuccess: invalidate,
    onError: (err) => setRowError(describeApiError(err)),
  });

  const notes = notesQuery.data ?? [];

  return (
    <div>
      <div className={styles.headRow}>
        <div>
          <div className="fn-eyebrow">
            <span className="fn-eyebrow-bar" />
            <span className="fn-eyebrow-text">MEMÓRIA</span>
          </div>
          <h1 className="fn-h1">Notas</h1>
        </div>
        <button className="fn-btn-ghost" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Fechar" : "+ Nota"}
        </button>
      </div>

      <div className={styles.toolbar}>
        <input className="fn-input" style={{ maxWidth: 280 }} placeholder="Buscar notas..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className={`fn-chip ${pinnedOnly ? "is-active" : ""}`} onClick={() => setPinnedOnly((v) => !v)}>
          SÓ FIXADAS
        </button>
      </div>

      {showCreate && (
        <CreateNotePanel
          projects={projectsQuery.data ?? []}
          onCreated={() => {
            setShowCreate(false);
            invalidate();
          }}
        />
      )}

      {rowError && <div className="fn-error-banner">{rowError}</div>}

      <div className={styles.grid}>
        {notes.map((n) =>
          editingId === n.id ? (
            <EditNoteCard
              key={n.id}
              note={n}
              projects={projectsQuery.data ?? []}
              onDone={() => {
                setEditingId(null);
                invalidate();
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div
              key={n.id}
              className={styles.card}
              style={{
                borderColor: n.pinned ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.07)",
                background: n.pinned
                  ? `linear-gradient(160deg, ${theme.glow}, rgba(255,255,255,.01))`
                  : "linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.008))",
              }}
            >
              {n.pinned && <div className="fn-corner-tl" style={{ borderColor: theme.acc2 }} />}
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>{n.title}</div>
                <button
                  className={styles.pinBtn}
                  style={{ color: n.pinned ? theme.acc2 : "var(--text-faint)" }}
                  onClick={() => togglePin.mutate(n)}
                >
                  {n.pinned ? "FIXADA" : "FIXAR"}
                </button>
              </div>
              <div className={styles.content}>{n.content}</div>
              <div className={styles.footer}>
                <span>{n.projectId ? projectsById.get(n.projectId) ?? `#${n.projectId}` : "—"}</span>
                <span>{new Date(n.updatedAt).toLocaleDateString("pt-BR")}</span>
              </div>
              <div className={styles.actions}>
                <button className="fn-btn-ghost" style={{ padding: "5px 10px", fontSize: 9 }} onClick={() => setEditingId(n.id)}>
                  Editar
                </button>
                <button className="fn-btn-danger" style={{ padding: "5px 10px", fontSize: 9 }} onClick={() => removeNote.mutate(n.id)}>
                  Excluir
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      {notes.length === 0 && !notesQuery.isLoading && (
        <div style={{ border: "1px dashed rgba(255,255,255,.12)", padding: 64, textAlign: "center" }} className="fn-empty">
          NENHUMA NOTA SALVA
        </div>
      )}
    </div>
  );
}

function CreateNotePanel({
  projects,
  onCreated,
}: {
  projects: Array<{ id: number; title: string }>;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      notesApi.create({ title: title.trim(), content: content.trim() || undefined, projectId: projectId === "" ? undefined : projectId }),
    onSuccess: onCreated,
    onError: (err) => setError(describeApiError(err)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createMutation.mutate();
  };

  return (
    <form className={styles.createPanel} onSubmit={onSubmit}>
      {error && <div className="fn-error-banner">{error}</div>}
      <label className="fn-field">
        <span>TÍTULO</span>
        <input className="fn-input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={150} />
      </label>
      <label className="fn-field">
        <span>CONTEÚDO</span>
        <textarea className="fn-textarea" rows={4} value={content} onChange={(e) => setContent(e.target.value)} maxLength={20000} />
      </label>
      <label className="fn-field">
        <span>PROJETO (OPCIONAL)</span>
        <select className="fn-select" value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">— nenhum —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.createActions}>
        <button type="submit" className="fn-btn-primary" disabled={createMutation.isPending || !title.trim()}>
          {createMutation.isPending ? "Salvando..." : "Salvar nota"}
        </button>
      </div>
    </form>
  );
}

function EditNoteCard({
  note,
  projects,
  onDone,
  onCancel,
}: {
  note: NoteResponse;
  projects: Array<{ id: number; title: string }>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content ?? "");
  const [projectId, setProjectId] = useState<number | "">(note.projectId ?? "");
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      notesApi.update(note.id, { title: title.trim(), content: content.trim() || null, projectId: projectId === "" ? null : projectId }),
    onSuccess: onDone,
    onError: (err) => setError(describeApiError(err)),
  });

  return (
    <div className={styles.card} style={{ borderColor: "rgba(255,255,255,.2)", background: "rgba(0,0,0,.4)" }}>
      {error && <div className="fn-error-banner">{error}</div>}
      <input className="fn-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
      <textarea className="fn-textarea" rows={4} value={content} onChange={(e) => setContent(e.target.value)} maxLength={20000} />
      <select className="fn-select" value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}>
        <option value="">— sem projeto —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      <div className={styles.actions}>
        <button className="fn-btn-primary" style={{ padding: "8px 14px", fontSize: 10 }} disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
          Salvar
        </button>
        <button className="fn-btn-ghost" style={{ padding: "8px 14px", fontSize: 10 }} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
