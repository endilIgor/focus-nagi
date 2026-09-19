export interface ThemeDefinition {
  key: string;
  label: string;
  acc: string;
  acc2: string;
  glow: string;
  soft: string;
}

/** Fixed blue/electric ("volt") palette — the only theme the app renders. */
export const THEME: ThemeDefinition = {
  key: "volt",
  label: "Azul elétrico",
  acc: "#3B82F6",
  acc2: "#67E8F9",
  glow: "rgba(59,130,246,.3)",
  soft: "rgba(103,232,249,.11)",
};

/** Rotating tint palette for lists of cards (projects, goals) — mirrors the design's tints(). */
export function getTints(theme: ThemeDefinition): string[] {
  return [theme.acc, "#60A5FA", "#38BDF8", theme.acc2, "#2563EB"];
}
