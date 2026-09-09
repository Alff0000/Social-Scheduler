import Link from "next/link";
import {
  blockedPublicationIds,
  getActiveChannels,
  getPublicationsOverview,
  getWorkerStatus,
  type PublicationRow,
} from "@/lib/queries";
import { ChannelAvatar, EmptyState, PageHeader } from "@/components/ui";
import { WorkerStatus } from "@/components/worker-status";
import { platformBadge } from "@/lib/platforms";
import { exact } from "@/lib/insights";

export const dynamic = "force-dynamic";

/*
  A consolidated, READ-ONLY health check on the send queue — deliberately separate from
  "/" (Visão geral / Dashboard), which is the editable working queue (quick-edit, filters,
  retry buttons). This page answers one question fast: is anything broken right now, and
  where. Every fix action still happens on the dashboard; this only points at what needs
  one.
*/

function statCard(label: string, value: number, tone: "ok" | "pending" | "error" | "progress") {
  const toneClass = {
    ok: "text-status-posted",
    pending: "text-status-scheduled",
    error: "text-status-failed",
    progress: "text-status-publishing",
  }[tone];
  return (
    <div key={label} className="rounded-card border border-border bg-surface px-5 py-4">
      <dt className="text-[10px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`data mt-1 text-2xl font-semibold leading-none ${toneClass}`}>
        {exact(value)}
      </dd>
    </div>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(Math.abs(ms) / 60000);
  const future = ms < 0;
  const unit =
    minutes < 60
      ? `${minutes}m`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h`
        : `${Math.floor(minutes / 1440)}d`;
  return future ? `em ${unit}` : `há ${unit}`;
}

export default function QueueStatusPage() {
  const channels = getActiveChannels();
  const pubs = getPublicationsOverview();
  const worker = getWorkerStatus();
  const blocked = new Set(blockedPublicationIds(pubs));

  const isError = (p: PublicationRow) => p.status === "failed" || blocked.has(p.id);
  const isProgress = (p: PublicationRow) => p.status === "publishing";
  const isPending = (p: PublicationRow) =>
    (p.status === "scheduled" || p.status === "pending_approval") && !blocked.has(p.id);
  const isOk = (p: PublicationRow) => p.status === "posted";

  const counts = {
    ok: pubs.filter(isOk).length,
    pending: pubs.filter(isPending).length,
    error: pubs.filter(isError).length,
    progress: pubs.filter(isProgress).length,
  };

  const perChannel = channels.map((c) => {
    const own = pubs.filter((p) => p.channel_id === c.id);
    const pending = own.filter(isPending);
    const nextAt = pending
      .map((p) => p.scheduled_at)
      .sort()
      .at(0);
    const lastPosted = own
      .filter(isOk)
      .map((p) => p.published_at)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1);
    return {
      channel: c,
      pending: pending.length,
      error: own.filter(isError).length,
      progress: own.filter(isProgress).length,
      nextAt: nextAt ?? null,
      lastPosted: lastPosted ?? null,
    };
  });

  const attention = pubs
    .filter(isError)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .slice(0, 15);

  return (
    <div>
      <PageHeader
        title="Status da Fila"
        subtitle="Visão consolidada de ok, pendentes, erros e em progresso — separada da tela de composição."
        action={<WorkerStatus online={worker.online} lastSeenAt={worker.lastSeenAt} />}
      />

      <div className="px-8 py-6 space-y-8">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statCard("Ok (postado)", counts.ok, "ok")}
          {statCard("Pendentes", counts.pending, "pending")}
          {statCard("Erros", counts.error, "error")}
          {statCard("Em progresso", counts.progress, "progress")}
        </dl>

        {channels.length === 0 ? (
          <EmptyState title="Nenhuma conta conectada">
            Conecte uma conta em{" "}
            <Link href="/channels" className="text-brand-strong underline">
              Contas
            </Link>{" "}
            para começar a agendar.
          </EmptyState>
        ) : (
          <section className="rounded-card border border-border bg-surface">
            <div className="border-b border-border px-5 py-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
                Por conta
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-faint">
                    <th className="px-5 py-2 font-medium">Conta</th>
                    <th className="py-2 text-right font-medium">Pendentes</th>
                    <th className="py-2 text-right font-medium">Erros</th>
                    <th className="py-2 text-right font-medium">Progresso</th>
                    <th className="py-2 text-right font-medium">Próximo</th>
                    <th className="px-5 py-2 text-right font-medium">Último postado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {perChannel.map((row) => (
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
                      <td className="data py-2.5 text-right text-ink-soft">{row.pending}</td>
                      <td
                        className={`data py-2.5 text-right ${
                          row.error > 0 ? "font-medium text-status-failed" : "text-ink-soft"
                        }`}
                      >
                        {row.error}
                      </td>
                      <td className="data py-2.5 text-right text-ink-soft">{row.progress}</td>
                      <td className="data py-2.5 text-right text-ink-soft">
                        {timeAgo(row.nextAt)}
                      </td>
                      <td className="data px-5 py-2.5 text-right text-ink-soft">
                        {timeAgo(row.lastPosted)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="rounded-card border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
              Precisa de atenção
            </h2>
            <Link href="/" className="text-xs text-brand-strong hover:underline">
              Resolver na Visão Geral →
            </Link>
          </div>
          {attention.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Nada travado ou com erro agora.</p>
          ) : (
            <ul className="divide-y divide-border">
              {attention.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <ChannelAvatar
                    id={p.channel_id}
                    name={p.channel_name}
                    colorHue={p.channel_color_hue}
                    avatarPath={p.channel_avatar_path}
                    size={20}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">
                      {p.channel_name}{" "}
                      <span className="text-[10px] uppercase tracking-wide text-faint">
                        {platformBadge(p.channel_platform)}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {p.last_error ?? (blocked.has(p.id) ? "Travado — vai tentar de novo" : "Falhou")}
                    </p>
                  </div>
                  <span className="data shrink-0 text-xs text-faint">
                    {timeAgo(p.scheduled_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
