import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRangeKpis, denseRange, parseRangeParams, previousPeriod, rangeLabel, rangeLength,
  resolveDateRange, rowsInRange,
  type DateRange,
} from "./date-range";
import type { DayRow } from "./insights";

const day = (d: string, values: Partial<DayRow> = {}): DayRow => ({
  day: d,
  followers_count: null, follows_count: null, media_count: null, reach: null,
  views: null, profile_views: null, accounts_engaged: null, total_interactions: null,
  likes: null, comments: null, saves: null, shares: null, replies: null,
  website_clicks: null, follows_gained: null, lifetime_likes: null,
  ...values,
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---- resolveDateRange -----------------------------------------------------------------

test("resolveDateRange 'today' is a single day: right now, not the last synced day", () => {
  const today = todayIso();
  assert.deepEqual(resolveDateRange("today"), { start: today, end: today });
});

test("resolveDateRange 'yesterday' is exactly one calendar day, excluding today", () => {
  const y = shiftIso(todayIso(), -1);
  assert.deepEqual(resolveDateRange("yesterday"), { start: y, end: y });
});

test("resolveDateRange '7d' spans today and the 6 days before it", () => {
  const today = todayIso();
  const range = resolveDateRange("7d");
  assert.equal(range.end, today);
  assert.equal(range.start, shiftIso(today, -6));
  assert.equal(rangeLength(range), 7);
});

test("resolveDateRange 'month' starts on the 1st and ends today", () => {
  const today = todayIso();
  const range = resolveDateRange("month");
  assert.equal(range.start, `${today.slice(0, 7)}-01`);
  assert.equal(range.end, today);
});

test("resolveDateRange 'custom' passes a well-formed start/end through unchanged", () => {
  const today = todayIso();
  const start = shiftIso(today, -10);
  const end = shiftIso(today, -3);
  assert.deepEqual(resolveDateRange("custom", { start, end }), { start, end });
});

test("resolveDateRange 'custom' swaps a reversed start/end rather than erroring", () => {
  const today = todayIso();
  const earlier = shiftIso(today, -5);
  const later = shiftIso(today, -1);
  // Handed backwards on purpose.
  assert.deepEqual(resolveDateRange("custom", { start: later, end: earlier }), {
    start: earlier,
    end: later,
  });
});

test("resolveDateRange 'custom' clamps an end in the future to today", () => {
  const today = todayIso();
  const future = shiftIso(today, 30);
  const range = resolveDateRange("custom", { start: today, end: future });
  assert.equal(range.end, today);
});

test("resolveDateRange 'custom' clamps a start in the future to today too", () => {
  const today = todayIso();
  const future = shiftIso(today, 30);
  const range = resolveDateRange("custom", { start: future, end: future });
  assert.equal(range.start, today);
  assert.equal(range.end, today);
});

test("resolveDateRange 'custom' with nothing supplied falls back to today/today", () => {
  const today = todayIso();
  assert.deepEqual(resolveDateRange("custom", {}), { start: today, end: today });
});

// ---- rangeLength ------------------------------------------------------------------------

test("rangeLength counts a single day as 1, not 0", () => {
  assert.equal(rangeLength({ start: "2026-06-01", end: "2026-06-01" }), 1);
});

test("rangeLength is inclusive of both ends", () => {
  assert.equal(rangeLength({ start: "2026-06-01", end: "2026-06-07" }), 7);
});

test("rangeLength survives a month boundary", () => {
  assert.equal(rangeLength({ start: "2026-01-30", end: "2026-02-02" }), 4);
});

// ---- previousPeriod ---------------------------------------------------------------------

test("previousPeriod is the same length, ending the day before the range starts", () => {
  const range: DateRange = { start: "2026-06-08", end: "2026-06-14" }; // 7 days
  const prev = previousPeriod(range);
  assert.equal(prev.end, "2026-06-07");
  assert.equal(prev.start, "2026-06-01");
  assert.equal(rangeLength(prev), rangeLength(range));
});

test("previousPeriod of a single day is the single day before it", () => {
  const prev = previousPeriod({ start: "2026-06-08", end: "2026-06-08" });
  assert.deepEqual(prev, { start: "2026-06-07", end: "2026-06-07" });
});

// ---- rowsInRange ------------------------------------------------------------------------

test("rowsInRange keeps only days inside the range, inclusive of both ends", () => {
  const rows = [day("2026-06-01"), day("2026-06-05"), day("2026-06-10"), day("2026-06-14")];
  const kept = rowsInRange(rows, { start: "2026-06-05", end: "2026-06-10" });
  assert.deepEqual(kept.map((r) => r.day), ["2026-06-05", "2026-06-10"]);
});

// ---- denseRange -------------------------------------------------------------------------

test("denseRange fills a gap with a null-valued row rather than skipping the day", () => {
  const rows = [day("2026-06-01", { reach: 10 }), day("2026-06-03", { reach: 30 })];
  const dense = denseRange(rows, { start: "2026-06-01", end: "2026-06-03" });
  assert.deepEqual(dense.map((r) => r.day), ["2026-06-01", "2026-06-02", "2026-06-03"]);
  assert.equal(dense[1].reach, null, "the missing middle day must be null, not absent");
});

test("denseRange covers a single-day range with exactly one row", () => {
  const dense = denseRange([], { start: "2026-06-01", end: "2026-06-01" });
  assert.equal(dense.length, 1);
  assert.equal(dense[0].day, "2026-06-01");
});

// ---- buildRangeKpis ---------------------------------------------------------------------

const FLOW = { key: "reach" as const, label: "Alcance", kind: "flow" as const };
const LEVEL = { key: "followers_count" as const, label: "Seguidores", kind: "level" as const };
const RANGE: DateRange = { start: "2026-06-08", end: "2026-06-14" }; // 7 days

test("buildRangeKpis sums a flow metric across the current rows", () => {
  const current = [day("2026-06-08", { reach: 10 }), day("2026-06-09", { reach: 20 })];
  const [kpi] = buildRangeKpis(current, [], [FLOW], RANGE);
  assert.equal(kpi.value, 30);
});

test("buildRangeKpis reads a level metric as the latest value, not a sum", () => {
  const current = [
    day("2026-06-08", { followers_count: 100 }),
    day("2026-06-09", { followers_count: 110 }),
  ];
  const [kpi] = buildRangeKpis(current, [], [LEVEL], RANGE);
  assert.equal(kpi.value, 110);
});

test("buildRangeKpis computes delta against the previous period's rows", () => {
  const current = Array.from({ length: 7 }, (_, i) =>
    day(`2026-06-${String(8 + i).padStart(2, "0")}`, { reach: 10 }),
  );
  const previous = Array.from({ length: 7 }, (_, i) =>
    day(`2026-06-${String(1 + i).padStart(2, "0")}`, { reach: 5 }),
  );
  const [kpi] = buildRangeKpis(current, previous, [FLOW], RANGE);
  assert.equal(kpi.value, 70);
  assert.equal(kpi.delta, 100); // 70 vs 35 = +100%
});

test("buildRangeKpis withholds delta when the current period is only partly covered", () => {
  // Only 2 of the 7 days in RANGE carry a row.
  const current = [day("2026-06-08", { reach: 10 }), day("2026-06-09", { reach: 10 })];
  const previous = Array.from({ length: 7 }, (_, i) =>
    day(`2026-06-${String(1 + i).padStart(2, "0")}`, { reach: 5 }),
  );
  const [kpi] = buildRangeKpis(current, previous, [FLOW], RANGE);
  assert.equal(kpi.delta, null, "comparing 2 days against 7 would read as a trend that never happened");
  assert.equal(kpi.daysWithData, 2);
  assert.equal(kpi.windowDays, 7);
});

test("buildRangeKpis always compares a level metric, regardless of coverage", () => {
  const current = [day("2026-06-08", { followers_count: 100 })];
  const previous = [day("2026-06-01", { followers_count: 90 })];
  const [kpi] = buildRangeKpis(current, previous, [LEVEL], RANGE);
  assert.notEqual(kpi.delta, null);
});

// ---- rangeLabel -------------------------------------------------------------------------

test("rangeLabel reads naturally for each fixed preset", () => {
  assert.equal(rangeLabel("today", resolveDateRange("today")), "hoje");
  assert.equal(rangeLabel("yesterday", resolveDateRange("yesterday")), "ontem");
  assert.equal(rangeLabel("7d", resolveDateRange("7d")), "nos últimos 7 dias");
  assert.equal(rangeLabel("month", resolveDateRange("month")), "este mês");
});

test("rangeLabel for a custom single day names that one day", () => {
  assert.equal(rangeLabel("custom", { start: "2026-06-08", end: "2026-06-08" }), "em 08/06");
});

test("rangeLabel for a custom span names both ends", () => {
  assert.equal(rangeLabel("custom", { start: "2026-06-01", end: "2026-06-08" }), "de 01/06 a 08/06");
});

// ---- parseRangeParams -------------------------------------------------------------------

test("parseRangeParams defaults to '7d' when no range is given, matching the old fixed window", () => {
  const { preset, range } = parseRangeParams({});
  assert.equal(preset, "7d");
  assert.equal(rangeLength(range), 7);
});

test("parseRangeParams reads a known preset from the query string", () => {
  const { preset, range } = parseRangeParams({ range: "today" });
  assert.equal(preset, "today");
  assert.equal(range.start, range.end);
});

test("parseRangeParams falls back to '7d' for an unrecognised range value", () => {
  const { preset } = parseRangeParams({ range: "bogus" });
  assert.equal(preset, "7d");
});

test("parseRangeParams reads start/end only for a custom range", () => {
  const { range } = parseRangeParams({ range: "custom", start: "2026-06-01", end: "2026-06-05" });
  assert.deepEqual(range, { start: "2026-06-01", end: "2026-06-05" });
});
