import { buildKpis, compact, exact, formatDelta, type DayRow, type MetricKey } from "@/lib/insights";
import { channelColor } from "@/lib/format";
import { ChannelAvatar } from "@/components/ui";
import { HBarList, Sparkline } from "@/components/charts";
import type { TopChannelRow } from "@/lib/queries";

const KPI_METRICS: { key: MetricKey; label: string; kind: "flow" }[] = [
  { key: "views", label: "Views", kind: "flow" },
  { key: "reach", label: "Alcance", kind: "flow" },
  { key: "likes", label: "Curtidas", kind: "flow" },
  { key: "comments", label: "Comentários", kind: "flow" },
];

/** One KPI tile: the 7-day total, the change vs. the 7 days before that, and a 14-day
 *  sparkline for shape — the same three facts /insights' own KPI row shows for one
 *  account, here summed across every active one. */
function KpiTile({
  label,
  value,
  delta,
  daysWithData,
  windowDays,
  points,
}: {
  label: string;
  value: number | null;
  delta: number | null;
  daysWithData: number;
  windowDays: number;
  points: { day: string; value: number | null }[];
}) {
  const deltaText = formatDelta(delta);
  const deltaUp = delta !== null && delta > 0;
  const deltaDown = delta !== null && delta < 0;
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
        {deltaText ? (
          <span
            className={`data shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              deltaUp
                ? "bg-status-posted/10 text-status-posted"
                : deltaDown
                  ? "bg-status-failed/10 text-status-failed"
                  : "bg-surface-sunken text-muted"
            }`}
            title={`vs. os ${windowDays} dias anteriores`}
          >
            {deltaText}
          </span>
        ) : null}
      </div>
      <p className="data mt-1 text-2xl font-semibold text-ink">{compact(value)}</p>
      {daysWithData > 0 && daysWithData < windowDays ? (
        <p className="mt-0.5 text-[10px] text-faint">
          {daysWithData} de {windowDays} dias com dado
        </p>
      ) : null}
      <div className="mt-2">
        <Sparkline points={points} color="var(--color-brand)" label={`${label} nos últimos dias`} />
      </div>
    </div>
  );
}

export function DashboardPerformance({
  aggregateRows,
  topChannels,
  postsByHour,
  activeChannelCount,
  postedTodayCount,
  windowDays,
}: {
  aggregateRows: DayRow[];
  topChannels: TopChannelRow[];
  postsByHour: { hour: number; count: number }[];
  activeChannelCount: number;
  postedTodayCount: number;
  windowDays: number;
}) {
  const kpis = buildKpis(aggregateRows, KPI_METRICS, windowDays);
  const pointsFor = (key: MetricKey) =>
    aggregateRows.slice(-14).map((r) => ({ day: r.day, value: r[key] }));

  const maxReach = Math.max(...topChannels.map((c) => c.reach), 1);
  const maxHourCount = Math.max(...postsByHour.map((h) => h.count), 1);
  const hourRows = postsByHour
    .filter((h) => h.count > 0)
    .map((h) => ({
      dimension: `${String(h.hour).padStart(2, "0")}h`,
      value: h.count,
      share: h.count / maxHourCount,
    }));

  return (
    <section className="space-y-4">
      <h2 className="font-display text-sm font-semibold text-ink">Desempenho</h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-border bg-surface p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Contas ativas
          </p>
          <p className="data mt-1 text-2xl font-semibold text-ink">{exact(activeChannelCount)}</p>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Postado hoje
          </p>
          <p className="data mt-1 text-2xl font-semibold text-ink">{exact(postedTodayCount)}</p>
        </div>
        {kpis.slice(0, 2).map((k) => (
          <KpiTile
            key={k.key}
            label={k.label}
            value={k.value}
            delta={k.delta}
            daysWithData={k.daysWithData}
            windowDays={k.windowDays}
            points={pointsFor(k.key)}
          />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {kpis.slice(2).map((k) => (
          <KpiTile
            key={k.key}
            label={k.label}
            value={k.value}
            delta={k.delta}
            daysWithData={k.daysWithData}
            windowDays={k.windowDays}
            points={pointsFor(k.key)}
          />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Top contas — alcance em {windowDays} dias
          </h3>
          {topChannels.length === 0 ? (
            <p className="text-xs text-muted">Sem dados de alcance ainda.</p>
          ) : (
            <ul className="space-y-3">
              {topChannels.map((c, i) => {
                const color = channelColor(c.id, c.color_hue);
                return (
                  <li key={c.id} className="flex items-center gap-3">
                    <span className="data w-4 shrink-0 text-[11px] text-faint">{i + 1}</span>
                    <ChannelAvatar
                      id={c.id}
                      name={c.account_name}
                      colorHue={c.color_hue}
                      avatarPath={c.avatar_path}
                      size={22}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                      {c.account_name}
                    </span>
                    <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max((c.reach / maxReach) * 100, 4)}%`,
                          backgroundColor: color.dot,
                        }}
                      />
                    </div>
                    <span className="data w-14 shrink-0 text-right text-xs text-ink">
                      {compact(c.reach)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-card border border-border bg-surface p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Publicações por horário — últimos {windowDays} dias
          </h3>
          <HBarList
            rows={hourRows}
            color="var(--color-brand)"
            emptyLabel="Nada publicado neste período ainda."
          />
        </div>
      </div>
    </section>
  );
}
