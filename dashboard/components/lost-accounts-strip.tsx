import type { RemovedChannelCount } from "@/lib/queries";

/**
 * The red "contas perdidas" counter shown with the folders on /channels.
 *
 * It reads the log of removed accounts, not the channels table, because the worker deletes
 * a fallen account after a day (worker/lost_channels.py) — by then there is no card left to
 * count, and this strip is what says how many there were. Rendered even when no card is
 * left in a folder, which is why it is its own strip and not only a badge on the folder
 * heading: a folder whose accounts all fell has no heading at all.
 */
export function LostAccountsStrip({
  counts,
  folders,
}: {
  counts: RemovedChannelCount[];
  folders: { id: number; name: string }[];
}) {
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  if (total === 0) return null;
  const nameOf = (id: number | null) =>
    (id !== null ? folders.find((f) => f.id === id)?.name : undefined) ?? "Sem pasta";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-status-failed/40 bg-status-failed/10 px-4 py-3">
      <span className="text-sm font-semibold text-status-failed">
        {total} conta{total === 1 ? "" : "s"} perdida{total === 1 ? "" : "s"}
      </span>
      <span className="text-xs text-muted">removida{total === 1 ? "" : "s"} da plataforma</span>
      {counts.map((c) => (
        <span
          key={c.folder_id ?? "none"}
          className="rounded-full bg-status-failed px-2.5 py-0.5 text-xs font-semibold text-white"
        >
          {nameOf(c.folder_id)} · {c.count}
        </span>
      ))}
    </div>
  );
}
