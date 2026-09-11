import Link from "next/link";
import { PageHeader, EmptyState, ChannelAvatar } from "@/components/ui";
import { Sparkline } from "@/components/charts";
import { InsightsRefresh } from "@/components/insights-refresh";
import {
  getInsightsChannels,
  getAccountDays,
  getChannelCounts,
} from "@/lib/insights-queries";
import {
  compact, exact, formatDelta, latestMetric,
  type MetricKey,
} from "@/lib/insights";
import {
  buildRangeKpis, denseRange, parseRangeParams, previousPeriod, rangeLabel, rangeLength,
  rowsInRange,
} from "@/lib/date-range";
import { channelColor } from "@/lib/format";
import { platformBadge, platformLabel } from "@/lib/platforms";
import { getSessionUser } from "@/lib/auth";
import { DateRangeFilter } from "@/components/date-range-filter";

export const dynamic = "force-dynamic";

/*
  The hub: one card per account, each linking to its own page.

  There is deliberately no combined "all accounts" total. Reach cannot be summed across
  accounts without double-counting the people who follow both, so any such number would
  be wrong in a way nobody could see. Comparison happens by putting the cards side by
  side, which is honest and just as fast to read.
*/

// Platforms with an account-insights endpoint. Discord and Telegram have none at all,
// and Facebook Pages arrive with their own adapter later — stating that on the card is
// better than an empty card that reads as a bug.
const HAS_ACCOUNT_INSIGHTS = new Set(["instagram", "threads", "tiktok", "facebook"]);

/**
 * What each platform's card shows, in that platform's own terms.
 *
 * `kind` matters and is not decoration. A "flow" metric is summed across the window
 * (reach this month); a "level" is a standing total read at the end of it (followers
 * today). TikTok exposes ONLY levels — it publishes no per-day series of any kind, so
 * summing its counters would add up repeated snapshots of the same cumulative number and
 * produce a figure that means nothing.
 *
 * `sparkKey` is the one series worth drawing. Instagram and Threads have engagement to
 * plot; TikTok has followers and literally nothing else.
 */
const CARD_METRICS: Record<
  string,
  { key: MetricKey; label: string; kind: "flow" | "level" }[]
> = {
  instagram: [
    { key: "reach", label: "Alcance", kind: "flow" },
    { key: "views", label: "Visualizações", kind: "flow" },
    { key: "accounts_engaged", label: "Engajadas", kind: "flow" },
  ],
  threads: [
    { key: "views", label: "Visualizações", kind: "flow" },
    { key: "likes", label: "Curtidas", kind: "flow" },
    { key: "replies", label: "Respostas", kind: "flow" },
  ],
  // Facebook Pages. No reach and no impressions ROW — page_impressions and
  // page_impressions_unique are retired (probed live 2026-08-23), so unlike Instagram
  // there is nothing to put in that slot and pretending otherwise would show a zero where
  // Meta simply stopped reporting.
  facebook: [
    { key: "profile_views", label: "Visitas à página", kind: "flow" },
    { key: "total_interactions", label: "Engajamentos", kind: "flow" },
    { key: "views", label: "Views de vídeo", kind: "flow" },
  ],
  // TikTok's entire account-level API: four counters, no series, no reach, no views, no
  // engagement. Followers are shown separately as the headline, so the card carries the
  // other three. "Total likes" is lifetime and only ever rises — labelled so it cannot be
  // read as likes-this-month.
  tiktok: [
    { key: "media_count", label: "Vídeos", kind: "level" },
    { key: "lifetime_likes", label: "Curtidas totais", kind: "level" },
    { key: "follows_count", label: "Seguindo", kind: "level" },
  ],
};

const SPARK_KEY: Record<string, MetricKey> = {
  tiktok: "followers_count",
  // Page views rather than the reach the other cards plot — a Page has no reach left to
  // plot at all.
  facebook: "profile_views",
};

// Platforms that publish no past data at all, so nothing can ever backfill: the series
// begins the day the channel was connected and grows one sample at a time. Saying "still
// backfilling" here would promise history that is never coming — a wait with no end.
// Threads is the same shape (see sync_threads_account) but predates this notice.
const NO_HISTORY = new Set(["tiktok"]);

// Instagram and Threads report followers GAINED per day. TikTok reports only a running
// follower total, so its growth is the change in that level across the window — the same
// number, arrived at differently. Using follows_gained for TikTok would render a
// permanently blank "New" figure that reads as broken rather than absent.
const FOLLOWER_DELTA: Record<string, { key: MetricKey; kind: "flow" | "level" }> = {
  tiktok: { key: "followers_count", kind: "level" },
};

function sinceLabel(iso: string | null): string {
  if (!iso) return "nunca";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { preset, range } = parseRangeParams(query);
  const previous = previousPeriod(range);
  const viewer = await getSessionUser();
  const ownerId = viewer && !viewer.is_admin ? viewer.id : null;
  const channels = getInsightsChannels(ownerId);
  const supported = channels.filter((c) => HAS_ACCOUNT_INSIGHTS.has(c.platform));
  const unsupported = channels.filter((c) => !HAS_ACCOUNT_INSIGHTS.has(c.platform));

  return (
    <div>
      <PageHeader
        title="Relatório"
        subtitle="Como cada conta conectada está realmente indo — todas as publicações, não só as agendadas aqui."
      />

      <div className="px-8 py-6 space-y-8">
        {supported.length > 0 ? (
          <div className="flex justify-end">
            <DateRangeFilter preset={preset} start={range.start} end={range.end} />
          </div>
        ) : null}
        {supported.length === 0 ? (
          <EmptyState title="Nenhuma conta com estatísticas ainda">
            Conecte uma conta Instagram ou Threads em{" "}
            <Link href="/channels" className="text-brand-strong underline">
              Contas
            </Link>{" "}
            . As métricas começam a ser coletadas no próximo ciclo do worker.
          </EmptyState>
        ) : (
          <section>
            <div className="grid gap-4 lg:grid-cols-2">
              {supported.map((channel) => {
                const color = channelColor(channel.id, channel.color_hue);
                // Fetched wide enough to cover both the selected range AND the equal-length
                // period before it, however far back a custom range reaches — the 400-day
                // default only covers about the last 13 months.
                const daysNeeded = rangeLength({ start: previous.start, end: range.end });
                const allDays = getAccountDays(channel.id, Math.max(daysNeeded, 400));
                const currentRows = rowsInRange(allDays, range);
                const previousRows = rowsInRange(allDays, previous);
                const counts = getChannelCounts(channel.id);
                const metrics = CARD_METRICS[channel.platform] ?? CARD_METRICS.instagram;
                const kpis = buildRangeKpis(currentRows, previousRows, metrics, range);
                // The headline follower count is a snapshot of right now, not scoped to
                // whatever range is selected — "seguidores" answers "how many today", same
                // question regardless of which period the KPI row below is showing.
                const followers = latestMetric(allDays, "followers_count");
                const deltaSpec = FOLLOWER_DELTA[channel.platform] ?? {
                  key: "follows_gained" as MetricKey,
                  kind: "flow" as const,
                };
                const followerDelta = buildRangeKpis(
                  currentRows,
                  previousRows,
                  [{ ...deltaSpec, label: "New" }],
                  range,
                )[0];
                const sparkKey = SPARK_KEY[channel.platform];
                const spark = denseRange(currentRows, range).map((d) => ({
                  day: d.day,
                  value: sparkKey ? d[sparkKey] : (d.reach ?? d.views),
                }));

                return (
                  <article
                    key={channel.id}
                    className="rounded-card border border-border bg-surface"
                  >
                    <Link
                      href={`/insights/${channel.id}`}
                      className="block rounded-card px-5 pt-5 pb-4 transition-colors hover:bg-surface-sunken/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <ChannelAvatar
                            id={channel.id}
                            name={channel.account_name}
                            colorHue={channel.color_hue}
                            avatarPath={channel.avatar_path}
                            size={28}
                          />
                          <div className="min-w-0">
                            <h2 className="truncate font-display text-[15px] font-semibold text-ink">
                              {channel.account_name}
                            </h2>
                            <p className="text-[11px] uppercase tracking-wide text-faint">
                              {platformBadge(channel.platform)}
                              {channel.business_label ? ` · ${channel.business_label}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="data text-2xl font-semibold leading-none text-ink">
                            {compact(followers)}
                          </div>
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-faint">
                            seguidores
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <Sparkline
                          points={spark}
                          color={color.fg}
                          label={`Tendência ${rangeLabel(preset, range)} de ${channel.account_name}`}
                        />
                      </div>

                      {/* Instrument row: hairline-divided cells, mono figures. */}
                      <dl className="mt-3 grid grid-cols-3 divide-x divide-border border-t border-border pt-3">
                        {kpis.map((kpi, index) => {
                          const delta = formatDelta(kpi.delta);
                          // Same honesty rule as the detail page: a metric the platform
                          // only reports for a day or two must not sit under the selected
                          // range's heading as though it covered the whole period.
                          const partial =
                            kpi.value !== null && kpi.daysWithData < kpi.windowDays;
                          return (
                            <div
                              key={kpi.key}
                              className={index === 0 ? "pr-3" : "px-3 last:pr-0"}
                            >
                              <dt className="text-[10px] uppercase tracking-wide text-faint">
                                {kpi.label}
                              </dt>
                              <dd className="data mt-0.5 text-base font-medium text-ink">
                                {compact(kpi.value)}
                                {partial ? (
                                  <span
                                    className="ml-1.5 text-[10px] font-medium text-status-publishing"
                                    title={`Só ${kpi.daysWithData} dos últimos ${kpi.windowDays} dias estão registrados para esta métrica`}
                                  >
                                    {kpi.daysWithData}d
                                  </span>
                                ) : delta ? (
                                  <span
                                    className={`ml-1.5 text-[10px] font-medium ${
                                      kpi.delta! > 0
                                        ? "text-status-posted"
                                        : "text-status-failed"
                                    }`}
                                  >
                                    {delta}
                                  </span>
                                ) : null}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    </Link>

                    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-2.5 text-[11px] text-muted">
                      <span>
                        <span className="data">{exact(counts.posts)}</span> posts acompanhados ·{" "}
                        <span className="data">{exact(counts.ours)}</span> agendados por aqui
                        {followerDelta.value === null ? (
                          ""
                        ) : (
                          <>
                            {" · "}
                            <span className="data">+{followerDelta.value}</span> novos
                            seguidores {rangeLabel(preset, range)}
                          </>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span>sincronizado {sinceLabel(channel.insights_synced_at)}</span>
                        <InsightsRefresh
                          channelId={channel.id}
                          pending={Boolean(channel.insights_refresh_requested)}
                        />
                      </span>
                    </footer>

                    {channel.insights_error ? (
                      <p className="border-t border-border px-5 py-2 text-[11px] text-status-failed">
                        Última sincronização falhou: {channel.insights_error}
                      </p>
                    ) : null}
                    {NO_HISTORY.has(channel.platform) ? (
                      <p className="border-t border-border px-5 py-2 text-[11px] text-muted">
                        O histórico começa no dia em que você conectou — {platformLabel(channel.platform)}{" "}
                        não publica dados passados, então isso vai se preenchendo dia a dia.
                      </p>
                    ) : !channel.media_backfill_complete ? (
                      <p className="border-t border-border px-5 py-2 text-[11px] text-muted">
                        Ainda preenchendo o histórico — os números abaixo vão continuar aparecendo.
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {unsupported.length > 0 ? (
          <section>
            <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-muted">
              Sem estatísticas disponíveis
            </h2>
            <div className="rounded-card border border-border bg-surface px-5 py-4">
              <ul className="space-y-1.5 text-sm text-ink-soft">
                {unsupported.map((channel) => (
                  <li key={channel.id} className="flex items-center gap-2">
                    <ChannelAvatar
                      id={channel.id}
                      name={channel.account_name}
                      colorHue={channel.color_hue}
                      avatarPath={channel.avatar_path}
                      size={16}
                    />
                    <span className="font-medium">{channel.account_name}</span>
                    <span className="text-muted">
                      — {platformLabel(channel.platform)}{" "}
                      não tem endpoint de estatísticas nenhum
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                Discord e Telegram publicam via webhook e API de bot. Nenhuma das duas
                plataformas expõe analytics, então não há nada pra ler aqui — é uma
                limitação desses serviços, não uma funcionalidade faltando neste app.
              </p>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
