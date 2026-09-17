import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY, THEMES, type ThemeDefinition } from "./themes";

interface ThemeContextValue {
  theme: ThemeDefinition;
  themeKey: string;
  setThemeKey: (key: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): string {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored && THEMES[stored] ? stored : DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKeyState] = useState<string>(readStoredTheme);

  const setThemeKey = (key: string) => {
    if (!THEMES[key]) return;
    setThemeKeyState(key);
    window.localStorage.setItem(THEME_STORAGE_KEY, key);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: THEMES[themeKey], themeKey, setThemeKey }),
    [themeKey],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
