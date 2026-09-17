import type { TaskPriority } from "../api/types";

export function priorityStyle(prio: TaskPriority): { border: string; color: string } {
  switch (prio) {
    case "HIGH":
      return { border: "rgba(244,63,94,.45)", color: "#FF8098" };
    case "MEDIUM":
      return { border: "rgba(245,200,107,.4)", color: "#F7CE7E" };
    case "LOW":
    default:
      return { border: "rgba(255,255,255,.16)", color: "#A5A0B8" };
  }
}

/** Days between today and a due date; negative = overdue, 0 = today, positive = future. */
export function daysUntil(dueDate: string, todayIso: string): number {
  const [y1, m1, d1] = todayIso.split("-").map(Number);
  const [y2, m2, d2] = dueDate.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}

export function dueLabel(dueDate: string | null, todayIso: string): string {
  if (!dueDate) return "—";
  const diff = daysUntil(dueDate, todayIso);
  if (diff === 0) return "hoje";
  if (diff < 0) return `${diff}d`;
  return `+${diff}d`;
}
