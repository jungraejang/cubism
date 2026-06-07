"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useIsClient } from "@/lib/use-is-client";

export type DesktopTheme = "modern" | "8bit";

const STORAGE_KEY = "cubism.desktop.theme";

type ThemeContextValue = {
  theme: DesktopTheme;
  setTheme: (theme: DesktopTheme) => void;
  toggleTheme: () => void;
  is8Bit: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): DesktopTheme {
  if (typeof window === "undefined") return "modern";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "8bit" ? "8bit" : "modern";
  } catch {
    return "modern";
  }
}

function applyThemeToDocument(theme: DesktopTheme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  const [theme, setThemeState] = useState<DesktopTheme>("modern");
  const [prevIsClient, setPrevIsClient] = useState(isClient);

  if (isClient !== prevIsClient) {
    setPrevIsClient(isClient);
    if (isClient) {
      const stored = readStoredTheme();
      setThemeState(stored);
      applyThemeToDocument(stored);
    }
  }

  const setTheme = useCallback((next: DesktopTheme) => {
    setThemeState(next);
    applyThemeToDocument(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: DesktopTheme = prev === "modern" ? "8bit" : "modern";
      applyThemeToDocument(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      is8Bit: theme === "8bit",
    }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useDesktopTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useDesktopTheme must be used within ThemeProvider");
  }
  return ctx;
}
