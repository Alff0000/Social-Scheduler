// Three self-contained themes, no separate light/dark toggle. All three are fixed-mode
// branded looks (all dark) with their own name because their identity is the color/mood,
// not a mode — the same reasoning that already ruled out a theme × mode matrix here.
//
// A cookie/localStorage value from a retired theme (light/dark/purple/japanese/neon, or
// the older claude/apt/fyzical/default/solarized/vela families) needs no special-case
// migration: isThemeId only recognizes ids in THEMES below, so layout.tsx's
// `isThemeId(saved) ? saved : DEFAULT_THEME` already falls back to VIP Neon for any of
// them on its own.
export type ThemeId = "vipneon" | "obsidian" | "glacier";

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "vipneon", label: "VIP Neon" },
  { id: "obsidian", label: "Obsidian" },
  { id: "glacier", label: "Glacier" },
];

export const DEFAULT_THEME: ThemeId = "vipneon";

export const THEME_STORAGE_KEY = "ss-theme";

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

export function isThemeId(v: string | null): v is ThemeId {
  return v !== null && THEME_IDS.has(v);
}
