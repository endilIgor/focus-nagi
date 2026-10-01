import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import styles from "./FocusDurationMenu.module.css";

// Matches the panel's CSS max width: min(300px, 100vw - 32px).
const VIEWPORT_MARGIN = 16;

export const FOCUS_DURATION_PRESETS = [25, 50, 60, 90, 15];
// Mirrors worker/src/routes/focusSessions.ts: plannedFocusMinutes is boundedInt(1, 1440).
export const MIN_FOCUS_MINUTES = 1;
export const MAX_FOCUS_MINUTES = 1440;
const CUSTOM_ERROR = `Informe um número inteiro de ${MIN_FOCUS_MINUTES} a ${MAX_FOCUS_MINUTES} minutos.`;

export function parseFocusMinutes(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const minutes = Number(text);
  return minutes >= MIN_FOCUS_MINUTES && minutes <= MAX_FOCUS_MINUTES ? minutes : null;
}

interface FocusDurationMenuProps {
  value: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
}

export function FocusDurationMenu({ value, onChange, disabled = false }: FocusDurationMenuProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const presetRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelLeft, setPanelLeft] = useState<number | null>(null);
  const panelId = useId();
  const inputId = useId();
  const errorId = useId();
  const isOpen = open && !disabled;

  // A session starting (or a start request going out) closes the menu.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  // Centre the panel under the trigger, but clamp it inside the viewport: a
  // trigger near the screen edge would otherwise push it off-screen on mobile.
  useLayoutEffect(() => {
    if (!isOpen) {
      setPanelLeft(null);
      return;
    }
    const place = () => {
      const root = rootRef.current?.getBoundingClientRect();
      const panelWidth = panelRef.current?.getBoundingClientRect().width;
      if (!root || panelWidth === undefined) return;
      const centred = root.left + root.width / 2 - panelWidth / 2;
      const maxLeft = window.innerWidth - VIEWPORT_MARGIN - panelWidth;
      const left = Math.max(VIEWPORT_MARGIN, Math.min(centred, maxLeft));
      setPanelLeft(left - root.left);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const selected = FOCUS_DURATION_PRESETS.indexOf(value);
    (selected >= 0 ? presetRefs.current[selected] : inputRef.current)?.focus();
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
    // Focus only when the panel opens, not when value changes while open.
  }, [isOpen]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const select = (minutes: number) => {
    onChange(minutes);
    close(true);
  };

  const toggle = () => {
    if (disabled) return;
    if (!open) {
      setCustom("");
      setError(false);
    }
    setOpen((o) => !o);
  };

  const onPresetKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = FOCUS_DURATION_PRESETS.length - 1;
    const next =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? index === last ? 0 : index + 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? index === 0 ? last : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    presetRefs.current[next]?.focus();
  };

  const onSubmitCustom = (e: FormEvent) => {
    e.preventDefault();
    const minutes = parseFocusMinutes(custom);
    if (minutes === null) {
      setError(true);
      inputRef.current?.focus();
      return;
    }
    select(minutes);
  };

  return (
    <div
      ref={rootRef}
      className={styles.root}
      onKeyDown={(e) => {
        if (e.key === "Escape" && isOpen) {
          e.stopPropagation();
          close(true);
        }
      }}
      onBlur={(e) => {
        if (isOpen && e.relatedTarget && !rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`fn-chip ${styles.trigger}`}
        aria-label={`Duração da sessão: ${value} MIN`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        disabled={disabled}
        onClick={toggle}
      >
        <span className={styles.triggerLabel}>DURAÇÃO</span>
        <span>{value} MIN</span>
        <span className={styles.chevron} aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Duração da sessão"
          className={styles.panel}
          style={panelLeft === null ? undefined : { left: `${panelLeft}px`, transform: "none" }}
        >
          <div className={styles.presets} role="group" aria-label="Durações predefinidas">
            {FOCUS_DURATION_PRESETS.map((p, i) => (
              <button
                key={p}
                ref={(el) => {
                  presetRefs.current[i] = el;
                }}
                type="button"
                className={`fn-chip${p === value ? " is-active" : ""}`}
                aria-pressed={p === value}
                onClick={() => select(p)}
                onKeyDown={(e) => onPresetKeyDown(e, i)}
              >
                {p} MIN
              </button>
            ))}
          </div>
          <form className={styles.custom} onSubmit={onSubmitCustom} noValidate>
            <label className="fn-field" htmlFor={inputId}>
              <span>Minutos personalizados</span>
            </label>
            <div className={styles.customRow}>
              <input
                ref={inputRef}
                id={inputId}
                className="fn-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder={`${MIN_FOCUS_MINUTES}–${MAX_FOCUS_MINUTES}`}
                value={custom}
                aria-invalid={error}
                aria-describedby={error ? errorId : undefined}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setError(false);
                }}
              />
              <button type="submit" className="fn-chip">
                Aplicar
              </button>
            </div>
            {error && (
              <div id={errorId} role="alert" className={styles.error}>
                {CUSTOM_ERROR}
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
