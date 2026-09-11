import Link from "next/link";
import {
  blockedPublicationIds,
  getActiveChannels,
  getLatestPublishLimits,
  getPublicationsOverview,
} from "@/lib/queries";
import { ChannelAvatar, EmptyState, PageHeader } from "@/components/ui";
import { platformBadge } from "@/lib/platforms";
import { formatInTz } from "@/lib/format";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/*
  Controle — pace, not editing. For each account: how fast its pending queue is actually
  moving, and when it runs out. Both numbers are read straight from real scheduled data,
  never a projection — "average gap between pending sends" and "the last pending send's
  own time" are facts about what is already scheduled, not a forecast that could be wrong.

  Quota comes from publish_limits, which the worker only ever writes AFTER a real publish
  (worker/publisher.py, via the platform's own content_publishing_limit / threads_
  publishing_limit endpoint). A channel that has only ever dry-run published, or whose
  platform has no such endpoint (Facebook Pages, Discord, Telegram, TikTok — see
  worker/preflight.py's per-platform checks), has no row here. That is reported as "sem
  dado", never as a fabricated 0/0.
*/

function paceLabel(gapsMs: number[]): string {
  if (gapsMs.length === 0) return "—";
  const avgMs = gapsMs.reduce((a, b) => a + b, 0) / gapsMs.length;
  const hours = avgMs / 3_600_000;
  if (hours < 1) return `~1 a cada ${Math.max(1, Math.round(avgMs / 60_000))}min`;
  if (hours < 48) return `~1 a cada ${Math.round(hours)}h`;
  return `~1 a cada ${Math.round(hours / 24)}d`;
}

export default async function QueueControlPage() {
  const viewer = await getSessionUser();
  const ownerId = viewer && !viewer.is_admin ? viewer.id : null;
  const channels = getActiveChannels(ownerId);
  const pubs = getPublicationsOverview(200, ownerId);
  const blocked = new Set(blockedPublicationIds(pubs));
  const limits = getLatestPublishLimits();

  const isPending = (p: (typeof pubs)[number]) =>
    (p.status === "scheduled" || p.status === "pending_approval") && !blocked.has(p.id);

  const rows = channels.map((c) => {
    const pending = pubs
      .filter((p) => p.channel_id === c.id && isPending(p))
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

    const gaps: number[] = [];
    for (let i = 1; i < pending.length; i += 1) {
      const gap =
        new Date(pending[i].scheduled_at).getTime() -
        new Date(pending[i - 1].scheduled_at).getTime();
      if (Number.isFinite(gap) && gap > 0) gaps.push(gap);
    }

    const limit = limits[c.id];
    return {
      channel: c,
      queueDepth: pending.length,
      pace: paceLabel(gaps),
      finishesAt: pending.at(-1)?.scheduled_at ?? null,
      limit,
    };
  });

  return (
    <div>
      <PageHeader
        title="Controle"
        subtitle="Ritmo de postagem por conta e horário estimado de término da fila."
      />
      <div className="px-8 py-6">
        {channels.length === 0 ? (
          <EmptyState title="Nenhuma conta conectada">
            Conecte uma conta em{" "}
            <Link href="/channels" className="text-brand-strong underline">
              Contas
            </Link>
            .
          </EmptyState>
        ) : (
          <section className="rounded-card border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-faint">
                    <th className="px-5 py-2 font-medium">Conta</th>
                    <th className="py-2 text-right font-medium">Na fila</th>
                    <th className="py-2 text-right font-medium">Ritmo</th>
                    <th className="py-2 text-right font-medium">Termina em</th>
                    <th className="px-5 py-2 text-right font-medium">Cota da plataforma</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => {
                    const l = row.limit;
                    const quotaPct =
                      l && l.quota_total ? Math.min(100, ((l.quota_usage ?? 0) / l.quota_total) * 100) : null;
                    const windowHours = l?.quota_duration ? Math.round(l.quota_duration / 3600) : null;
                    return (
                      <tr key={row.channel.id}>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <ChannelAvatar
                              id={row.channel.id}
                              name={row.channel.account_name}
                              colorHue={row.channel.color_hue}
                              avatarPath={row.channel.avatar_path}
                              size={20}
                            />
                            <span className="text-ink">{row.channel.account_name}</span>
                            <span className="text-[10px] uppercase tracking-wide text-faint">
                              {platformBadge(row.channel.platform)}
                            </span>
                          </div>
                        </td>
                        <td className="data py-2.5 text-right text-ink-soft">{row.queueDepth}</td>
                        <td className="data py-2.5 text-right text-ink-soft">{row.pace}</td>
                        <td className="data py-2.5 text-right text-ink-soft">
                          {row.finishesAt ? formatInTz(row.finishesAt, row.channel.timezone) : "—"}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          {quotaPct === null ? (
                            <span className="text-xs text-faint">sem dado</span>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              <span className="data text-xs text-ink-soft">
                                {l!.quota_usage ?? 0}/{l!.quota_total}
                                {windowHours ? ` em ${windowHours}h` : ""}
                              </span>
                              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken">
                                <span
                                  className="block h-full rounded-full"
                                  style={{
                                    width: `${quotaPct}%`,
                                    backgroundColor:
                                      quotaPct > 80
                                        ? "var(--color-status-failed)"
                                        : "var(--color-status-posted)",
                                  }}
                                />
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border px-5 py-3 text-[11px] text-muted">
              Ritmo é a média de intervalo entre os envios pendentes já agendados — não uma
              meta. Cota vem direto da plataforma (lida após cada publicação real); contas
              só em dry-run ou sem endpoint de cota (Facebook, Discord, Telegram, TikTok)
              mostram &ldquo;sem dado&rdquo;.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
