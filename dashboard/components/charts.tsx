/*
  Charts — hand-rolled SVG, no charting library.

  Four simple shapes do not justify a dependency, and a library would fight the theme
  system: every colour here is a CSS custom property, so all seven theme families and
  both modes work without the charts knowing they exist.

  No client JavaScript. Tooltips are SVG <title> elements, which browsers render
  natively and screen readers announce — a hover layer in React would ship a bundle to
  do worse. Each chart also carries role="img" with a summary label so the whole figure
  is announced as one thing rather than as a pile of unlabelled rectangles.

  Nulls are drawn as gaps, never as zero. "The worker was stopped" and "reach was zero"
  look different on purpose.
*/

export interface Point {
  day: string;
  value: number | null;
}

const niceMax = (values: number[]): number => {
  const max = Math.max(...values, 0);
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
};

const shortDay = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/* ------------------------------------------------------------------ Sparkline ----- */

/**
 * Inline trend line for a card. Deliberately axis-free: at this size a scale would be
 * unreadable, and the shape is the only thing being communicated.
 */
export function Sparkline({
  points,
  color,
  width = 240,
  height = 36,
  label,
}: {
  points: Point[];
  color: string;
  width?: number;
  height?: number;
  label: string;
}) {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length < 2) {
    return (
      <div className="flex h-9 items-center text-[11px] text-faint">
        Histórico insuficiente ainda
      </div>
    );
  }
  const max = niceMax(values);
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const y = (v: number) => height - (v / max) * (height - 2) - 1;

  // Split into runs of consecutive non-null points so a gap breaks the line rather than
  // drawing a straight segment across days that were never recorded.
  const runs: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current.length > 1) runs.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${(i * step).toFixed(2)},${y(p.value).toFixed(2)}`);
  });
  if (current.length > 1) runs.push(current.join(" "));

  const last = points.at(-1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-9 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {runs.map((run, i) => (
        <polyline
          key={i}
          points={run}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {last?.value !== null && last?.value !== undefined ? (
        <circle cx={width} cy={y(last.value)} r={2} fill={color} />
      ) : null}
    </svg>
  );
}

/* ----------------------------------------------------------------- YearRibbon ----- */

/**
 * One hairline bar per day across the full width — the hub's signature.
 *
 * A year of daily reach is 365 numbers, which no line chart shows honestly at this width:
 * smoothing hides the spikes, and the spikes are the interesting part. Rendering every
 * day as its own bar keeps each one recoverable (hover names the date and value) while
 * the mass of them reads as a single trace.
 *
 * Days with no reading draw as a baseline tick in the border colour, so a collection gap
 * is visibly different from a quiet day.
 */
export function YearRibbon({
  points,
  color,
  label,
  height = 64,
}: {
  points: Point[];
  color: string;
  label: string;
  height?: number;
}) {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (!values.length) {
    return (
      <div className="rounded-card border border-dashed border-border px-4 py-6 text-center text-xs text-muted">
        Nenhum histórico diário registrado ainda.
      </div>
    );
  }
  const max = niceMax(values);
  const barWidth = 1;
  const gap = 0.4;
  const pitch = barWidth + gap;
  const width = points.length * pitch;
  const peak = points.reduce<Point | null>(
    (best, p) => (p.value !== null && (!best || p.value > (best.value ?? 0)) ? p : best),
    null,
  );

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
        style={{ height }}
        role="img"
        aria-label={label}
      >
        {points.map((p, i) => {
          const x = i * pitch;
          if (p.value === null) {
            return (
              <rect
                key={p.day}
                x={x}
                y={height - 1}
                width={barWidth}
                height={1}
                fill="var(--color-border-strong)"
              >
                <title>{`${shortDay(p.day)} — não registrado`}</title>
              </rect>
            );
          }
          const barHeight = Math.max((p.value / max) * height, p.value > 0 ? 1 : 0.5);
          return (
            <rect
              key={p.day}
              x={x}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              fill={color}
              opacity={0.85}
            >
              <title>{`${shortDay(p.day)} — ${p.value.toLocaleString()}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-faint">
        <span className="data">{points[0] ? shortDay(points[0].day) : ""}</span>
        {peak?.value ? (
          <span className="data text-muted">
            pico {peak.value.toLocaleString()} · {shortDay(peak.day)}
          </span>
        ) : null}
        <span className="data">{points.at(-1) ? shortDay(points.at(-1)!.day) : ""}</span>
      </figcaption>
    </figure>
  );
}

/* ----------------------------------------------------------------- TrendChart ----- */

/**
 * The main series view: filled area with gridlines and a labelled y-axis.
 *
 * Gridlines sit behind the fill at low opacity — readable enough to give the numbers a
 * scale, quiet enough that the shape stays the subject.
 */
export function TrendChart({
  points,
  color,
  label,
  height = 200,
}: {
  points: Point[];
  color: string;
  label: string;
  height?: number;
}) {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length < 2) {
    return (
      <div className="rounded-card border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
        Histórico insuficiente ainda — isso se preenche conforme o worker coleta cada dia.
      </div>
    );
  }
  const width = 720;
  const padLeft = 44;
  const padBottom = 20;
  const padTop = 8;
  const plotWidth = width - padLeft;
  const plotHeight = height - padBottom - padTop;
  const max = niceMax(values);
  const step = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
  const x = (i: number) => padLeft + i * step;
  const y = (v: number) => padTop + plotHeight - (v / max) * plotHeight;

  const runs: { line: string; area: string }[] = [];
  let current: { i: number; v: number }[] = [];
  const flush = () => {
    if (current.length > 1) {
      const line = current.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
      const area =
        `${x(current[0].i).toFixed(1)},${(padTop + plotHeight).toFixed(1)} ` +
        line +
        ` ${x(current.at(-1)!.i).toFixed(1)},${(padTop + plotHeight).toFixed(1)}`;
      runs.push({ line, area });
    }
    current = [];
  };
  points.forEach((p, i) => {
    if (p.value === null) flush();
    else current.push({ i, v: p.value });
  });
  flush();

  const gridValues = [0, max / 2, max];
  const ticks = [0, Math.floor(points.length / 2), points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height }}
      role="img"
      aria-label={label}
    >
      {gridValues.map((v) => (
        <g key={v}>
          <line
            x1={padLeft}
            x2={width}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
          <text
            x={padLeft - 8}
            y={y(v) + 3}
            textAnchor="end"
            className="data"
            fontSize={10}
            fill="var(--color-faint)"
          >
            {v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)}
          </text>
        </g>
      ))}

      {runs.map((run, i) => (
        <polygon key={`a${i}`} points={run.area} fill={color} opacity={0.1} />
      ))}
      {runs.map((run, i) => (
        <polyline
          key={`l${i}`}
          points={run.line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {points.map((p, i) =>
        p.value === null ? null : (
          <circle key={p.day} cx={x(i)} cy={y(p.value)} r={Math.max(step / 2, 3)} fill="transparent">
            <title>{`${shortDay(p.day)} — ${p.value.toLocaleString()}`}</title>
          </circle>
        ),
      )}

      {ticks.map((i) =>
        points[i] ? (
          <text
            key={`t${i}`}
            x={x(i)}
            y={height - 4}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            className="data"
            fontSize={10}
            fill="var(--color-faint)"
          >
            {shortDay(points[i].day)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ HBarList ----- */

/** Ranked horizontal bars — the honest shape for named categories, where a pie forces
 *  the reader to compare angles. */
export function HBarList({
  rows,
  color,
  formatValue,
  emptyLabel = "Sem dados ainda",
}: {
  rows: { dimension: string; value: number; share: number }[];
  color: string;
  formatValue?: (value: number) => string;
  emptyLabel?: string;
}) {
  if (!rows.length) {
    return <p className="text-xs text-muted">{emptyLabel}</p>;
  }
  const widest = Math.max(...rows.map((r) => r.share), 0.0001);
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.dimension} className="grid grid-cols-[1fr_auto] items-center gap-x-3">
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] text-ink-soft">{row.dimension}</span>
              <span className="data shrink-0 text-[11px] text-muted">
                {(row.share * 100).toFixed(1)}%
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((row.share / widest) * 100, 2)}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
          <span className="data self-center text-xs tabular-nums text-ink">
            {formatValue ? formatValue(row.value) : row.value.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------- FunnelChart ---- */

/**
 * A stepped funnel: one bar per stage, width proportional to the FIRST stage that has a
 * value (not the previous stage) — so a null in the middle does not silently rescale
 * everything after it and make a flat unreported step look like 100% retention.
 *
 * A stage with no data draws as a dashed outline rather than a bar, matching this file's
 * rule that "unreported" and "reported zero" must never look the same.
 */
export function FunnelChart({
  steps,
  color,
  label,
}: {
  steps: { key: string; label: string; value: number | null }[];
  color: string;
  label: string;
}) {
  const base = steps.find((s) => s.value !== null && s.value > 0)?.value ?? null;

  if (base === null) {
    return (
      <div className="rounded-card border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
        Nenhum dado de story ainda.
      </div>
    );
  }

  return (
    <div role="img" aria-label={label} className="space-y-2.5">
      {steps.map((step, i) => {
        const pct = step.value === null ? null : Math.round((step.value / base) * 100);
        const widthPct = step.value === null ? 100 : Math.max(pct ?? 0, step.value > 0 ? 3 : 0);
        const prev = i > 0 ? steps[i - 1] : null;
        const dropPct =
          prev && prev.value !== null && prev.value > 0 && step.value !== null
            ? Math.round((step.value / prev.value) * 100)
            : null;
        return (
          <div key={step.key}>
            <div className="mb-1 flex items-baseline justify-between text-[11px]">
              <span className="font-medium text-ink-soft">{step.label}</span>
              <span className="data text-muted">
                {step.value === null
                  ? "não disponível"
                  : `${step.value.toLocaleString()}${pct !== null ? ` · ${pct}%` : ""}${
                      dropPct !== null && i > 0 ? ` · ${dropPct}% do passo anterior` : ""
                    }`}
              </span>
            </div>
            <div className="h-6 overflow-hidden rounded-md bg-surface-sunken">
              {step.value === null ? (
                <div className="h-full w-full rounded-md border border-dashed border-border-strong" />
              ) : (
                <div
                  className="h-full rounded-md"
                  style={{ width: `${widthPct}%`, backgroundColor: color, opacity: 0.85 }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------- HeatGrid ---- */

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * Weekday × hour engagement, computed from this account's own posts.
 *
 * Cells the account has never posted in are blank rather than dark — an untried hour is
 * unknown, not bad, and shading it as "low" would talk someone out of the best slot they
 * have never used.
 */
export function HeatGrid({
  cells,
  color,
  timeZoneLabel,
}: {
  cells: { weekday: number; hour: number; posts: number; avgEngagement: number | null }[];
  color: string;
  timeZoneLabel: string;
}) {
  const scored = cells.filter((c) => c.avgEngagement !== null);
  if (!scored.length) {
    return (
      <p className="text-xs text-muted">
        Ainda não há posts suficientes para ver um padrão. É preciso pelo menos dois posts
        no mesmo horário de dia da semana.
      </p>
    );
  }
  const max = Math.max(...scored.map((c) => c.avgEngagement as number));
  const best = scored.reduce((a, b) =>
    (b.avgEngagement as number) > (a.avgEngagement as number) ? b : a,
  );

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[2px]">
          <caption className="sr-only">
            Engajamento médio por dia da semana e hora, em {timeZoneLabel}
          </caption>
          <tbody>
            {WEEKDAY_LABELS.map((weekdayLabel, weekday) => (
              <tr key={weekday}>
                <th
                  scope="row"
                  className="pr-2 text-right text-[10px] font-medium uppercase tracking-wide text-faint"
                >
                  {weekdayLabel}
                </th>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = cells.find((c) => c.weekday === weekday && c.hour === hour);
                  const score = cell?.avgEngagement ?? null;
                  const intensity = score === null ? 0 : Math.max(score / max, 0.12);
                  return (
                    <td key={hour} className="p-0">
                      <div
                        className="h-4 w-4 rounded-[3px]"
                        style={{
                          backgroundColor:
                            score === null ? "var(--color-surface-sunken)" : color,
                          opacity: score === null ? 1 : intensity,
                        }}
                        title={
                          score === null
                            ? `${weekdayLabel} ${hour}:00 — sem posts`
                            : `${weekdayLabel} ${hour}:00 — ${Math.round(score)} engajamento médio em ${cell?.posts} posts`
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td />
              {Array.from({ length: 24 }, (_, hour) => (
                <td key={hour} className="pt-1 text-center">
                  {hour % 6 === 0 ? (
                    <span className="data text-[9px] text-faint">{hour}</span>
                  ) : null}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Melhor horário:{" "}
        <span className="data font-medium text-ink">
          {WEEKDAY_LABELS[best.weekday]} {String(best.hour).padStart(2, "0")}:00
        </span>{" "}
        · {Math.round(best.avgEngagement as number)} engajamento médio em{" "}
        <span className="data">{best.posts}</span> posts · horários em {timeZoneLabel}
      </p>
    </div>
  );
}
