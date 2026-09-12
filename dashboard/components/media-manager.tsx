"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { humanBytes, videoPreviewSrc } from "@/lib/format";
import { truncateChars } from "@/lib/truncate";
import { DownloadMediaButton } from "@/components/download-media-button";
import { MediaBadge, MediaLightbox, type LightboxAsset } from "@/components/media-lightbox";
import type { AssetWithUsage } from "@/lib/queries";
import { useToast } from "@/components/toast";

type SortOrder = "newest" | "oldest" | "largest" | "unused_first";

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Mais recente" },
  { value: "oldest", label: "Mais antigo" },
  { value: "largest", label: "Maior tamanho" },
  { value: "unused_first", label: "Sem uso primeiro" },
];

function isUnused(a: AssetWithUsage): boolean {
  return a.post_count === 0 && a.cover_use_count === 0;
}

// How many linked posts to show before collapsing the rest behind "+N more". Two keeps a
// heavily-reused asset's card the same height as everyone else's; evergreen media on this
// install is reused freely, so "a few" is the normal case rather than the exception.
const INLINE_POSTS = 2;

/**
 * What to call a post on a media card.
 *
 * The caption's FIRST LINE, not the id: "post #47" gives nothing to recognise a post by, so
 * the one working link still had to be opened to find out whether it was the right one.
 *
 * truncateChars, never slice: captions here are mostly emoji, and cutting inside a surrogate
 * pair sends a lone surrogate that fails hydration for the WHOLE page, not just this label.
 */
export function postLabel(caption: string | null, postId: number): string {
  const firstLine = (caption ?? "").trim().split("\n")[0].trim();
  return firstLine ? truncateChars(firstLine, 42) : `post #${postId}`;
}

function durationLabel(ms: number | null): string | null {
  if (!ms) return null;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function MediaManager({ assets }: { assets: AssetWithUsage[] }) {
  const [openMedia, setOpenMedia] = useState<{ asset: LightboxAsset; label: string } | null>(
    null
  );
  // Which cards have had their "+N more" opened. Per asset, so expanding one heavily-reused
  // file does not push every other card down the page.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const router = useRouter();
  const [pending, startT] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const { showToast } = useToast();

  async function remove(a: AssetWithUsage) {
    const name = a.original_filename ?? `Asset ${a.id}`;
    if (
      !confirm(
        `Excluir "${name}" (${humanBytes(a.byte_size)})?\n\n` +
          `O arquivo é removido do disco permanentemente. Isso não pode ser desfeito.`
      )
    )
      return;
    setError(null);
    setBusyId(a.id);
    try {
      const res = await fetch(`/api/assets/${a.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Não foi possível excluir esse arquivo.");
        return;
      }
      showToast(`"${name}" excluído.`);
      startT(() => router.refresh());
    } catch {
      setError("Não foi possível conectar ao servidor. O dashboard ainda está rodando?");
    } finally {
      setBusyId(null);
    }
  }

  const summary = useMemo(() => {
    // "Unused" has to mean "nothing at all references this", not "no post references this".
    // A Reels cover (assets.cover_asset_id) has no post_assets row but IS referenced, and
    // deleteAsset() refuses it — counting its bytes here would promise space that cannot be
    // reclaimed. Any future reference to an asset belongs in this condition too.
    const unused = assets.filter(isUnused);
    const bytes = (list: AssetWithUsage[]) =>
      list.reduce((sum, a) => sum + (a.byte_size ?? 0), 0);
    return {
      count: assets.length,
      total: bytes(assets),
      unusedCount: unused.length,
      unusedBytes: bytes(unused),
    };
  }, [assets]);

  // Search + sort happen here, client-side, over the one full list the page already
  // fetched — this store is small enough (everything the install has ever uploaded) that
  // a second server round trip per keystroke would be pure overhead for no real benefit.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? assets.filter((a) => (a.original_filename ?? `asset ${a.id}`).toLowerCase().includes(q))
      : assets;
    const sorted = [...filtered];
    switch (sortOrder) {
      case "oldest":
        sorted.sort((x, y) => x.created_at.localeCompare(y.created_at));
        break;
      case "largest":
        sorted.sort((x, y) => (y.byte_size ?? 0) - (x.byte_size ?? 0));
        break;
      case "unused_first":
        // Stable sort: ties (both unused, or both in use) keep the newest-first order
        // listAssetsWithUsage already returned, rather than re-shuffling them.
        sorted.sort((x, y) => Number(isUnused(y)) - Number(isUnused(x)));
        break;
      case "newest":
      default:
        sorted.sort((x, y) => y.created_at.localeCompare(x.created_at));
    }
    return sorted;
  }, [assets, search, sortOrder]);

  const selectableShown = shown.filter(isUnused);
  const allShownSelected =
    selectableShown.length > 0 && selectableShown.every((a) => selectedIds.has(a.id));

  function toggleSelected(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allShownSelected) {
        selectableShown.forEach((a) => next.delete(a.id));
      } else {
        selectableShown.forEach((a) => next.add(a.id));
      }
      return next;
    });
  }

  async function bulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Excluir ${ids.length} arquivo${ids.length === 1 ? "" : "s"} sem uso? Removidos do disco permanentemente — isso não pode ser desfeito.`,
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    setError(null);
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/assets/${id}`, { method: "DELETE" })
          .then((r) => r.ok)
          .catch(() => false),
      ),
    );
    setBulkDeleting(false);
    const failed = results.filter((ok) => !ok).length;
    if (failed > 0) {
      setError(`${failed} de ${ids.length} não puderam ser excluídos.`);
    } else {
      showToast(`${ids.length} arquivo${ids.length === 1 ? "" : "s"} excluído${ids.length === 1 ? "" : "s"}.`);
    }
    setSelectedIds(new Set());
    startT(() => router.refresh());
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-faint">
          {summary.count} {summary.count === 1 ? "item" : "itens"} · {humanBytes(summary.total)}
          {summary.unusedCount > 0 ? (
            <>
              {" "}
              · {summary.unusedCount} sem uso ({humanBytes(summary.unusedBytes)})
            </>
          ) : null}
        </p>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome do arquivo…"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-faint focus:border-brand"
        />
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:border-brand"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {selectableShown.length > 0 ? (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-soft">
            <input type="checkbox" checked={allShownSelected} onChange={toggleSelectAll} />
            Selecionar tudo sem uso
          </label>
        ) : null}
        {selectedIds.size > 0 ? (
          <button
            type="button"
            onClick={bulkDelete}
            disabled={bulkDeleting}
            className={`rounded-md border border-status-failed/40 px-3 py-1.5 text-xs font-medium text-status-failed hover:bg-surface-sunken disabled:opacity-50 ${selectableShown.length > 0 ? "" : "ml-auto"}`}
          >
            {bulkDeleting ? "Excluindo…" : `Excluir ${selectedIds.size} selecionado${selectedIds.size === 1 ? "" : "s"}`}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mb-4 rounded-lg bg-accent-weak px-3 py-2 text-sm text-accent-strong">
          {error}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong bg-surface/60 px-6 py-12 text-center text-sm text-muted">
          Nenhum arquivo corresponde a essa busca.
        </p>
      ) : (
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((a) => {
          const name = a.original_filename ?? `Asset ${a.id}`;
          const inPost = a.post_count > 0;
          const isCover = a.cover_use_count > 0;
          const isExpanded = expanded.has(a.id);
          // Plain words, because this line is the whole explanation of why a file has no
          // Delete button. A cover is attached to a VIDEO, not to a post, so "in post #N"
          // would be a lie — and the post link would point at nothing.
          //
          // Two spellings rather than one lowercased at the call site: "Reels" is a proper
          // noun and .toLowerCase() rendered it as "a reels cover".
          const coverTail = a.cover_use_count > 1 ? ` (${a.cover_use_count} vídeos)` : "";
          const coverLabel = `Usado como capa de Reels${coverTail}`;
          const coverAlso = `também usado como capa de Reels${coverTail}`;
          return (
            <li
              key={a.id}
              className="overflow-hidden rounded-card border border-border bg-surface"
            >
              <div className="relative aspect-square bg-surface-sunken">
                {a.media_kind === "video" ? (
                  // No thumbnail file exists for video (no ffmpeg dependency by design) —
                  // render the real file with preload="metadata" so the browser decodes
                  // just one frame. Same approach as library-view.tsx.
                  <video
                    src={videoPreviewSrc(a.id, a.cover_frame_ms)}
                    preload="metadata"
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/media/${a.id}?variant=thumb`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
                <DownloadMediaButton assetId={a.id} label={name} variant="overlay" />
                <MediaBadge
                  mediaKind={a.media_kind}
                  label={name}
                  onOpen={() =>
                    setOpenMedia({
                      label: name,
                      asset: {
                        id: a.id,
                        media_kind: a.media_kind,
                        cover_frame_ms: a.cover_frame_ms,
                        width: a.width,
                        height: a.height,
                      },
                    })
                  }
                />
              </div>

              <div className="space-y-1 p-3">
                <p className="truncate text-sm font-medium" title={name}>
                  {name}
                </p>
                <p className="text-xs text-faint">
                  {humanBytes(a.byte_size)}
                  {a.width && a.height ? ` · ${a.width}×${a.height}` : ""}
                  {durationLabel(a.duration_ms) ? ` · ${durationLabel(a.duration_ms)}` : ""}
                </p>
                {inPost ? (
                  <div className="space-y-0.5 text-xs text-faint">
                    {a.posts.length > 1 ? <p>Em {a.posts.length} posts:</p> : null}
                    {(isExpanded ? a.posts : a.posts.slice(0, INLINE_POSTS)).map((linked) => (
                      // EVERY post gets its own link. The old card linked one — whichever had
                      // the lowest id — and rendered the rest as the dead text "+N more", so
                      // most posts using a reused asset could not be reached from here at all.
                      <p key={linked.post_id} className="truncate">
                        {a.posts.length > 1 ? "" : "Em "}
                        <Link
                          href={`/library/${linked.post_id}`}
                          className="text-brand underline underline-offset-2"
                          title={linked.caption ?? `post #${linked.post_id}`}
                        >
                          {postLabel(linked.caption, linked.post_id)}
                        </Link>
                        {linked.status ? ` (${linked.status})` : ""}
                      </p>
                    ))}
                    {!isExpanded && a.posts.length > INLINE_POSTS ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((prev) => new Set(prev).add(a.id))
                        }
                        className="text-brand underline underline-offset-2"
                      >
                        +{a.posts.length - INLINE_POSTS} mais
                      </button>
                    ) : null}
                    {isCover ? <p>{coverAlso}</p> : null}
                  </div>
                ) : isCover ? (
                  // Referenced, but by a video rather than a post — so it gets a reason and
                  // no Delete button, matching what deleteAsset() would actually allow.
                  <p className="text-xs text-faint">{coverLabel}</p>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-faint">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleSelected(a.id)}
                        aria-label={`Selecionar ${name}`}
                      />
                      Sem uso
                    </label>
                    <button
                      type="button"
                      onClick={() => remove(a)}
                      disabled={busyId === a.id || pending}
                      aria-label={`Excluir ${name}`}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-status-failed hover:bg-surface-sunken disabled:opacity-50"
                    >
                      {busyId === a.id ? "Excluindo…" : "Excluir"}
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      )}

      {openMedia ? (
        <MediaLightbox
          assets={[openMedia.asset]}
          label={openMedia.label}
          onClose={() => setOpenMedia(null)}
        />
      ) : null}
    </div>
  );
}
