"use client";

import { useEffect, useState } from "react";
import {
  THEMES,
  DEFAULT_THEME,
  DEFAULT_MODE,
  THEME_STORAGE_KEY,
  MODE_STORAGE_KEY,
  isThemeId,
  isMode,
  type ThemeId,
  type ThemeMode,
} from "@/lib/themes";

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

export function ThemeControls() {
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_MODE);

  // Sync the control to whatever the no-flash script already put on <html>.
  //
  // This reads the DOM, so it cannot run during render or on the server — a mount effect
  // is the only place the attributes exist. The one extra render it costs is the price of
  // not flashing the default theme before the real one loads, which is the whole reason
  // the no-flash script writes those attributes in the first place.
  useEffect(() => {
    const d = document.documentElement;
    const t = d.getAttribute("data-theme");
    const m = d.getAttribute("data-mode");
    // Suppressed per the note above: the value being synced only exists in the DOM
    // after hydration, so no earlier hook can read it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isThemeId(t)) setTheme(t);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- as above.
    if (isMode(m)) setMode(m);
  }, []);

  // Cookie, not just localStorage: the server reads THIS on the next request to pick
  // data-theme/data-mode before the page ever paints (see app/layout.tsx). localStorage
  // alone left the theme correct only until the next navigation that does a real
  // server round trip (back/forward, a reopened tab, a proxy in front of the app) — the
  // page briefly repainted in the default theme every time, which is exactly the bug
  // this replaces. One year, readable from every path, lax is enough since nothing here
  // is cross-site.
  function setCookie(name: string, value: string) {
    try {
      document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
    } catch {}
  }

  function applyTheme(next: ThemeId) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    setCookie(THEME_STORAGE_KEY, next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
  }

  function applyMode(next: ThemeMode) {
    setMode(next);
    document.documentElement.setAttribute("data-mode", next);
    setCookie(MODE_STORAGE_KEY, next);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {}
  }

  const nextMode: ThemeMode = mode === "light" ? "dark" : "light";

  return (
    <div className="flex items-center gap-2 px-1">
      <label className="sr-only" htmlFor="theme-select">
        Tema
      </label>
      <select
        id="theme-select"
        value={theme}
        onChange={(e) => applyTheme(e.target.value as ThemeId)}
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-[12px] text-ink focus:border-brand"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => applyMode(nextMode)}
        aria-label={`Mudar para modo ${nextMode === "dark" ? "escuro" : "claro"}`}
        title={`Mudar para modo ${nextMode === "dark" ? "escuro" : "claro"}`}
        className="shrink-0 rounded-lg border border-border bg-surface p-2 text-ink-soft transition-colors hover:bg-surface-sunken"
      >
        {mode === "light" ? <MoonIcon /> : <SunIcon />}
      </button>
    </div>
  );
}
