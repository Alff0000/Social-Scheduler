// The timezone shortlist offered in the UI, plus IANA validation.
//
// Deliberately NOT `server-only` — this is imported by client components (the
// picker) and by server route handlers (validation) alike.

/**
 * Brasília first — this fork's actual audience — then the four continental US zones
 * from the original project, in west-to-east reading order that matches how people say
 * them. These are shortcuts, not a whitelist: any valid IANA name can still be typed in
 * via the picker's "Custom" option, which is what keeps the repo usable by a clone
 * anywhere else.
 */
export const TIMEZONE_PRESETS: { value: string; label: string }[] = [
  { value: "America/Sao_Paulo", label: "Brasília" },
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Los_Angeles", label: "Pacific" },
];

const TIMEZONE_PRESET_VALUES = new Set(TIMEZONE_PRESETS.map((t) => t.value));

export function isPresetTimezone(tz: string): boolean {
  return TIMEZONE_PRESET_VALUES.has(tz);
}

/**
 * Is this a real IANA zone name?
 *
 * `Intl.DateTimeFormat` throws a RangeError on an unknown `timeZone`, which is
 * the whole check — no dependency, and it's the same engine that will later
 * format with it. This matters more than it looks: an unvalidated typo saved to
 * `channels.timezone` makes `formatInTz` throw during render, which takes out the
 * Channels and Queue pages rather than showing a bad value.
 */
export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}
