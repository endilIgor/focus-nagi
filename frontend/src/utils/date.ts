function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayIso(): string {
  return toIso(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

export function formatDateLong(iso: string, locale = "pt-BR"): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date
    .toLocaleDateString(locale, {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
    .toUpperCase();
}

export function formatDateShort(iso: string, locale = "pt-BR"): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

export function weekdayLabel(iso: string, locale = "pt-BR"): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(locale, { weekday: "long" }).toUpperCase();
}

function monthShort(iso: string, locale = "pt-BR"): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(locale, { month: "short" }).replace(/\./g, "");
}

/** Human-readable "de X a Y" range for a week, in Portuguese, without exposing the ISO week code. */
export function formatWeekRangePt(startIso: string, endIso: string): string {
  const [ys, , ds] = startIso.split("-");
  const [ye, , de] = endIso.split("-");
  const sameYear = ys === ye;
  const sameMonth = sameYear && startIso.slice(0, 7) === endIso.slice(0, 7);

  if (sameMonth) return `${ds} a ${de} de ${monthShort(endIso)} de ${ye}`;
  const startLabel = `${ds} de ${monthShort(startIso)}${sameYear ? "" : ` de ${ys}`}`;
  return `${startLabel} a ${de} de ${monthShort(endIso)} de ${ye}`;
}
