"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { RANGE_PRESETS, type RangePreset } from "@/lib/date-range";

/**
 * The Hoje/Ontem/Últimos 7 dias/Este mês/Personalizado filter shared by the Dashboard and
 * the Relatório hub.
 *
 * A client component (unlike the plain `<Link>` pills /insights/reels and /insights/funnel
 * use) only because "Personalizado" needs two date inputs and a submit step that a bare
 * link cannot express — the other four presets could be links, but splitting the bar into
 * two different control types for one visual row would be its own source of drift.
 */
export function DateRangeFilter({
  preset,
  start,
  end,
  timeZone,
}: {
  preset: RangePreset;
  start: string;
  end: string;
  /** The same timezone the server resolved `start`/`end` against (config.defaultTimezone)
   *  — the custom end-date picker's `max` must agree with what the server will actually
   *  clamp to, or a date the picker allows could still get silently rewritten server-side.
   *  Never the browser's own zone: this project's whole day model is calendar-anchored to
   *  ONE install-wide timezone, not to whoever happens to be looking at the screen. */
  timeZone: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [customStart, setCustomStart] = useState(start);
  const [customEnd, setCustomEnd] = useState(end);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  function go(params: Record<string, string>) {
    const q = new URLSearchParams(params);
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {RANGE_PRESETS.map((p) => {
        const active = p.key === preset;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => go(p.key === "custom" ? { range: "custom", start: customStart, end: customEnd } : { range: p.key })}
            aria-current={active ? "true" : undefined}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-brand-weak text-brand-strong"
                : "text-muted hover:bg-surface-sunken hover:text-ink-soft"
            }`}
          >
            {p.label}
          </button>
        );
      })}
      {preset === "custom" ? (
        <span className="flex items-center gap-1.5">
          <input
            type="date"
            value={customStart}
            max={customEnd}
            onChange={(e) => setCustomStart(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-ink"
          />
          <span className="text-xs text-faint">–</span>
          <input
            type="date"
            value={customEnd}
            min={customStart}
            max={today}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-ink"
          />
          <button
            type="button"
            onClick={() => go({ range: "custom", start: customStart, end: customEnd })}
            className="rounded-lg border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-surface-sunken"
          >
            Aplicar
          </button>
        </span>
      ) : null}
    </div>
  );
}
