export interface ThemeDefinition {
  key: string;
  label: string;
  acc: string;
  acc2: string;
  glow: string;
  soft: string;
}

/** Fixed violet/amber palette of the Focus Nagi v3 design — the only theme the app renders. */
export const THEME: ThemeDefinition = {
  key: "nagi",
  label: "Violeta e âmbar",
  acc: "#8052FF",
  acc2: "#FFB829",
  glow: "rgba(128,82,255,.3)",
  soft: "rgba(128,82,255,.12)",
};

/** Rotating tint palette for lists of cards (projects, goals) — mirrors the design's tints(). */
export function getTints(theme: ThemeDefinition): string[] {
  return [theme.acc, "#A48BFF", "#1FB894", theme.acc2, "#4F7BFF"];
}
