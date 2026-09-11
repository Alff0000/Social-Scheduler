/*
  Calendar-anchored date ranges for the Dashboard and Relatório hub's period filter.

  Deliberately NOT the same model as insights.ts's RANGES (7d/30d/90d/365d), which is a
  rolling window ending at whatever day the data itself last has a row for — fine for "the
  last N days," but unable to mean "yesterday" once today has already synced (the rolling
  window would just slide to include today too). "Hoje" and "Ontem" are calendar facts, not
  data-availability facts: the ranges below are always resolved against the real current
  date, and a preset with no data yet renders as null/empty rather than silently falling
  back to whatever day happens to have a row.
*/

import {
  shiftDay,
  sumMetric,
  latestMetric,
  pctDelta,
  type DayRow,
  type Kpi,
  type MetricKey,
} from "./insights";

export type RangePreset = "today" | "yesterday" | "7d" | "month" | "custom";

export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "month", label: "Este mês" },
  { key: "custom", label: "Personalizado" },
];

export interface DateRange {
  /** ISO day, inclusive. */
  start: string;
  /** ISO day, inclusive. */
  end: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const PRESET_KEYS = new Set(RANGE_PRESETS.map((p) => p.key));

/** Read `?range=` (and, for custom, `?start=&end=`) from a page's searchParams, defaulting
 *  to "7d" — the same default window the Dashboard and Relatório hub used before this
 *  filter existed, so a bookmarked link with no query string still looks the same. */
export function parseRangeParams(
  query: Record<string, string | string[] | undefined>,
): { preset: RangePreset; range: DateRange } {
  const rawPreset = typeof query.range === "string" ? query.range : "7d";
  const preset: RangePreset = PRESET_KEYS.has(rawPreset as RangePreset)
    ? (rawPreset as RangePreset)
    : "7d";
  const range = resolveDateRange(preset, {
    start: typeof query.start === "string" ? query.start : null,
    end: typeof query.end === "string" ? query.end : null,
  });
  return { preset, range };
}

/** Days spanned by a range, inclusive of both ends — a single day is 1, not 0. */
export function rangeLength(range: DateRange): number {
  const start = new Date(`${range.start}T00:00:00Z`).getTime();
  const end = new Date(`${range.end}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Turn a preset (plus, for "custom", a caller-supplied start/end) into a concrete range.
 *
 * Always anchored to the real current date, never to the latest day any table happens to
 * have synced — see this file's header for why that distinction matters.
 *
 * A custom range is defended against three ways a person can hand it back wrong: start
 * after end (swapped), and either end in the future (clamped to today — there is no data
 * to show for a day that has not happened, and an unclamped future end would make an
 * empty result read as "broken" rather than "too early to ask").
 */
export function resolveDateRange(
  preset: RangePreset,
  custom?: { start?: string | null; end?: string | null },
): DateRange {
  const today = todayIso();
  switch (preset) {
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const y = shiftDay(today, -1);
      return { start: y, end: y };
    }
    case "7d":
      return { start: shiftDay(today, -6), end: today };
    case "month":
      return { start: `${today.slice(0, 7)}-01`, end: today };
    case "custom": {
      let start = custom?.start || today;
      let end = custom?.end || today;
      if (start > end) [start, end] = [end, start];
      if (end > today) end = today;
      if (start > today) start = today;
      return { start, end };
    }
  }
}

/** A human phrase for the active range, for a heading like "alcance em ..." — reads
 *  naturally for every preset, unlike a bare day count ("1 dias" for Hoje, or a number
 *  that changes shape daily for Este mês). */
export function rangeLabel(preset: RangePreset, range: DateRange): string {
  switch (preset) {
    case "today":
      return "hoje";
    case "yesterday":
      return "ontem";
    case "7d":
      return "nos últimos 7 dias";
    case "month":
      return "este mês";
    case "custom": {
      const fmt = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
      return range.start === range.end
        ? `em ${fmt(range.start)}`
        : `de ${fmt(range.start)} a ${fmt(range.end)}`;
    }
  }
}

/**
 * The period immediately before `range`, same length — the baseline every KPI delta on
 * these two pages compares against.
 *
 * Always the preceding N days, never the preceding calendar unit: insights.ts's buildKpis
 * already made this call for "last 30 days" vs. a calendar month (its own comment explains
 * why — a calendar comparison makes every 31-day month look like growth), and "Este mês"
 * inherits the same reasoning: a delta against a variable-length previous calendar month
 * would make comparisons meaningless on the 3rd of the month vs. the 29th.
 */
export function previousPeriod(range: DateRange): DateRange {
  const length = rangeLength(range);
  const end = shiftDay(range.start, -1);
  const start = shiftDay(end, -(length - 1));
  return { start, end };
}

/** Rows whose day falls within `range`, inclusive of both ends. */
export function rowsInRange(rows: DayRow[], range: DateRange): DayRow[] {
  return rows.filter((r) => r.day >= range.start && r.day <= range.end);
}

/**
 * Fill every day in `range` that has no row with a null-valued one, same reasoning as
 * insights.ts's densify — a gap must draw as "nothing recorded", not a straight line that
 * reads as "nothing happened". The calendar-anchored counterpart to densify, which instead
 * anchors to the last day the data itself has a row for.
 */
export function denseRange(rows: DayRow[], range: DateRange): DayRow[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: DayRow[] = [];
  const length = rangeLength(range);
  for (let i = 0; i < length; i += 1) {
    const day = shiftDay(range.start, i);
    out.push(byDay.get(day) ?? (EMPTY_DAY(day) as DayRow));
  }
  return out;
}

const EMPTY_DAY = (day: string): DayRow => ({
  day,
  followers_count: null, follows_count: null, media_count: null, reach: null,
  views: null, profile_views: null, accounts_engaged: null, total_interactions: null,
  likes: null, comments: null, saves: null, shares: null, replies: null,
  website_clicks: null, follows_gained: null, lifetime_likes: null,
});

/**
 * The headline row for an explicit, calendar-anchored range — the counterpart to
 * insights.ts's buildKpis (which instead takes one array and re-derives its own window
 * from the data's own last day). Takes the current and previous period's rows already
 * fetched separately, so it never has to guess where "today" is from the data.
 */
export function buildRangeKpis(
  currentRows: DayRow[],
  previousRows: DayRow[],
  metrics: { key: MetricKey; label: string; kind: "flow" | "level" }[],
  range: DateRange,
): Kpi[] {
  const windowDays = rangeLength(range);
  return metrics.map((m) => {
    const pick = m.kind === "level" ? latestMetric : sumMetric;
    const value = pick(currentRows, m.key);
    const prior = pick(previousRows, m.key);
    const daysWithData = currentRows.filter(
      (r) => r[m.key] !== null && r[m.key] !== undefined,
    ).length;
    const priorDays = previousRows.filter(
      (r) => r[m.key] !== null && r[m.key] !== undefined,
    ).length;
    // Same rule as buildKpis: a delta between two partly-covered periods compares
    // different numbers of days and reads as a trend that never happened.
    const comparable =
      m.kind === "level" || (daysWithData >= windowDays && priorDays >= windowDays);
    return {
      ...m,
      value,
      delta: comparable ? pctDelta(value, prior) : null,
      daysWithData,
      windowDays,
    };
  });
}
