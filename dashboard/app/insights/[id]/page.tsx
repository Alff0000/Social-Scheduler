import Link from "next/link";
import { notFound } from "next/navigation";
import { ChannelAvatar } from "@/components/ui";
import { HBarList, HeatGrid, TrendChart, YearRibbon } from "@/components/charts";
import { InsightsRefresh } from "@/components/insights-refresh";
import { BppMark } from "@/components/bpp-mark";
import { BppTolerance } from "@/components/bpp-tolerance";
import {
  getAccountDays, getBppFlags, getBppPool, getChannelCounts, getChannelPosts,
  getDemographics, getInsightsChannel, getLibraryPostIds, pickDemographics,
} from "@/lib/insights-queries";
import {
  GENDER_LABELS, POST_SORTS, RANGES, bestTimeGrid, buildKpis, compact, densify,
  engagementOf, exact, formatDelta, latestMetric, postKindLabel, postKinds, rangeDays,
  sortAgeBuckets, sortPosts, standoutsFor, topBuckets, windowRows,
  type MetricKey, type PostSortKey,
} from "@/lib/insights";
import { channelColor, tzAbbrev } from "@/lib/format";
import { platformLabel } from "@/lib/platforms";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/*
  One account, in depth.

  Every control here is a link that sets a search param, so the whole page stays a server
  component: no client bundle, and any view is a URL somebody can bookmark or send. The
  interactions are cheap enough server-side that shipping React state for them would cost
  more than it bought.
*/

const METRICS: Record<string, { key: MetricKey; label: string; kind: "flow" | "level" }[]> = {
  instagram: [
    { key: "reach", label: "Alcance", kind: "flow" },
    { key: "views", label: "Visualizações", kind: "flow" },
    { key: "profile_views", label: "Visitas ao perfil", kind: "flow" },
    { key: "accounts_engaged", label: "Contas engajadas", kind: "flow" },
    { key: "total_interactions", label: "Interações", kind: "flow" },
    { key: "follows_gained", label: "Novos seguidores", kind: "flow" },
  ],
  threads: [
    { key: "views", label: "Visualizações", kind: "flow" },
    { key: "likes", label: "Curtidas", kind: "flow" },
    { key: "replies", label: "Respostas", kind: "flow" },
    { key: "shares", label: "Republicações", kind: "flow" },
    { key: "followers_count", label: "Seguidores", kind: "level" },
  ],
};

// What each platform genuinely cannot report, stated on the page so a blank reads as a
// platform limit rather than a broken sync.
const GAPS: Record<string, string> = {
  threads:
    "O Threads não reporta alcance nem salvamentos, e o histórico da conta começa no dia em que esta instalação sincronizou pela primeira vez — não existe endpoint de backfill.",
  instagram: "",
};

// Per-post columns each platform actually fills. A column that can only ever be "—"
// reads as a broken sync, so it is dropped rather than shown empty; the GAPS note above
// says why it is missing.
const POST_COLUMNS: Record<
  string,
  {
    key: "reach" | "impressions" | "likes" | "comments" | "saves" | "shares";
    label: string;
  }[]
> = {
  instagram: [
    { key: "reach", label: "Alcance" },
    // The impressions column holds Instagram's `views` — the name that replaced the
    // retired impressions/plays/video_views, and the headline number on a Reel.
    { key: "impressions", label: "Visualizações" },
    { key: "likes", label: "Curtidas" },
    { key: "comments", label: "Comentários" },
    { key: "saves", label: "Salvamentos" },
    // Instagram's `shares` — a send to DMs or a story, NOT a repost.
    //
    // There is no Reposts column here, but NOT because Instagram lacks the data. Meta
    // added a `reposts_count` field on IG media on 2026-04-22 (alongside saved_count,
    // shares_count and the total_*_count family). Every one of them requires the
    // Instagram-API-with-FACEBOOK-Login path, and this install authenticates via
    // Instagram Login (META_GRAPH_BASE = graph.instagram.com, no linked Page), so the
    // whole family answers "nonexisting field" here — as does the long-standing
    // `view_count`, which is the tell that this is an auth-flavour gap, not a field-name
    // one. Version is not the lever: identical under v25.0 and v26.0.
    //
    // Getting reposts therefore means moving this channel to the Facebook-Login path
    // (IG Business account linked to a Facebook Page + Page token), not adding a metric
    // name. clients._BASE_URLS already supports it via config.graph_base.
    // Probed live 2026-08-07 — re-probe before treating any of this as still true.
    { key: "shares", label: "Compartilhamentos" },
  ],
  threads: [
    { key: "likes", label: "Curtidas" },
    { key: "comments", label: "Respostas" },
    { key: "shares", label: "Republicações" },
  ],
};

function Pill({
  href, active, children,
}: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-brand-weak text-brand-strong"
          : "text-muted hover:bg-surface-sunken hover:text-ink-soft"
      }`}
      aria-current={active ? "true" : undefined}
    >
      {children}
    </Link>
  );
}

function Section({
  title, hint, action, children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <div>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
            {title}
          </h2>
          {hint ? <p className="mt-0.5 text-[11px] text-faint">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export default async function ChannelInsightsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const viewer = await getSessionUser();
  const ownerId = viewer && !viewer.is_admin ? viewer.id : null;
  const channelId = Number(id);
  const channel = Number.isInteger(channelId) ? getInsightsChannel(channelId) : null;
  if (!channel || (ownerId !== null && channel.owner_user_id !== ownerId)) notFound();

  const rangeKey = typeof query.range === "string" ? query.range : "30d";
  const days = rangeDays(rangeKey);
  const metricList = METRICS[channel.platform] ?? METRICS.instagram;
  const metricKey = (typeof query.metric === "string" ? query.metric : metricList[0].key) as MetricKey;
  const activeMetric = metricList.find((m) => m.key === metricKey) ?? metricList[0];
  const columns = POST_COLUMNS[channel.platform] ?? POST_COLUMNS.instagram;
  // Sorting defaults to the platform's own headline column, so Threads does not open on
  // "Reach" — a column it never fills, which would leave the default order arbitrary.
  const sorts = POST_SORTS.filter(
    (s) =>
      s.key === "engagement" ||
      s.key === "published_at" ||
      columns.some((c) => c.key === s.key),
    // A control and the column it sorts must share one name. Threads calls comments
    // "replies" and shares "reposts"; offering "Sort by Shares" above a column headed
    // "Reposts" makes the reader work out that they are the same thing.
  ).map((s) => ({
    ...s,
    label: columns.find((c) => c.key === s.key)?.label ?? s.label,
  }));
  const sortKey = (typeof query.sort === "string" ? query.sort : sorts[0].key) as PostSortKey;
  const kindFilter = typeof query.kind === "string" ? query.kind : "all";

  const color = channelColor(channel.id, channel.color_hue);
  const allDays = getAccountDays(channel.id);
  const counts = getChannelCounts(channel.id);
  const posts = getChannelPosts(channel.id);
  const demographics = getDemographics(channel.id);
  // Ranked across everything synced for this account, not the chart range: a post that
  // did exceptionally well eighteen months ago is still one of the best things here, and
  // curation is a judgement about the content rather than about a reporting window.
  const standouts = standoutsFor(posts, channel.bpp_strong_pct, channel.bpp_broad_pct);
  const libraryPostIds = getLibraryPostIds(channel.id);
  const bppFlags = getBppFlags(ownerId);
  const pool = getBppPool(channel.id, ownerId);
  const standoutsOnly = query.standouts === "1";

  const kpis = buildKpis(allDays, metricList, days);
  const activeKpi = kpis.find((k) => k.key === activeMetric.key);

  const followers = latestMetric(allDays, "followers_count");
  const windowed = densify(windowRows(allDays, days), days);
  const seriesPoints = windowed.map((d) => ({ day: d.day, value: d[activeMetric.key] }));
  // Threads reports no reach at all, so the ribbon falls back to views there — and says
  // so in its own title rather than labelling views as reach.
  const ribbonMetric = channel.platform === "threads" ? "views" : "reach";
  const ribbonMetricLabel = ribbonMetric === "views" ? "visualizações" : "alcance";
  const ribbon = densify(windowRows(allDays, 365), 365).map((d) => ({
    day: d.day,
    value: ribbonMetric === "views" ? d.views : d.reach,
  }));

  const kinds = postKinds(posts);
  const filtered = kindFilter === "all"
    ? posts
    : posts.filter((p) => postKindLabel(p) === kindFilter);
  const shortlist = standoutsOnly
    ? filtered.filter((p) => standouts.get(p.id)?.isCandidate)
    : filtered;
  const ranked = sortPosts(shortlist, sortKey).slice(0, 25);
  const standoutCount = posts.filter((p) => standouts.get(p.id)?.isCandidate).length;

  const withParam = (key: string, value: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ range: rangeKey, metric: metricKey, sort: sortKey, kind: kindFilter, standouts: standoutsOnly ? "1" : "" })) {
      if (v) next.set(k, String(v));
    }
    next.set(key, value);
    return `/insights/${channel.id}?${next.toString()}`;
  };

  const age = sortAgeBuckets(pickDemographics(demographics, "followers", "age"));
  const gender = pickDemographics(demographics, "followers", "gender");
  const countries = topBuckets(pickDemographics(demographics, "followers", "country"), 6);
  const cities = topBuckets(pickDemographics(demographics, "followers", "city"), 6);
  const reachedAge = sortAgeBuckets(pickDemographics(demographics, "reached", "age"));
  const genderTotal = gender.reduce((sum, g) => sum + g.value, 0);
  const gap = GAPS[channel.platform];

  return (
    <div>
      <header className="border-b border-border px-8 py-6">
        <Link href="/insights" className="text-xs text-muted hover:text-ink-soft">
          ← Todas as contas
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <ChannelAvatar
              id={channel.id}
              name={channel.account_name}
              colorHue={channel.color_hue}
              avatarPath={channel.avatar_path}
              size={40}
            />
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
                {channel.account_name}
              </h1>
              <p className="mt-0.5 text-sm text-muted">
                {platformLabel(channel.platform)} ·{" "}
                <span className="data">{exact(followers)}</span> seguidores ·{" "}
                <span className="data">{exact(counts.posts)}</span> posts acompanhados
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-0.5 rounded-lg bg-surface-sunken p-0.5">
              {RANGES.map((r) => (
                <Pill key={r.key} href={withParam("range", r.key)} active={r.key === rangeKey}>
                  {r.label}
                </Pill>
              ))}
            </nav>
            <InsightsRefresh
              channelId={channel.id}
              pending={Boolean(channel.insights_refresh_requested)}
            />
          </div>
        </div>
        {channel.insights_error ? (
          <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-status-failed">
            Última sincronização falhou: {channel.insights_error}
          </p>
        ) : null}
      </header>

      <div className="space-y-6 px-8 py-6">
        {/* Instrument row */}
        <section className="rounded-card border border-border bg-surface">
          <dl className="grid divide-y divide-border sm:grid-cols-3 sm:divide-y-0 sm:divide-x lg:grid-cols-6">
            {kpis.map((kpi) => {
              const delta = formatDelta(kpi.delta);
              const partial =
                kpi.kind === "flow" &&
                kpi.value !== null &&
                kpi.daysWithData < kpi.windowDays;
              return (
                <div key={kpi.key} className="px-5 py-4">
                  <dt className="text-[10px] uppercase tracking-wide text-faint">
                    {kpi.label}
                  </dt>
                  <dd className="data mt-1 text-xl font-semibold leading-none text-ink">
                    {exact(kpi.value)}
                  </dd>
                  <dd className="mt-1.5 text-[11px]">
                    {partial ? (
                      // Say so rather than letting a 2-day sum sit under a 30-day heading.
                      <span className="text-status-publishing">
                        <span className="data">{kpi.daysWithData}</span> de{" "}
                        <span className="data">{kpi.windowDays}</span> dias registrados
                      </span>
                    ) : delta ? (
                      <span
                        className={
                          kpi.delta! > 0 ? "text-status-posted" : "text-status-failed"
                        }
                      >
                        {delta}{" "}
                        <span className="text-faint">vs. {days}d anteriores</span>
                      </span>
                    ) : (
                      <span className="text-faint">sem período anterior</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>

        {/* Signature: every day of the last year, one bar each */}
        <Section
          title={`${ribbonMetricLabel[0].toUpperCase()}${ribbonMetricLabel.slice(1)} diário · último ano`}
          hint={`Uma barra por dia. Lacunas são dias que o worker não registrou, não dias sem ${ribbonMetricLabel}.`}
        >
          <YearRibbon
            points={ribbon}
            color={color.fg}
            label={`${ribbonMetricLabel} diário de ${channel.account_name} no último ano`}
          />
        </Section>

        <Section
          title={`${activeMetric.label} · últimos ${days} dias`}
          hint={
            // A metric with two days of data inside a 90-day window draws as a lone
            // spike, which reads as a broken chart rather than a reporting limit. Say
            // which it is.
            activeKpi && activeKpi.daysWithData < activeKpi.windowDays
              ? `${platformLabel(channel.platform)} só reporta essa métrica para o dia mais recente ou os últimos dois, então o resto desta janela não tem dado pra desenhar.`
              : undefined
          }
          action={
            <nav className="flex flex-wrap items-center gap-0.5">
              {metricList.map((m) => (
                <Pill key={m.key} href={withParam("metric", m.key)} active={m.key === metricKey}>
                  {m.label}
                </Pill>
              ))}
            </nav>
          }
        >
          <TrendChart
            points={seriesPoints}
            color={color.fg}
            label={`${activeMetric.label} nos últimos ${days} dias`}
          />
        </Section>

        {/* Leaderboard */}
        <Section
          title="Melhores publicações"
          hint={
            `${counts.withMetrics} de ${counts.posts} posts têm métricas · ${counts.ours} agendados por aqui · ` +
            `${pool.usable} marcados como BPP para esta conta` +
            (standoutsOnly
              ? " — mostrando posts no top 5% de uma métrica, ou top 10% de duas ou mais"
              : "")
          }
          action={
            <div className="flex flex-wrap items-center gap-3">
              <nav className="flex flex-wrap items-center gap-0.5">
                {sorts.map((s) => (
                  <Pill key={s.key} href={withParam("sort", s.key)} active={s.key === sortKey}>
                    {s.label}
                  </Pill>
                ))}
              </nav>
              <nav className="flex items-center gap-0.5 border-l border-border pl-3">
                <Pill href={withParam("standouts", standoutsOnly ? "" : "1")} active={standoutsOnly}>
                  ★ Destaques ({standoutCount})
                </Pill>
              </nav>
              {kinds.length > 1 ? (
                <nav className="flex flex-wrap items-center gap-0.5 border-l border-border pl-3">
                  <Pill href={withParam("kind", "all")} active={kindFilter === "all"}>
                    Todos
                  </Pill>
                  {kinds.map((k) => (
                    <Pill key={k} href={withParam("kind", k)} active={k === kindFilter}>
                      {k}
                    </Pill>
                  ))}
                </nav>
              ) : null}
            </div>
          }
        >
          <div className="mb-4 rounded-lg border border-border bg-surface-sunken/40 px-3 py-2.5">
            <p className="mb-2 text-[11px] font-medium text-ink-soft">
              Quão seletivas são as sugestões ★ — para esta conta
            </p>
            <BppTolerance
              channelId={channel.id}
              strongPct={channel.bpp_strong_pct}
              broadPct={channel.bpp_broad_pct}
              matched={standoutCount}
              total={posts.length}
            />
          </div>

          {ranked.length === 0 ? (
            <p className="text-sm text-muted">
              Nenhum post sincronizado ainda. O worker espelha os posts da conta no
              próximo ciclo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-faint">
                    <th className="pb-2 font-medium">Publicação</th>
                    {/* The headers ARE the sort control. The pills above do the same job,
                        but clicking a column is where people look for it first. */}
                    {columns.map((c) => (
                      <th key={c.key} className="pb-2 text-right font-medium">
                        <Link
                          href={withParam("sort", c.key)}
                          className={`inline-flex items-center gap-0.5 hover:text-ink-soft ${
                            sortKey === c.key ? "text-brand-strong" : ""
                          }`}
                          aria-sort={sortKey === c.key ? "descending" : "none"}
                        >
                          {c.label}
                          <span aria-hidden className={sortKey === c.key ? "" : "opacity-0"}>
                            ↓
                          </span>
                        </Link>
                      </th>
                    ))}
                    <th className="pb-2 text-right font-medium">
                      <Link
                        href={withParam("sort", "engagement")}
                        className={`inline-flex items-center gap-0.5 hover:text-ink-soft ${
                          sortKey === "engagement" ? "text-brand-strong" : ""
                        }`}
                        aria-sort={sortKey === "engagement" ? "descending" : "none"}
                      >
                        Engajamento
                        <span aria-hidden className={sortKey === "engagement" ? "" : "opacity-0"}>
                          ↓
                        </span>
                      </Link>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ranked.map((post) => (
                    <tr key={post.id} className="align-middle">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-3">
                          {/* Served from OUR cached copy, never hotlinked: the platform's
                              thumbnail URLs are short-lived signed CDN links, so linking
                              them directly turns this column into broken images within
                              weeks. Nothing cached yet (or a link that expired before the
                              worker reached it) falls back to a plain tinted square — the
                              kind is already named by the badge beside it. */}
                          <span
                            className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface-sunken"
                            aria-hidden
                          >
                            {post.thumbnail_path ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/insights/media/${post.id}/thumbnail`}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : null}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-muted">
                                {postKindLabel(post)}
                              </span>
                              {post.publication_id ? (
                                <span className="rounded bg-brand-weak px-1.5 py-0.5 text-[10px] font-medium text-brand-strong">
                                  agendado por aqui
                                </span>
                              ) : null}
                              <span className="data text-[11px] text-faint">
                                {post.published_at ? post.published_at.slice(0, 10) : "—"}
                              </span>
                              {/* Names the metrics it led on, not a score — "saved far
                                  more than usual" is something you can act on. */}
                              {standouts.get(post.id)?.isCandidate ? (
                                <span
                                  className="rounded bg-accent-weak px-1.5 py-0.5 text-[10px] font-medium text-accent-strong"
                                  title="Se destaca em relação à própria média desta conta"
                                >
                                  {standouts.get(post.id)!.reason}
                                </span>
                              ) : null}
                              <BppMark
                                postId={libraryPostIds[post.id] ?? null}
                                initial={Boolean(bppFlags[libraryPostIds[post.id]])}
                                compact
                              />
                            </div>
                            <p className="mt-0.5 max-w-md truncate text-[13px] text-ink-soft">
                              {post.permalink ? (
                                <a
                                  href={post.permalink}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="hover:underline"
                                >
                                  {post.caption?.trim().split("\n")[0] || "Sem legenda"}
                                </a>
                              ) : (
                                post.caption?.trim().split("\n")[0] || "Sem legenda"
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      {columns.map((c, i) => (
                        <td
                          key={c.key}
                          className={`data py-2.5 text-right ${
                            i === 0 ? "text-ink" : "text-ink-soft"
                          }`}
                        >
                          {exact(post[c.key])}
                        </td>
                      ))}
                      <td className="data py-2.5 text-right font-medium text-ink">
                        {exact(engagementOf(post))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Audience */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section
            title="Público"
            hint={
              age.length || gender.length
                ? "Quem segue esta conta, como a plataforma reporta"
                : undefined
            }
          >
            {age.length === 0 && gender.length === 0 ? (
              <p className="text-sm text-muted">
                Nenhum dado demográfico ainda. As plataformas só liberam esses dados
                quando a conta passa de cerca de 100 seguidores, e atualizam uma vez por
                dia.
              </p>
            ) : (
              <div className="space-y-5">
                {gender.length > 0 ? (
                  <div>
                    <h3 className="mb-2 text-[11px] uppercase tracking-wide text-faint">
                      Gênero
                    </h3>
                    <div className="flex h-2 overflow-hidden rounded-full bg-surface-sunken">
                      {gender.map((g, i) => (
                        <div
                          key={g.dimension}
                          style={{
                            width: `${genderTotal ? (g.value / genderTotal) * 100 : 0}%`,
                            backgroundColor: color.fg,
                            opacity: 1 - i * 0.3,
                          }}
                          title={`${GENDER_LABELS[g.dimension] ?? g.dimension}: ${g.value.toLocaleString()}`}
                        />
                      ))}
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                      {gender.map((g, i) => (
                        <li key={g.dimension} className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: color.fg, opacity: 1 - i * 0.3 }}
                            aria-hidden
                          />
                          {GENDER_LABELS[g.dimension] ?? g.dimension}
                          <span className="data text-ink-soft">
                            {genderTotal ? Math.round((g.value / genderTotal) * 100) : 0}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {age.length > 0 ? (
                  <div>
                    <h3 className="mb-2 text-[11px] uppercase tracking-wide text-faint">
                      Idade
                    </h3>
                    <HBarList
                      rows={topBuckets(age, 10).buckets.sort(
                        (a, b) => parseInt(a.dimension, 10) - parseInt(b.dimension, 10),
                      )}
                      color={color.fg}
                      formatValue={(v) => compact(v) ?? ""}
                    />
                  </div>
                ) : null}

                {reachedAge.length > 0 ? (
                  <p className="border-t border-border pt-3 text-[11px] text-muted">
                    Quem esta conta <em>alcançou</em> tem um perfil diferente de quem a
                    segue — compare com a divisão do público alcançado que o worker
                    também guarda.
                  </p>
                ) : null}
              </div>
            )}
          </Section>

          <Section title="Onde estão">
            {countries.buckets.length === 0 ? (
              <p className="text-sm text-muted">Nenhum dado de localização ainda.</p>
            ) : (
              <div className="space-y-5">
                <div>
                  <h3 className="mb-2 text-[11px] uppercase tracking-wide text-faint">
                    Países
                  </h3>
                  <HBarList
                    rows={countries.buckets}
                    color={color.fg}
                    formatValue={(v) => compact(v) ?? ""}
                  />
                  {countries.remainder > 0 ? (
                    <p className="mt-2 text-[11px] text-faint">
                      <span className="data">{compact(countries.remainder)}</span> a mais
                      em outros países
                    </p>
                  ) : null}
                </div>
                <div>
                  <h3 className="mb-2 text-[11px] uppercase tracking-wide text-faint">
                    Cidades
                  </h3>
                  <HBarList
                    rows={cities.buckets}
                    color={color.fg}
                    formatValue={(v) => compact(v) ?? ""}
                  />
                </div>
              </div>
            )}
          </Section>
        </div>

        <Section
          title="Quando esta conta performa melhor"
          hint="Engajamento médio por horário, calculado a partir dos próprios posts desta conta — não é uma recomendação da plataforma"
        >
          <HeatGrid
            cells={bestTimeGrid(posts, channel.timezone)}
            color={color.fg}
            timeZoneLabel={tzAbbrev(channel.timezone)}
          />
        </Section>

        {gap ? (
          <p className="rounded-card border border-dashed border-border px-5 py-3 text-xs text-muted">
            <span className="font-medium text-ink-soft">O que {platformLabel(channel.platform)} não reporta:</span>{" "}
            {gap}
          </p>
        ) : null}
      </div>
    </div>
  );
}
