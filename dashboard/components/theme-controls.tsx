"use client";

import { useEffect, useState } from "react";
import {
  THEMES,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isThemeId,
  type ThemeId,
} from "@/lib/themes";

export function ThemeControls() {
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);

  // Sync the control to whatever the no-flash script already put on <html>.
  //
  // This reads the DOM, so it cannot run during render or on the server — a mount effect
  // is the only place the attribute exists. The one extra render it costs is the price of
  // not flashing the default theme before the real one loads, which is the whole reason
  // the no-flash script writes it in the first place.
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    // Suppressed per the note above: the value being synced only exists in the DOM
    // after hydration, so no earlier hook can read it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isThemeId(t)) setTheme(t);
  }, []);

  // Cookie, not just localStorage: the server reads THIS on the next request to pick
  // data-theme before the page ever paints (see app/layout.tsx). localStorage alone left
  // the theme correct only until the next navigation that does a real server round trip
  // (back/forward, a reopened tab, a proxy in front of the app) — the page briefly
  // repainted in the default theme every time, which is exactly the bug this replaces.
  // One year, readable from every path, lax is enough since nothing here is cross-site.
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

  return (
    <div className="px-1">
      <label className="sr-only" htmlFor="theme-select">
        Tema
      </label>
      <select
        id="theme-select"
        value={theme}
        onChange={(e) => applyTheme(e.target.value as ThemeId)}
        className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[12px] text-ink focus:border-brand"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
