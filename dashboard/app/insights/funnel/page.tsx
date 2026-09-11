import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { FunnelChart } from "@/components/charts";
import { getStoryPublications } from "@/lib/insights-queries";
import { buildStoryFunnel, RANGES, rangeDays } from "@/lib/insights";
import { channelColor } from "@/lib/format";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/*
  Aggregate funnel for Stories THIS install published: publicado -> visualizado -> toque
  -> clique no link -> resposta.

  Scoped to our own publications (surface = 'story'), not the account-wide media sync —
  see getStoryPublications for why a Story leaves nothing else to aggregate from. The
  "toque" and "clique no link" steps come from Instagram's `navigation` breakdown metric,
  which this app has only ever observed reporting zeros on a real Story (see
  parseStoryNavigation's header comment) — so those two steps are the ones most likely to
  read "não disponível" until more Stories with real traffic have been published and
  synced.
*/

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

export default async function StoryFunnelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const viewer = await getSessionUser();
  const ownerId = viewer && !viewer.is_admin ? viewer.id : null;
  const all = getStoryPublications(500, ownerId);

  const channels = [...new Map(
    all.map((r) => [r.channel_id, {
      id: r.channel_id, name: r.account_name, colorHue: r.color_hue,
    }]),
  ).values()];

  const channelFilter = typeof query.channel === "string" ? Number(query.channel) : null;
  const rangeKey = typeof query.range === "string" ? query.range : "30d";
  const days = rangeDays(rangeKey);
  const cutoff = Date.now() - days * 86_400_000;

  const scoped = all.filter((r) => {
    if (channelFilter && r.channel_id !== channelFilter) return false;
    if (!r.published_at) return false;
    return new Date(r.published_at).getTime() >= cutoff;
  });

  const withParam = (key: string, value: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ channel: channelFilter ? String(channelFilter) : "", range: rangeKey })) {
      if (v) next.set(k, String(v));
    }
    if (value) next.set(key, value);
    else next.delete(key);
    return `/insights/funnel?${next.toString()}`;
  };

  const funnel = buildStoryFunnel(scoped);
  const color = channelFilter
    ? channelColor(channelFilter, channels.find((c) => c.id === channelFilter)?.colorHue ?? null)
    : channelColor(0, null);

  return (
    <div>
      <PageHeader
        title="Funil de Stories"
        subtitle="Do story publicado até a resposta — para onde as visualizações vão."
      />

      <div className="px-8 py-6 space-y-6">
        {all.length === 0 ? (
          <EmptyState title="Nenhum story publicado por aqui ainda">
            Publique um story em{" "}
            <Link href="/stories" className="text-brand-strong underline">
              Stories
            </Link>{" "}
            — o funil aparece assim que o worker sincronizar as métricas.
          </EmptyState>
        ) : (
          <>
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
              <nav className="flex items-center gap-0.5 rounded-lg bg-surface-sunken p-0.5">
                {RANGES.map((r) => (
                  <Pill key={r.key} href={withParam("range", r.key)} active={r.key === rangeKey}>
                    {r.label}
                  </Pill>
                ))}
              </nav>
            </div>

            <section className="rounded-card border border-border bg-surface px-5 py-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
                  {scoped.length} {scoped.length === 1 ? "story" : "stories"} no período
                </h2>
              </div>
              <FunnelChart
                steps={funnel}
                color={color.fg}
                label={`Funil de stories: ${funnel.map((s) => `${s.label} ${s.value ?? "não disponível"}`).join(", ")}`}
              />
              <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted">
                <span className="font-medium text-ink-soft">Toque</span> soma os toques de
                avançar, voltar e sair do story.{" "}
                <span className="font-medium text-ink-soft">Clique no link</span> é o toque
                num link/sticker (métrica <code className="data">navigation</code> do
                Instagram). Quando um passo mostra &ldquo;não disponível&rdquo;, a
                plataforma ainda não reportou esse número para nenhum story do período —
                não é um zero real.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
