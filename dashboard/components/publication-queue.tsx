"use client";

import { Fragment, startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicationRow } from "@/lib/queries";
import type { Period, PublicationStatus, Platform, Tag } from "@/lib/types";
import {
  PLATFORMS,
  deliveryLabel,
  isAwaitingPublication,
  supportsMetrics,
} from "@/lib/platforms";
import { ChannelChip, StatusBadge } from "@/components/ui";
import { PublicationActions } from "@/components/publication-actions";
import { CheckboxFilterDropdown } from "@/components/checkbox-filter-dropdown";
import { formatInTz, tzAbbrev, videoPreviewSrc } from "@/lib/format";
import { sendTime, formatLateness } from "@/lib/send-time";
import { groupQueueRows, cancelableIds } from "@/lib/queue-groups";
import { splitQueueSections, isFinished } from "@/lib/queue-sections";
import { StoryGroupHeader } from "@/components/story-group-header";
import { MediaLightbox, type LightboxAsset } from "@/components/media-lightbox";
import { QueueQuickEdit } from "@/components/queue-quick-edit";
import { BulkEditModal } from "@/components/bulk-edit-modal";

type StatusFilter = "all" | PublicationStatus;

/**
 * Can editing this row's post still change what it publishes?
 *
 * Only where the answer is yes does an Edit button appear. The three excluded statuses
 * are excluded for different reasons, and all three matter:
 *
 * - 'publishing' — the worker has already read the caption and is mid-flight to Meta.
 *   A save here writes to the DB and changes nothing about the post going out right now.
 * - 'posted'     — it's live, and Instagram's API cannot edit a published caption. The
 *   button would look like it fixes the live post. It would not.
 * - 'canceled'   — this send isn't going anywhere, so there is no "before it goes out".
 *
 * 'failed' IS editable: a failed send can be retried, and fixing whatever was wrong
 * before retrying is the entire point.
 */
function isEditable(status: PublicationStatus): boolean {
  return status === "scheduled" || status === "pending_approval" || status === "failed";
}

/**
 * Is THIS send's thumbnail a video?
 *
 * Prefers the asset's own media_kind over the post's type. post_type describes the
 * source, and a story send carries one slide of it — a story cut from a video post is a
 * video whose post_type is 'story', and a post_type 'video' row is a video whose asset
 * says so anyway. The post_type fallback only matters for a row loaded before the query
 * carried media_kind.
 */
function isVideoRow(p: PublicationRow): boolean {
  if (p.first_asset_media_kind) return p.first_asset_media_kind === "video";
  return p.post_type === "video";
}

function viewerLabel(p: PublicationRow): string {
  const what = isVideoRow(p) ? "Reproduzir vídeo" : "Ver imagem";
  if (p.story_slide_no) return `${what} — slide ${p.story_slide_no} do story`;
  if (p.asset_count > 1) return `${what} — carrossel, ${p.asset_count} slides`;
  return what;
}

function PlayGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ExpandGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "scheduled", label: "Agendado" },
  { value: "pending_approval", label: "Aguardando aprovação" },
  { value: "posted", label: "Postado" },
  { value: "failed", label: "Falhou" },
];

const selectCls =
  "rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:border-brand";

export function PublicationQueue({
  pubs,
  channels,
  periods,
  timeOfDayTags,
  topicTags,
  workerOnline = true,
  blockedIds = [],
  selectedChannels,
  onSelectedChannelsChange,
}: {
  pubs: PublicationRow[];
  channels: { id: number; account_name: string; platform: string }[];
  /** Read server-side by the page, exactly as /library does — small, stable lists that
   *  the quick-edit dialog needs to render its period and tag pickers. */
  periods: Period[];
  timeOfDayTags: Tag[];
  topicTags: Tag[];
  workerOnline?: boolean;
  /**
   * Ids the SERVER judged blocked (see isBlocked in lib/format). Passed in rather than
   * derived here so the overview's counter and these rows agree on one instant, and so
   * "overdue" isn't recomputed at hydration — which would either flash the badge or
   * mismatch the server's HTML.
   */
  blockedIds?: number[];
  /**
   * Which channels to show, shared with the clickable rail above the queue so the two
   * controls cannot disagree. Empty means EVERY channel — the same thing an unfiltered
   * list already meant, which is why there is no separate "all" value to keep in sync.
   * Omit both props and the queue keeps its own state, as it did before the rail existed.
   */
  selectedChannels?: Set<number>;
  onSelectedChannelsChange?: (next: Set<number>) => void;
}) {
  const router = useRouter();
  const blocked = new Set(blockedIds);
  // The POST being edited, not the send. Several rows can share one post (every slide of
  // a story, every channel of a fan-out) and they all open the same dialog. The status
  // rides along only so the dialog can be honest about what the edit reaches — a failed
  // send isn't counted as "queued" but a Retry will still publish the edited caption.
  const [editing, setEditing] = useState<{ postId: number; status: PublicationStatus } | null>(
    null
  );
  // Which send's media is open, if any. Seeded with the one asset the row already has so
  // the viewer opens instantly; the rest of a carousel arrives from the fetch below.
  const [openMedia, setOpenMedia] = useState<{
    pubId: number;
    postId: number;
    label: string;
    assets: LightboxAsset[];
    /** What the row says the post has, so the fetch knows whether to bother. */
    expectedCount: number;
    /** The asset this send is for — a story send opens on ITS slide, not slide 1. */
    focusAssetId: number;
  } | null>(null);

  function openViewer(p: PublicationRow) {
    if (!p.first_asset_id) return;
    setOpenMedia({
      pubId: p.id,
      postId: p.post_id,
      label: p.post_caption || `Post ${p.post_id}`,
      assets: [
        {
          id: p.first_asset_id,
          media_kind: isVideoRow(p) ? "video" : "image",
          cover_frame_ms: p.first_asset_cover_frame_ms,
          width: p.first_asset_width,
          height: p.first_asset_height,
        },
      ],
      expectedCount: p.asset_count,
      focusAssetId: p.first_asset_id,
    });
  }

  // A queue row carries only its own asset, so the rest of a carousel is fetched when the
  // viewer opens — same approach and endpoint as the Library. If it fails, the viewer
  // simply stays the single-asset one it already was.
  const openPostId = openMedia?.postId;
  const openLoaded = (openMedia?.assets.length ?? 0) > 1;
  const openExpected = openMedia?.expectedCount ?? 0;
  useEffect(() => {
    if (openPostId === undefined || openExpected < 2 || openLoaded) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/posts/${openPostId}/assets`, {
          signal: controller.signal,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(body.assets) || body.assets.length < 2) return;
        // Guarded on the id: by the time this lands the viewer may have been closed and
        // a different send's opened.
        setOpenMedia((current) =>
          current && current.postId === openPostId
            ? { ...current, assets: body.assets }
            : current
        );
      } catch {
        // Aborted, or offline. Either way the viewer keeps working.
      }
    })();
    return () => controller.abort();
  }, [openPostId, openExpected, openLoaded]);

  // Uncontrolled fallback, for any caller that renders the queue without a rail.
  const [ownAccounts, setOwnAccounts] = useState<Set<number>>(new Set());
  const accounts = selectedChannels ?? ownAccounts;
  const setAccounts = onSelectedChannelsChange ?? setOwnAccounts;
  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  // DESTINATION, not platform: an Instagram channel has both surfaces, so this is a
  // separate axis from the platform filter above. Matches the Library's filter.
  const [destination, setDestination] = useState<"all" | "story" | "reel" | "feed">("all");
  const [approvingAll, setApprovingAll] = useState(false);
  // Manual multi-select, independent of "Aprovar todos" above — that button always acts on
  // every pending_approval row currently on screen. This is for picking an arbitrary subset
  // (or everything visible) and applying any of the four per-row actions to just those.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkEditing, setBulkEditing] = useState(false);
  // Which sections (queue-sections.QueueSection['key']) are collapsed. Reaching
  // Done meant scrolling past the whole queue first whenever it was long — a large batch
  // schedule made that the common case, not the rare one. Starts empty (both open) so the
  // table looks exactly as it did before anyone collapses anything.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  function toggleSection(key: string) {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const shown = pubs.filter((p) => {
    // An empty set means no account filter at all, not "no accounts".
    if (accounts.size > 0 && !accounts.has(p.channel_id)) return false;
    if (platform !== "all" && p.channel_platform !== platform) return false;
    if (status !== "all" && p.status !== status) return false;
    if (destination !== "all" && p.surface !== destination) return false;
    return true;
  });

  // Scoped to whatever is currently on screen, same as the "mostrando X de Y" count
  // beside it — approving respects the same filters the owner is already looking through,
  // rather than reaching into rows they've filtered out of view.
  const pendingApprovalIds = shown.filter((p) => p.status === "pending_approval").map((p) => p.id);

  async function approveAll() {
    if (pendingApprovalIds.length === 0) return;
    if (
      !window.confirm(
        `Aprovar ${pendingApprovalIds.length} envio${pendingApprovalIds.length === 1 ? "" : "s"} agora? Cada um vai para a fila do worker exatamente como um "Aprovar" individual.`,
      )
    ) {
      return;
    }
    setApprovingAll(true);
    // One request per id, in parallel — the same endpoint the single-row Aprovar button
    // calls, so a bulk approve can never behave differently from clicking each one by
    // hand. A failure on one id does not stop the rest; router.refresh() afterward shows
    // whichever ones are still pending_approval either way.
    await Promise.all(
      pendingApprovalIds.map((id) =>
        fetch(`/api/publications/${id}/approve`, { method: "POST" }).catch(() => null),
      ),
    );
    setApprovingAll(false);
    startTransition(() => router.refresh());
  }

  const shownIds = new Set(shown.map((p) => p.id));
  // "Select all" stops at the end of the queue (scheduled/pending/failed/publishing) and
  // never reaches into Done — a posted or canceled send is over, so pulling it into a
  // bulk approve/hold/cancel/edit by default is never what "select all" meant. A row in
  // Done can still be checked BY HAND (its own checkbox is unaffected by this), just not
  // swept in by the header checkbox.
  const selectableShown = shown.filter((p) => !isFinished(p.status));
  const allShownSelected =
    selectableShown.length > 0 && selectableShown.every((p) => selectedIds.has(p.id));

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
        selectableShown.forEach((p) => next.delete(p.id));
      } else {
        selectableShown.forEach((p) => next.add(p.id));
      }
      return next;
    });
  }

  // Drop any selected id that scrolled out of view once the filters changed, so "N
  // selecionados" and the bulk actions never silently reach past what's on screen.
  useEffect(() => {
    setSelectedIds((current) => {
      let changed = false;
      const next = new Set(current);
      for (const id of current) {
        if (!shownIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : current;
    });
    // shownIds is a new Set every render; comparing its serialized ids is what actually
    // matters, and pubs/accounts/platform/status/destination cover every input that can
    // change which rows are shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubs, accounts, platform, status, destination]);

  const selectedRows = pubs.filter((p) => selectedIds.has(p.id));
  const selectedPostIds = [...new Set(selectedRows.map((p) => p.post_id))];

  async function runBulk(action: "approve" | "hold" | "cancel") {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    // Same one-request-per-id pattern as approveAll — a row this action doesn't apply to
    // (e.g. holding an already-posted send) just 409s and is left as-is, exactly like
    // clicking that row's own button would do.
    await Promise.all(
      ids.map((id) => fetch(`/api/publications/${id}/${action}`, { method: "POST" }).catch(() => null)),
    );
    setBulkBusy(false);
    setSelectedIds(new Set());
    startTransition(() => router.refresh());
  }

  async function bulkCancel() {
    const count = selectedIds.size;
    if (count === 0) return;
    if (
      !window.confirm(
        `Cancelar ${count} envio${count === 1 ? "" : "s"} selecionado${count === 1 ? "" : "s"}? Só os agendados ou aguardando aprovação são cancelados — o resto fica como está.`,
      )
    ) {
      return;
    }
    await runBulk("cancel");
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* A checkbox dropdown rather than a <select>: it has to express the same
            multi-channel selection the rail above can, and a single-select could only
            ever disagree with the cards. */}
        <CheckboxFilterDropdown
          label="Contas"
          options={channels.map((c) => ({ value: c.id, label: c.account_name }))}
          selected={accounts}
          onApply={(values) => setAccounts(values)}
        />
        <select
          className={selectCls}
          value={platform}
          onChange={(e) => setPlatform(e.target.value as "all" | Platform)}
        >
          <option value="all">Todas as plataformas</option>
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          aria-label="Filtrar por destino"
          value={destination}
          onChange={(e) => setDestination(e.target.value as typeof destination)}
        >
          <option value="all">Todos os destinos</option>
          <option value="story">Stories</option>
          <option value="reel">Reels</option>
          <option value="feed">Só feed</option>
        </select>
        {pendingApprovalIds.length > 0 ? (
          <button
            type="button"
            onClick={approveAll}
            disabled={approvingAll}
            className="ml-auto rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-on-brand hover:bg-brand-ink disabled:opacity-50"
          >
            {approvingAll
              ? "Aprovando…"
              : `Aprovar todos (${pendingApprovalIds.length})`}
          </button>
        ) : null}
        <span className={`data text-[11px] text-muted ${pendingApprovalIds.length > 0 ? "" : "ml-auto"}`}>
          mostrando {shown.length} de {pubs.length}
        </span>
      </div>

      {selectedIds.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-sunken px-3 py-2">
          <span className="text-xs font-medium text-ink-soft">
            {selectedIds.size} selecionado{selectedIds.size === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => runBulk("approve")}
            disabled={bulkBusy}
            className="rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-on-brand hover:bg-brand-ink disabled:opacity-50"
          >
            Aprovar
          </button>
          <button
            type="button"
            onClick={() => runBulk("hold")}
            disabled={bulkBusy}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-surface disabled:opacity-50"
          >
            Colocar em espera
          </button>
          <button
            type="button"
            onClick={bulkCancel}
            disabled={bulkBusy}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted hover:border-status-failed hover:text-status-failed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => setBulkEditing(true)}
            disabled={bulkBusy || selectedPostIds.length === 0}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-ink-soft hover:border-brand hover:text-brand disabled:opacity-50"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            disabled={bulkBusy}
            className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-faint hover:text-ink-soft disabled:opacity-50"
          >
            Limpar seleção
          </button>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="rounded-card border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          Nenhum envio corresponde a esses filtros.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
                <th className="px-4 py-2.5 font-medium">
                  <input
                    type="checkbox"
                    checked={allShownSelected}
                    onChange={toggleSelectAll}
                    aria-label="Selecionar todos os envios visíveis que ainda estão na fila"
                    title="Seleciona só o que ainda está na fila — não inclui o que já foi postado ou cancelado"
                    className="align-middle"
                  />
                </th>
                <th className="px-4 py-2.5 font-medium">Post</th>
                <th className="px-4 py-2.5 font-medium">Conta</th>
                <th className="px-4 py-2.5 font-medium">Quando</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {splitQueueSections(shown).map((section, sectionIndex, all) => {
                const collapsed = collapsedSections.has(section.key);
                return (
                <Fragment key={section.key}>
                  {/* Only headed when more than one section is on screen. A single heading
                      over the whole table says nothing the status filter has not already
                      said. */}
                  {all.length > 1 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className={`border-b border-border bg-surface-sunken px-4 py-2 ${
                          sectionIndex > 0 ? "border-t-4 border-t-border" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSection(section.key)}
                          aria-expanded={!collapsed}
                          title={collapsed ? "Clique para expandir" : "Clique para recolher"}
                          className="group/toggle flex w-full items-center gap-2.5 rounded-md py-0.5 text-left hover:bg-surface"
                        >
                          {/* A visibly separate round chip, not just a bare glyph sitting in
                              text — the earlier plain "▾" character read as decoration, not
                              as a control. Rotates to point right when collapsed. */}
                          <span
                            aria-hidden
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-ink-soft transition-transform group-hover/toggle:border-brand group-hover/toggle:text-brand ${collapsed ? "-rotate-90" : ""}`}
                          >
                            <ChevronGlyph />
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft group-hover/toggle:text-ink">
                            {section.title}
                          </span>
                          <span className="data text-[11px] text-faint">
                            {section.rows.length}
                          </span>
                          {/* The two halves run in opposite directions, which looks like a
                              glitch unless something says it is deliberate. */}
                          <span className="text-[11px] text-faint">
                            {collapsed ? "· recolhido" : `· ${section.hint}`}
                          </span>
                        </button>
                      </td>
                    </tr>
                  ) : null}
                  {/* Grouped WITHIN a section, not across it: a Story whose slide 3 failed
                      while 1, 2 and 4 posted genuinely belongs to both halves, and the
                      failed slide needs to appear with the work that still needs you. */}
                  {!collapsed && groupQueueRows(section.rows).map((group) => (
                <Fragment key={group.key}>
                  {group.isStoryGroup ? (
                    <StoryGroupHeader
                      slideCount={group.rows.length}
                      caption={group.rows[0].post_caption}
                      channelName={group.rows[0].channel_name}
                      cancelableIds={cancelableIds(group.rows)}
                      workerOnline={workerOnline}
                    />
                  ) : null}
                  {group.rows.map((p) => (
                <tr key={p.id} className={`border-b border-border last:border-0 align-top ${
                  group.isStoryGroup ? "bg-surface-sunken/40" : ""
                }`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelected(p.id)}
                      aria-label={`Selecionar envio ${p.id}`}
                      className="align-middle"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      {/* The whole thumbnail opens the viewer, rather than the Library's
                          corner MediaBadge: at 44px a 24px badge covers a quarter of the
                          image and leaves a target barely larger than the thumbnail
                          itself. A real <button> keeps it keyboard-reachable, and the
                          glyph on hover/focus is what advertises that it does anything. */}
                      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-border bg-surface-sunken">
                        {p.first_asset_id ? (
                          <>
                            {isVideoRow(p) ? (
                              // No thumbnail file exists for video (no ffmpeg dependency
                              // by design) — render the real file with
                              // preload="metadata" so the browser decodes just the first
                              // frame, same approach as post-editor.tsx /
                              // cover-frame-picker.tsx. videoPreviewSrc's #t= fragment is
                              // what makes that frame actually paint in Safari.
                              <video
                                src={videoPreviewSrc(
                                  p.first_asset_id,
                                  p.first_asset_cover_frame_ms ?? undefined
                                )}
                                preload="metadata"
                                muted
                                playsInline
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/media/${p.first_asset_id}?variant=thumb`}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => openViewer(p)}
                              aria-label={viewerLabel(p)}
                              title={viewerLabel(p)}
                              className="group absolute inset-0 flex items-center justify-center bg-black/0 text-white transition-colors hover:bg-black/45 focus-visible:bg-black/45 focus-visible:outline-none"
                            >
                              <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                {isVideoRow(p) ? <PlayGlyph /> : <ExpandGlyph />}
                              </span>
                            </button>
                            {/* Says there is more behind the thumbnail, so a carousel
                                doesn't look like a single image worth one glance. */}
                            {p.asset_count > 1 && !p.story_slide_no ? (
                              <span className="data pointer-events-none absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] leading-[1.4] text-white">
                                {p.asset_count}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="line-clamp-2 max-w-xs text-ink">
                          {p.surface === "story" ? (
                            <span
                              className="mr-1.5 rounded-full border border-border-strong px-1.5 py-px align-middle text-[10px] font-medium text-ink-soft"
                              title="Publica no Story do Instagram, não no feed"
                            >
                              Story
                            </span>
                          ) : null}
                          {p.surface === "reel" ? (
                            <span
                              className="mr-1.5 rounded-full border border-border-strong px-1.5 py-px align-middle text-[10px] font-medium text-ink-soft"
                              title="Publica nos Reels do Facebook, não no feed"
                            >
                              Reel
                            </span>
                          ) : null}
                          {p.post_caption || (
                            <span className="text-faint italic">
                              {p.surface === "story" ? "Stories não têm legenda" : "Sem legenda"}
                            </span>
                          )}
                        </p>
                        <p className="data mt-0.5 text-[11px] text-faint">
                          {/* post_type describes the SOURCE post. For a story send it would
                              read "carousel · 4 imgs" while this row publishes exactly one
                              slide — so say what THIS send actually does instead. Same
                              reasoning for a reel send: post_type reads "video" either way,
                              which doesn't say WHICH Facebook surface it's headed to. */}
                          {p.surface === "story"
                            ? p.story_slide_no && p.asset_count > 1
                              ? `Story · slide ${p.story_slide_no} de ${p.asset_count}`
                              : "Story"
                            : p.surface === "reel"
                              ? "Reel"
                              : `${p.post_type}${p.asset_count > 1 ? ` · ${p.asset_count} imgs` : ""}`}
                          {p.remote_post_id && p.remote_post_id !== "DRYRUN"
                            ? ` · ${p.remote_post_id}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ChannelChip
                      id={p.channel_id}
                      platform={p.channel_platform}
                      name={p.channel_name}
                      colorHue={p.channel_color_hue}
                      avatarPath={p.channel_avatar_path}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      // A posted send shows when it ACTUALLY went out. Showing scheduled_at
                      // here made every delayed post look punctual — real sends on this
                      // install drifted by hours when the Mac slept past their slot.
                      const when = sendTime(p);
                      return (
                        <>
                          <span
                            className="data text-xs text-ink-soft"
                            title={
                              when.actual
                                ? `Postado de fato em ${formatInTz(p.published_at, p.channel_timezone)} · agendado para ${formatInTz(p.scheduled_at, p.channel_timezone)}`
                                : undefined
                            }
                          >
                            {formatInTz(when.iso, p.channel_timezone)}
                          </span>
                          <span className="data block text-[10px] text-faint">
                            {tzAbbrev(p.channel_timezone)}
                          </span>
                          {/* Only when the gap is big enough to mean something. Without it
                              the corrected time silently disagrees with the slot the owner
                              chose, and there is nothing on screen to explain why. */}
                          {when.lateMinutes !== null ? (
                            <span className="data mt-0.5 block text-[10px] text-status-blocked">
                              {formatLateness(when.lateMinutes)}
                            </span>
                          ) : null}
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusBadge
                        status={
                          blocked.has(p.id)
                            ? "blocked"
                            : // A TikTok video waiting in the creator's inbox, or one we
                              // never saw go live, is not posted. The line underneath says
                              // so in words, but a green "Posted" pill is what gets read at
                              // a glance, so the badge itself has to stop claiming it.
                              p.status === "posted" && isAwaitingPublication(p.delivery_state)
                              ? "delivered"
                              : p.status
                        }
                        dryRun={p.is_dry_run === 1}
                      />
                      {/* Answers "why is this old post going out again?" at the point the
                          question gets asked. Auto-fill normally sends unposted content
                          first, so a repeat with no explanation reads as a bug. */}
                      {p.is_recycled === 1 ? (
                        <span
                          className="inline-flex items-center rounded-full bg-brand-weak px-2 py-0.5 text-[10px] font-medium text-brand-strong"
                          title="O preenchimento automático escolheu este de novo porque teve bom desempenho"
                        >
                          melhor desempenho
                        </span>
                      ) : null}
                      {p.is_held === 1 ? (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            color: "var(--color-status-draft)",
                            // See ui.tsx's StatusBadge for why this mixes into the theme's
                            // own dark surface rather than white.
                            backgroundColor:
                              "color-mix(in srgb, var(--color-status-draft) 22%, var(--color-surface))",
                          }}
                        >
                          Em espera
                        </span>
                      ) : null}
                    </span>
                    {/* A TikTok video waiting in the creator's inbox is NOT posted, and
                        the badge above cannot say so on its own — status='posted' means
                        the worker's job succeeded, which it did. deliveryLabel returns
                        null for every platform that publishes on command, so this line
                        simply is not there for them. */}
                    {deliveryLabel({
                      platform: p.channel_platform,
                      status: p.status,
                      delivery_state: p.delivery_state,
                    }) ? (
                      <p className="mt-1 text-[11px] text-status-blocked">
                        {deliveryLabel({
                          platform: p.channel_platform,
                          status: p.status,
                          delivery_state: p.delivery_state,
                        })}
                      </p>
                    ) : null}
                    {p.status === "posted" && !supportsMetrics(p.channel_platform) ? (
                      // Discord and Telegram have no metrics at all — rendering nothing here
                      // (rather than an always-empty strip or a perpetual "metrics pending…")
                      // is the same call already made for Facebook's reach and Threads' missing
                      // metric fields above.
                      null
                    ) : p.status === "posted" && p.m_fetched_at ? (
                      p.channel_platform === "facebook" ? (
                        <p className="data mt-1 flex gap-2.5 text-[11px] text-ink-soft">
                          <span title="Reações">♥ {p.m_likes ?? "—"}</span>
                          <span title="Comentários">💬 {p.m_comments ?? "—"}</span>
                          <span title="Compartilhamentos">↪ {p.m_shares ?? "—"}</span>
                          {/* Reach is best-effort on Facebook (Meta keeps retiring the metric
                              names), so show it only when we actually got a number — an empty
                              slot would read as "broken" on every normal row. */}
                          {p.m_reach != null ? (
                            <span title="Alcance">◎ {p.m_reach}</span>
                          ) : null}
                        </p>
                      ) : p.channel_platform === "threads" ? (
                        // Threads has neither "reach" nor "saves" as a concept — omitting
                        // them entirely (rather than showing an always-empty slot) is the
                        // same call already made for Facebook's reach above.
                        <p className="data mt-1 flex gap-2.5 text-[11px] text-ink-soft">
                          <span title="Visualizações">👁 {p.m_impressions ?? "—"}</span>
                          <span title="Curtidas">♥ {p.m_likes ?? "—"}</span>
                          <span title="Respostas">💬 {p.m_comments ?? "—"}</span>
                          <span title="Reposts">↻ {p.m_shares ?? "—"}</span>
                        </p>
                      ) : p.channel_platform === "instagram" ? (
                        <p className="data mt-1 flex gap-2.5 text-[11px] text-ink-soft">
                          <span title="Alcance">◎ {p.m_reach ?? "—"}</span>
                          <span title="Salvamentos">⤓ {p.m_saves ?? "—"}</span>
                          <span title="Curtidas">♥ {p.m_likes ?? "—"}</span>
                        </p>
                      ) : p.channel_platform === "tiktok" ? (
                        // TikTok has no reach and no saves — omitted rather than shown
                        // empty, same as Threads above. view_count lands in the
                        // impressions column (worker/metrics.py COLUMN_MAP).
                        <p className="data mt-1 flex gap-2.5 text-[11px] text-ink-soft">
                          <span title="Visualizações">👁 {p.m_impressions ?? "—"}</span>
                          <span title="Curtidas">♥ {p.m_likes ?? "—"}</span>
                          <span title="Comentários">💬 {p.m_comments ?? "—"}</span>
                          <span title="Compartilhamentos">↪ {p.m_shares ?? "—"}</span>
                        </p>
                      ) : (
                        // An unrecognised platform should look wrong, not quietly inherit
                        // Instagram's metric set — matches lib/platforms.ts's fallback style.
                        <p className="data mt-1 text-[11px] text-status-failed">
                          Plataforma desconhecida &quot;{p.channel_platform}&quot; — sem exibição de métricas para ela.
                        </p>
                      )
                    ) : p.status === "posted" &&
                      p.is_dry_run !== 1 &&
                      // Nothing is pending for a send still sitting in a TikTok inbox, or
                      // one we never saw go live: there is no published post to measure.
                      // "metrics pending…" there would promise numbers that cannot come.
                      !isAwaitingPublication(p.delivery_state) ? (
                      <p className="data mt-1 text-[10px] text-faint">métricas pendentes…</p>
                    ) : null}
                    {p.last_error ? (
                      // Three weights, matching the badge. Red = dead, needs you. Amber =
                      // tried and couldn't, will try again, still needs your eye. Muted =
                      // a stale error on a send that is genuinely just waiting its turn.
                      // Muting a BLOCKED send was the earlier mistake: nothing was lost,
                      // but it isn't moving either, and grey-on-"Scheduled" read as fine.
                      // title= because the text is clamped to two lines — hovering must
                      // still give the whole reason rather than losing it to the clamp.
                      <p
                        title={p.last_error}
                        className={`mt-1 max-w-xs text-[11px] line-clamp-2 ${
                          p.status === "failed"
                            ? "text-status-failed"
                            : blocked.has(p.id)
                              ? "text-status-blocked"
                              : "text-faint"
                        }`}
                      >
                        {p.last_error}
                      </p>
                    ) : null}
                    {p.attempt_count > 0 && p.status !== "failed" ? (
                      <p className="data mt-0.5 text-[10px] text-faint">
                        tentativa {p.attempt_count}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Edits the POST, which is why it sits apart from the controls below
                        — those all act on this one send. */}
                    {isEditable(p.status) ? (
                      <button
                        type="button"
                        onClick={() => setEditing({ postId: p.post_id, status: p.status })}
                        className="mb-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-ink-soft hover:border-brand hover:text-brand"
                        title="Edite a legenda, as etiquetas e o status deste post antes de ele sair"
                      >
                        Editar
                      </button>
                    ) : null}
                    <PublicationActions
                      id={p.id}
                      status={p.status}
                      isDryRun={p.is_dry_run === 1}
                      workerOnline={workerOnline}
                      isHeld={p.is_held === 1}
                      scheduledAt={p.scheduled_at}
                      nextRetryAt={p.next_retry_at}
                      channelTimezone={p.channel_timezone}
                      platform={p.channel_platform}
                      deliveryState={p.delivery_state}
                    />
                  </td>
                </tr>
                  ))}
                </Fragment>
                  ))}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openMedia ? (
        <MediaLightbox
          // Remounts once, when the carousel's remaining slides land. MediaLightbox reads
          // initialIndex in a useState initializer, so a story send — which opens on its
          // OWN slide — would otherwise be pinned to 0 by the single-asset array it
          // opened with and never move when the real set arrives. Keyed on the length so
          // this happens exactly once per open, before anyone can press play.
          key={`${openMedia.pubId}:${openMedia.assets.length}`}
          assets={openMedia.assets}
          initialIndex={Math.max(
            0,
            openMedia.assets.findIndex((a) => a.id === openMedia.focusAssetId)
          )}
          label={openMedia.label}
          onClose={() => setOpenMedia(null)}
        />
      ) : null}

      {bulkEditing ? (
        <BulkEditModal
          postIds={selectedPostIds}
          periods={periods}
          timeOfDayTags={timeOfDayTags}
          topicTags={topicTags}
          onClose={() => setBulkEditing(false)}
          onSaved={() => {
            setBulkEditing(false);
            setSelectedIds(new Set());
            startTransition(() => router.refresh());
          }}
        />
      ) : null}

      {editing !== null ? (
        <QueueQuickEdit
          // Remount on a different post so no edit state can carry across.
          key={editing.postId}
          postId={editing.postId}
          isFailedSend={editing.status === "failed"}
          periods={periods}
          timeOfDayTags={timeOfDayTags}
          topicTags={topicTags}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            // The queue rows carry the caption they were rendered with, so without this
            // a successful save leaves the old text sitting on screen underneath it.
            startTransition(() => router.refresh());
          }}
        />
      ) : null}
    </div>
  );
}
