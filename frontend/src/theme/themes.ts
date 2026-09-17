export interface ThemeDefinition {
  key: string;
  label: string;
  acc: string;
  acc2: string;
  glow: string;
  soft: string;
  swatch: string;
}

export const THEMES: Record<string, ThemeDefinition> = {
  volt: {
    key: "volt",
    label: "Azul elétrico",
    acc: "#3B82F6",
    acc2: "#67E8F9",
    glow: "rgba(59,130,246,.3)",
    soft: "rgba(103,232,249,.11)",
    swatch: "linear-gradient(135deg,#3B82F6,#67E8F9)",
  },
  violet: {
    key: "violet",
    label: "Violeta neon",
    acc: "#7C3AED",
    acc2: "#22D3EE",
    glow: "rgba(124,58,237,.34)",
    soft: "rgba(34,211,238,.12)",
    swatch: "linear-gradient(135deg,#7C3AED,#22D3EE)",
  },
  acid: {
    key: "acid",
    label: "Verde ácido",
    acc: "#39E27D",
    acc2: "#A3E635",
    glow: "rgba(57,226,125,.24)",
    soft: "rgba(163,230,53,.1)",
    swatch: "linear-gradient(135deg,#39E27D,#A3E635)",
  },
  ember: {
    key: "ember",
    label: "Magenta plasma",
    acc: "#F0389B",
    acc2: "#FDBA74",
    glow: "rgba(240,56,155,.26)",
    soft: "rgba(253,186,116,.1)",
    swatch: "linear-gradient(135deg,#F0389B,#FDBA74)",
  },
};

export const DEFAULT_THEME = "volt";
export const THEME_STORAGE_KEY = "focus-nagi:theme";

/** Rotating tint palette for lists of cards (projects, goals) — mirrors the design's tints(). */
export function getTints(theme: ThemeDefinition): string[] {
  return [theme.acc, theme.acc2, "#A78BFA", "#F472B6", "#818CF8"];
}
