import Link from "next/link";
import { EmptyState, PageHeader, ChannelAvatar } from "@/components/ui";
import { getReelPosts, type ReelRow } from "@/lib/insights-queries";
import { compact, engagementOf, exact, sortPosts, type PostSortKey } from "@/lib/insights";
import { channelColor } from "@/lib/format";

export const dynamic = "force-dynamic";

/*
  Cross-account Reels leaderboard.

  /insights/[id]'s "Top content" table already ranks every post for ONE account, Reels
  included. This page answers a different question — "how are Reels doing, across every
  account, side by side" — which is why it exists separately rather than adding a Reels
  filter there: a cross-account table needs a channel column and channel filter that the
  single-account page has no use for.
*/

const SORTS: { key: PostSortKey; label: string }[] = [
  { key: "impressions", label: "Visualizações" },
  { key: "likes", label: "Curtidas" },
  { key: "comments", label: "Comentários" },
  { key: "published_at", label: "Mais recentes" },
];

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

function sumOf(reels: ReelRow[], key: "impressions" | "likes" | "comments"): number | null {
  const present = reels.map((r) => r[key]).filter((v): v is number => v !== null && v !== undefined);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

export default async function ReelsInsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const allReels = getReelPosts();

  const channels = [...new Map(
    allReels.map((r) => [r.channel_id, {
      id: r.channel_id, name: r.account_name, colorHue: r.color_hue, avatarPath: r.avatar_path,
    }]),
  ).values()];

  const channelFilter = typeof query.channel === "string" ? Number(query.channel) : null;
  const sortKey = (typeof query.sort === "string" ? query.sort : SORTS[0].key) as PostSortKey;

  const scoped = channelFilter
    ? allReels.filter((r) => r.channel_id === channelFilter)
    : allReels;
  const ranked = sortPosts(scoped, sortKey).slice(0, 100);

  const withParam = (key: string, value: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ channel: channelFilter ? String(channelFilter) : "", sort: sortKey })) {
      if (v) next.set(k, String(v));
    }
    if (value) next.set(key, value);
    else next.delete(key);
    return `/insights/reels?${next.toString()}`;
  };

  const totals = {
    count: scoped.length,
    views: sumOf(scoped, "impressions"),
    likes: sumOf(scoped, "likes"),
    comments: sumOf(scoped, "comments"),
  };

  return (
    <div>
      <PageHeader
        title="Métricas de Reels"
        subtitle="Desempenho individual de cada Reel publicado, em todas as contas — views, curtidas e comentários."
      />

      <div className="px-8 py-6 space-y-6">
        {allReels.length === 0 ? (
          <EmptyState title="Nenhum Reel sincronizado ainda">
            Assim que o worker sincronizar os posts das contas conectadas, os Reels
            publicados aparecem aqui automaticamente.
          </EmptyState>
        ) : (
          <>
            <section className="rounded-card border border-border bg-surface">
              <dl className="grid grid-cols-2 divide-y divide-border sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
                {[
                  { label: "Reels", value: exact(totals.count) },
                  { label: "Visualizações", value: compact(totals.views) },
                  { label: "Curtidas", value: compact(totals.likes) },
                  { label: "Comentários", value: compact(totals.comments) },
                ].map((k) => (
                  <div key={k.label} className="px-5 py-4">
                    <dt className="text-[10px] uppercase tracking-wide text-faint">{k.label}</dt>
                    <dd className="data mt-1 text-xl font-semibold leading-none text-ink">
                      {k.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav className="flex flex-wrap items-center gap-0.5 rounded-lg bg-surface-sunken p-0.5">
                <Pill href={withParam("channel", "")} active={channelFilter === null}>
                  Todas as contas
                </Pill>
                {channels.map((c) => (
                  <Pill key={c.id} href={withParam("channel", String(c.id))} active={channelFilter === c.id}>
                    {c.name}
                  </Pill>
                ))}
              </nav>
              <nav className="flex flex-wrap items-center gap-0.5">
                {SORTS.map((s) => (
                  <Pill key={s.key} href={withParam("sort", s.key)} active={s.key === sortKey}>
                    {s.label}
                  </Pill>
                ))}
              </nav>
            </div>

            <section className="rounded-card border border-border bg-surface">
              {ranked.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted">
                  Nenhum Reel encontrado para esse filtro.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-faint">
                        <th className="px-5 pb-2 pt-3 font-medium">Reel</th>
                        <th className="pb-2 pt-3 text-right font-medium">Visualizações</th>
                        <th className="pb-2 pt-3 text-right font-medium">Curtidas</th>
                        <th className="pb-2 pt-3 text-right font-medium">Comentários</th>
                        <th className="px-5 pb-2 pt-3 text-right font-medium">Engajamento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {ranked.map((reel) => {
                        const color = channelColor(reel.channel_id, reel.color_hue);
                        return (
                          <tr key={reel.id} className="align-middle">
                            <td className="py-2.5 pl-5 pr-4">
                              <div className="flex items-center gap-3">
                                <span
                                  className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-surface-sunken"
                                  aria-hidden
                                >
                                  {reel.thumbnail_path ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={`/api/insights/media/${reel.id}/thumbnail`}
                                      alt=""
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : null}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <ChannelAvatar
                                      id={reel.channel_id}
                                      name={reel.account_name}
                                      colorHue={reel.color_hue}
                                      avatarPath={reel.avatar_path}
                                      size={16}
                                    />
                                    <span
                                      className="text-[11px] font-medium"
                                      style={{ color: color.fg }}
                                    >
                                      {reel.account_name}
                                    </span>
                                    <span className="data text-[11px] text-faint">
                                      {reel.published_at ? reel.published_at.slice(0, 10) : "—"}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 max-w-md truncate text-[13px] text-ink-soft">
                                    {reel.permalink ? (
                                      <a
                                        href={reel.permalink}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="hover:underline"
                                      >
                                        {reel.caption?.trim().split("\n")[0] || "Sem legenda"}
                                      </a>
                                    ) : (
                                      reel.caption?.trim().split("\n")[0] || "Sem legenda"
                                    )}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="data py-2.5 text-right text-ink">
                              {exact(reel.impressions)}
                            </td>
                            <td className="data py-2.5 text-right text-ink-soft">
                              {exact(reel.likes)}
                            </td>
                            <td className="data py-2.5 text-right text-ink-soft">
                              {exact(reel.comments)}
                            </td>
                            <td className="data py-2.5 pr-5 text-right font-medium text-ink">
                              {exact(engagementOf(reel))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
