"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarChip, type ChipSend } from "@/components/calendar-chip";
import { addDays, monthOf, shiftMonth } from "@/lib/calendar";

export type CalendarSend = ChipSend;

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** Matches the Overview's filter controls — the same job should not look like a different one. */
const selectCls =
  "rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:border-brand";
/** Beyond this a month cell stops listing and starts counting — four chips is already
 *  taller than the cell, and a scrolling day square is worse than a "+2 more". */
const MONTH_CHIP_LIMIT = 3;

function label(day: string): string {
  return String(Number(day.slice(8, 10)));
}

// timeZone: "UTC" on both formatters, because the Date being formatted is a calendar date
// pinned to UTC midnight. Without it Intl renders in the VIEWER's zone, and anywhere west
// of Greenwich that lands on the previous day — which is how August briefly titled itself
// "July 2026" while showing August's grid.
function monthTitle(anchor: string): string {
  const [y, m] = anchor.split("-");
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(Number(y), Number(m) - 1, 1)));
}

function dayTitle(day: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${day}T00:00:00Z`));
}

function rangeTitle(days: string[]): string {
  const fmt = (d: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }).format(new Date(`${d}T00:00:00Z`));
  return `${fmt(days[0])} – ${fmt(days[days.length - 1])}`;
}

export function CalendarView({
  view,
  anchor,
  today,
  days,
  sendsByDay,
  gridTimezone,
  channels,
  platforms,
  account,
  platform,
}: {
  view: "week" | "month" | "day";
  anchor: string;
  today: string;
  days: string[];
  sendsByDay: Record<string, CalendarSend[]>;
  gridTimezone: string;
  channels: { id: number; account_name: string; platform: string }[];
  platforms: { value: string; label: string }[];
  account: string;
  platform: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<CalendarSend | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prev =
    view === "month" ? shiftMonth(anchor, -1) : view === "day" ? addDays(anchor, -1) : addDays(anchor, -7);
  const next =
    view === "month" ? shiftMonth(anchor, 1) : view === "day" ? addDays(anchor, 1) : addDays(anchor, 7);

  /**
   * Every control is a link carrying the WHOLE state, so filters survive paging and a
   * filtered month is a URL you can bookmark or send to yourself. Filtering happens on the
   * server (see the page) rather than by hiding rows here, so "12 sends" counts what is
   * actually on screen instead of what was fetched.
   */
  const href = (over: Partial<{ view: string; anchor: string; account: string; platform: string }>) => {
    const q = new URLSearchParams({ view, anchor, account, platform, ...over });
    // Defaults are noise in the address bar, and their absence is what "unfiltered" means.
    if (q.get("account") === "all") q.delete("account");
    if (q.get("platform") === "all") q.delete("platform");
    return `/calendar?${q.toString()}`;
  };
  const go = (over: Parameters<typeof href>[0]) => router.push(href(over));
  const total = Object.values(sendsByDay).reduce((n, s) => n + s.length, 0);

  /**
   * Move a send to another day — or, dropped onto a specific hour row (Day view only),
   * to that hour on that day too. `hour` is omitted for a month square or week row, which
   * are whole-day targets with no finer position to read a time from; day view's hourly
   * rows are the one place a drop position actually means a time, not just a date.
   *
   * Reuses the queue's own reschedule endpoint rather than a calendar-specific one: it
   * already resolves the channel's timezone and re-checks the status server-side, so a
   * drag inherits every guard instead of running beside them.
   */
  async function drop(day: string, hour?: number) {
    const send = dragging;
    setDragging(null);
    setOver(null);
    if (!send) return;
    // Keeps the original minute — an hour-row drop is deliberately coarse-grained
    // (which hour), not a request to also round the minute to :00.
    const time = hour === undefined ? send.time : `${String(hour).padStart(2, "0")}:${send.time.split(":")[1]}`;
    // Dropping a send where it already is (same day, same resulting time) asks the
    // server to change nothing.
    const alreadyOnDay = sendsByDay[day]?.some((s) => s.id === send.id) ?? false;
    if (alreadyOnDay && time === send.time) return;

    setError(null);
    const res = await fetch(`/api/publications/${send.id}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: day, time }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Esse envio não pôde ser movido.");
      return;
    }
    startTransition(() => router.refresh());
  }

  /** Drop-target wiring, identical for a month square and a week row. */
  const dropProps = (day: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return;
      // Without preventDefault the browser refuses the drop outright.
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(day);
    },
    onDragLeave: () => setOver((d) => (d === day ? null : d)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      void drop(day);
    },
  });

  /** Same wiring, keyed by "day#hour" so an hour row's highlight never collides with a
   *  whole-day one. Only used by the Day view's hourly grid. */
  const hourKey = (day: string, hour: number) => `${day}#${hour}`;
  const hourDropProps = (day: string, hour: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(hourKey(day, hour));
    },
    onDragLeave: () => setOver((d) => (d === hourKey(day, hour) ? null : d)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      void drop(day, hour);
    },
  });

  const chipFor = (s: CalendarSend, dense: boolean) => (
    <CalendarChip
      key={s.id}
      send={s}
      dense={dense}
      dragging={dragging?.id === s.id}
      onDragStart={setDragging}
      onDragEnd={() => {
        setDragging(null);
        setOver(null);
      }}
    />
  );

  /**
   * A week is a list of days, not seven narrow columns.
   *
   * The month grid already answers "what does this month look like"; a week view squeezed
   * into the same seven columns just repeats it with fewer squares, and the captions get
   * clipped to a single letter. Giving each day a full-width row is what buys the room
   * that makes the week view worth having.
   */
  const weekRow = (day: string) => {
    const sends = sendsByDay[day] ?? [];
    const isToday = day === today;
    const isTarget = over === day && dragging !== null;
    const weekday = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];

    return (
      <div
        key={day}
        {...dropProps(day)}
        className={`flex gap-4 border-b border-border p-3 last:border-0 transition-colors ${
          isTarget ? "bg-brand-weak ring-2 ring-inset ring-brand" : ""
        }`}
      >
        <div className="w-24 shrink-0">
          <span
            className={`data text-xs ${
              isToday
                ? "rounded-full bg-brand px-2 py-0.5 font-semibold text-on-brand"
                : "text-ink-soft"
            }`}
          >
            {weekday} {label(day)}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {sends.length === 0 ? (
            <Link
              href={`/compose?date=${day}`}
              className="text-[11px] text-faint hover:text-brand"
            >
              + Nada agendado — adicionar post
            </Link>
          ) : (
            sends.map((s) => chipFor(s, false))
          )}
        </div>
      </div>
    );
  };

  const monthCell = (day: string) => {
    const sends = sendsByDay[day] ?? [];
    const shown = sends.slice(0, MONTH_CHIP_LIMIT);
    const hidden = sends.length - shown.length;
    const isToday = day === today;
    const outside = monthOf(day) !== monthOf(anchor);
    const isTarget = over === day && dragging !== null;

    return (
      <div
        key={day}
        {...dropProps(day)}
        // group/cell must live on the cell ITSELF. It was on a `display: contents` wrapper,
        // which generates no box and so never matches :hover — the empty-day "+" stayed
        // opacity-0 forever and the affordance was invisible.
        className={`group/cell flex min-h-[104px] flex-col gap-1 border-b border-r border-border p-1.5 transition-colors ${
          outside ? "bg-surface-sunken/40" : "bg-surface"
        } ${isTarget ? "bg-brand-weak ring-2 ring-inset ring-brand" : ""}`}
      >
        <div className="flex items-baseline justify-between">
          <span
            className={`data text-[11px] ${
              isToday
                ? "rounded-full bg-brand px-1.5 py-0.5 font-semibold text-on-brand"
                : outside
                  ? "text-faint"
                  : "text-ink-soft"
            }`}
          >
            {label(day)}
          </span>
          {/* An empty day is the point of the calendar — make filling it one click. */}
          {sends.length === 0 ? (
            <Link
              href={`/compose?date=${day}`}
              title={`Postar algo agendado para ${day}`}
              className="text-[13px] leading-none text-faint opacity-0 transition-opacity hover:text-brand focus:opacity-100 group-hover/cell:opacity-100"
            >
              +
            </Link>
          ) : null}
        </div>
        {shown.map((s) => chipFor(s, true))}
        {hidden > 0 ? (
          <Link
            href={href({ view: "week", anchor: day })}
            className="px-1 text-[10px] text-muted hover:text-brand"
          >
            +{hidden} mais
          </Link>
        ) : null}
      </div>
    );
  };

  /**
   * One day, as 24 hourly rows — the one view precise enough for a drop position to mean
   * a TIME, not just a date. Month cells and week rows are whole-day targets; there is no
   * meaningful "which hour" to read from a drop position inside either of them.
   */
  const HOURS = Array.from({ length: 24 }, (_, h) => h);
  const dayGrid = (day: string) => {
    const sends = [...(sendsByDay[day] ?? [])].sort((a, b) => a.time.localeCompare(b.time));
    return (
      <div className="flex flex-col">
        {HOURS.map((hour) => {
          const inHour = sends.filter((s) => Number(s.time.split(":")[0]) === hour);
          const isTarget = over === hourKey(day, hour) && dragging !== null;
          return (
            <div
              key={hour}
              {...hourDropProps(day, hour)}
              className={`flex gap-3 border-b border-border p-2 last:border-0 transition-colors ${
                isTarget ? "bg-brand-weak ring-2 ring-inset ring-brand" : ""
              }`}
            >
              <span className="data w-12 shrink-0 pt-0.5 text-[11px] text-faint">
                {String(hour).padStart(2, "0")}h
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {inHour.map((s) => chipFor(s, false))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={href({ anchor: prev })}
            aria-label="Anterior"
            className="rounded-md border border-border px-2 py-1 text-sm text-ink-soft hover:bg-surface-sunken"
          >
            ‹
          </Link>
          <Link
            href={href({ anchor: next })}
            aria-label="Próximo"
            className="rounded-md border border-border px-2 py-1 text-sm text-ink-soft hover:bg-surface-sunken"
          >
            ›
          </Link>
          <Link
            href={href({ anchor: today })}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-surface-sunken"
          >
            Hoje
          </Link>
        </div>
        <h2 className="text-base font-semibold text-ink">
          {view === "month" ? monthTitle(anchor) : view === "day" ? dayTitle(anchor) : rangeTitle(days)}
        </h2>
        <span className="data text-[11px] text-muted">
          {total} envio{total === 1 ? "" : "s"}
        </span>
        <select
          aria-label="Filtrar por conta"
          className={selectCls}
          value={account}
          onChange={(e) => go({ account: e.target.value })}
        >
          <option value="all">Todas as contas</option>
          {channels.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.account_name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por plataforma"
          className={selectCls}
          value={platform}
          onChange={(e) => go({ platform: e.target.value })}
        >
          <option value="all">Todas as plataformas</option>
          {platforms.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1">
          {(["day", "week", "month"] as const).map((v) => (
            <Link
              key={v}
              href={href({ view: v })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                view === v
                  ? "bg-brand-weak text-brand-strong"
                  : "border border-border text-muted hover:text-ink"
              }`}
            >
              {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-status-failed">
          {error}
        </p>
      ) : null}

      <div
        className={`overflow-hidden rounded-card border border-border bg-surface ${
          pending ? "opacity-60" : ""
        }`}
      >
        {view === "month" ? (
          <div className="grid grid-cols-7 border-l-0">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="border-b border-r border-border bg-surface-sunken px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-faint"
              >
                {d}
              </div>
            ))}
            {days.map((day) => monthCell(day))}
          </div>
        ) : view === "day" ? (
          dayGrid(days[0])
        ) : (
          <div className="flex flex-col">{days.map((day) => weekRow(day))}</div>
        )}
      </div>

      <p className="text-[11px] text-faint">
        Cada envio mostra o horário local da própria conta. Hoje é{" "}
        {gridTimezone.replace("_", " ")}.
        {view === "day"
          ? " Arraste um envio para outra hora para reagendá-lo — o minuto original é mantido."
          : " Arraste um envio agendado para outro dia para movê-lo — o horário do dia permanece o mesmo. Para ajustar a hora, mude para a visão Dia."}
      </p>
    </div>
  );
}
