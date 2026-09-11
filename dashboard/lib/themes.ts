// Six self-contained themes — no separate light/dark toggle. "Claro" and "Escuro" are
// the light/dark axis for anyone who wants a neutral look; "InstaVips Vermelho", "Roxo",
// "Japonês" and "Neon" are fixed-mode branded looks (all dark) with their own name
// because their identity is the color/mood, not a mode. Collapsing what used to be a
// theme × mode matrix (7 families × 2 modes) into one flat list this small is
// deliberate: every one of the retired families (claude/apt/fyzical/default/solarized/
// vela) was a leftover generic name from the original fork, never asked for, and
// diluted the choices that actually mattered.
export type ThemeId = "light" | "dark" | "instavips" | "purple" | "japanese" | "neon";

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Escuro" },
  { id: "instavips", label: "InstaVips Vermelho" },
  { id: "purple", label: "Roxo" },
  { id: "japanese", label: "Japonês" },
  { id: "neon", label: "Neon" },
];

export const DEFAULT_THEME: ThemeId = "instavips";

export const THEME_STORAGE_KEY = "ss-theme";

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

export function isThemeId(v: string | null): v is ThemeId {
  return v !== null && THEME_IDS.has(v);
}
