"use client";

import { useDesktopTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useDesktopTheme();
  const is8Bit = theme === "8bit";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={is8Bit}
      aria-label={
        is8Bit ? "Switch to modern theme" : "Switch to 8-bit theme"
      }
      title={is8Bit ? "Modern theme" : "8-bit theme"}
      className={
        is8Bit
          ? "theme-toggle theme-toggle--8bit fixed top-4 right-4 z-50"
          : "theme-toggle theme-toggle--modern fixed top-4 right-4 z-50 rounded-full border border-zinc-700 bg-zinc-900/90 px-4 py-2 text-sm font-medium text-zinc-200 shadow-lg backdrop-blur-sm transition-colors hover:border-cyan-400/50 hover:text-cyan-300"
      }
    >
      <span className="theme-toggle__track" aria-hidden>
        <span className="theme-toggle__thumb" />
      </span>
      <span className="theme-toggle__label">
        {is8Bit ? "8-BIT" : "Modern"}
      </span>
    </button>
  );
}
