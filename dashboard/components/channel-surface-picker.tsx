"use client";

import { Fragment } from "react";
import { channelColor } from "@/lib/format";
import { ChannelAvatar } from "@/components/ui";
import {
  feedChipLabel,
  platformLabel,
  supportsStory,
  supportsText,
  videoSurfaces,
} from "@/lib/platforms";
import { needsStoryCanvas } from "@/lib/story-geometry";
import { destinationDisabledReason } from "@/lib/media-limits";
import type { PostTarget, Surface } from "@/lib/types";

export interface PickerChannel {
  id: number;
  platform: string;
  account_name: string;
  // 0/1 straight off the SQLite row, or a boolean from the composer's lite shape.
  requires_approval: boolean | number;
  color_hue: number | null;
  avatar_path: string | null;
  /** Migration 0030. Optional: a caller that never passes `folders` below gets the
   *  original flat grid regardless of what this holds. */
  folder_id?: number | null;
}

export function hasTarget(targets: PostTarget[], channelId: number, surface: Surface) {
  return targets.some((t) => t.channel_id === channelId && t.surface === surface);
}

/** Add or remove one (channel, surface) pair, leaving every other target alone. */
export function toggleTarget(
  targets: PostTarget[],
  channelId: number,
  surface: Surface,
): PostTarget[] {
  return hasTarget(targets, channelId, surface)
    ? targets.filter((t) => !(t.channel_id === channelId && t.surface === surface))
    : [...targets, { channel_id: channelId, surface }];
}

/**
 * Pick where a post goes: which accounts, and for Instagram/Facebook which SURFACE.
 *
 * Channels with only one surface render exactly as they always have — one row, one
 * checkbox — so no new concept appears where it does not apply. Instagram rows offer Feed
 * and Story as two independent chips; a Facebook row offered a video offers Feed and Reel
 * the same way — because each pair is two independent sends: that is what lets one photo
 * be a Story on Instagram and an ordinary post on Telegram, or one video land in a
 * Facebook Page's feed as an ordinary video and ALSO as a Reel. Instagram never gets a
 * SEPARATE Reel chip: its feed video already IS a Reel (media_type=REELS — there is no
 * other kind on Instagram anymore), so a second toggle would be a distinction with no
 * difference and would let both be picked at once, sending the same Reel twice. What that
 * first chip is LABELLED still changes with the content, via feedChipLabel: "Reel" for an
 * Instagram video, "Feed" for everything else — same single destination either way.
 *
 * Guards state their reason rather than silently disappearing, so an unavailable
 * destination is explained rather than merely absent.
 */
export function ChannelSurfacePicker({
  channels,
  value,
  onChange,
  textOnly = false,
  hasVideo = false,
  slideCount = 0,
  assets,
  postNow = false,
  folders,
}: {
  channels: PickerChannel[];
  value: PostTarget[];
  onChange: (next: PostTarget[]) => void;
  /** When given, channels are grouped under their folder (migration 0030) instead of one
   *  flat grid — mirrors "which accounts belong together for browsing" from the folder's
   *  own doc comment in lib/types.ts. Omitted entirely, callers keep today's flat grid;
   *  a folder with no members here is simply skipped, and a channel whose folder_id
   *  matches nothing in this list falls into "Sem pasta" alongside the truly unfoldered. */
  folders?: { id: number; name: string }[];
  /** A text-only post: no media, so nothing a Story could show. */
  textOnly?: boolean;
  /** The post's media is video, which some platforms can't take at all. */
  hasVideo?: boolean;
  /** How many slides the post has — a story target fans out to one Story per slide. */
  slideCount?: number;
  /** The post's assets, so a non-9:16 source can be flagged as "will be reframed" BEFORE
   *  scheduling, and an out-of-spec asset can be flagged as ineligible for a given
   *  destination (Instagram Story, Facebook Reel, ...) via destinationDisabledReason,
   *  rather than either being discovered afterwards. Optional: callers without dimensions
   *  (and duration) to hand (the sends panel, schedule-from-library) simply don't get the
   *  note — and, per destinationDisabledReason, an unknown value never disables the chip
   *  on its own. */
  assets?: {
    width: number | null;
    height: number | null;
    duration_ms?: number | null;
    // Threaded through so destinationDisabledReason can tell a genuinely out-of-spec
    // asset from one that's already been conformed for the feed — see
    // lib/media-limits.ts's surfaceReceivesConformedMedia. Optional, same as the fields
    // above: a caller without them just gets the pre-conform-aware behaviour (checked
    // against this asset's own width/height/byte_size), never a wrongly-enabled chip.
    byte_size?: number | null;
    publish_path?: string | null;
    conform_mode?: string | null;
  }[];
  postNow?: boolean;
}) {
  const storyCount = Math.max(slideCount, 1);
  const anyStorySelected = value.some((t) => t.surface === "story");
  // Reframing is stated up front, in the same spirit as the slide-count note below:
  // a landscape photo becomes a 9:16 canvas, and finding that out after publishing
  // is exactly the surprise this picker exists to prevent.
  const anyNeedsReframing = (assets ?? []).some((a) =>
    needsStoryCanvas(a.width ?? 0, a.height ?? 0)
  );
  // The one asset the limit checks below are run against — mirrors the old Facebook-Reel-
  // only check's assumption (a Reel is always a single video, so its first asset is the
  // one that matters) but generalized to every surface: a carousel's later slides aren't
  // checked here, same as before. media_kind is derived from `hasVideo` rather than asked
  // of the caller — every call site already computes it to set this same prop, so asking
  // for it twice would be a second source of truth to keep in sync.
  const primaryAsset = assets?.[0];
  const mediaAsset = primaryAsset
    ? { media_kind: hasVideo ? "video" : "image", ...primaryAsset }
    : null;

  // Same three checks the per-row feedDisabled below applies, kept separate rather than
  // shared: this pass only needs the yes/no answer to build the select-all set, not the
  // per-row `reason` text that the checks below also produce.
  const eligibleIds = channels
    .filter((c) => {
      const textDisabled = textOnly && !supportsText(c.platform);
      const videoDisabled = hasVideo && videoSurfaces(c.platform).length === 0;
      const feedLimitReason = mediaAsset ? destinationDisabledReason(c.platform, "feed", mediaAsset) : null;
      return !(textDisabled || videoDisabled || !!feedLimitReason);
    })
    .map((c) => c.id);
  const selectedEligibleCount = eligibleIds.filter((id) => hasTarget(value, id, "feed")).length;
  const allEligibleSelected = eligibleIds.length > 0 && selectedEligibleCount === eligibleIds.length;

  function selectAllChannels() {
    const additions = eligibleIds
      .filter((id) => !hasTarget(value, id, "feed"))
      .map((id) => ({ channel_id: id, surface: "feed" as Surface }));
    onChange([...value, ...additions]);
  }

  function clearAllChannels() {
    onChange(value.filter((t) => !(t.surface === "feed" && eligibleIds.includes(t.channel_id))));
  }

  // Grouped by folder (migration 0030) only when the caller passes one — every other
  // caller (bulk-import, post-sends-panel, schedule-from-library) omits it and keeps
  // today's flat order untouched. Channels are reordered so a folder's members sit
  // together; a header is attached to the first channel of each group and skipped
  // entirely when there's only one group to tell apart, same rule the queue's own
  // section headings use.
  const folderList = folders ?? [];
  let orderedChannels = channels;
  const headerBefore = new Map<number, string>();
  if (folderList.length > 0) {
    const byFolder = new Map<number, PickerChannel[]>();
    const unfoldered: PickerChannel[] = [];
    for (const c of channels) {
      const folder = c.folder_id != null ? folderList.find((f) => f.id === c.folder_id) : undefined;
      if (folder) {
        if (!byFolder.has(folder.id)) byFolder.set(folder.id, []);
        byFolder.get(folder.id)!.push(c);
      } else {
        unfoldered.push(c);
      }
    }
    const groups = [
      ...folderList
        .filter((f) => byFolder.has(f.id))
        .map((f) => ({ title: f.name, rows: byFolder.get(f.id)! })),
      ...(unfoldered.length > 0 ? [{ title: "Sem pasta", rows: unfoldered }] : []),
    ];
    if (groups.length > 1) {
      orderedChannels = groups.flatMap((g) => g.rows);
      for (const g of groups) {
        if (g.rows.length > 0) headerBefore.set(g.rows[0].id, `${g.title} · ${g.rows.length}`);
      }
    }
  }

  return (
    <div>
      {eligibleIds.length > 1 ? (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] text-muted">
            {selectedEligibleCount} de {eligibleIds.length} contas selecionadas
          </span>
          <button
            type="button"
            onClick={allEligibleSelected ? clearAllChannels : selectAllChannels}
            className="text-xs font-medium text-brand-strong hover:underline"
          >
            {allEligibleSelected ? "Limpar seleção" : "Selecionar todas"}
          </button>
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {orderedChannels.map((c) => {
          const header = headerBefore.get(c.id);
          const color = channelColor(c.id, c.color_hue);
          const textDisabled = textOnly && !supportsText(c.platform);
          const surfaces = videoSurfaces(c.platform);
          // A video post can only use this channel's VIDEO surfaces; an image post is
          // unaffected — surfaces.length === 0 is the same condition supportsVideo checks.
          const videoDisabled = hasVideo && surfaces.length === 0;
          // EVERY surface chip consults the same shared limits (dashboard/media-limits.json,
          // via destinationDisabledReason) — Feed included. A platform/surface this file has
          // no entry for (everything but Instagram/Facebook, for now) gets null back for
          // every chip, i.e. stays enabled: absent means not enforced, not "refuse everything".
          const feedLimitReason = mediaAsset ? destinationDisabledReason(c.platform, "feed", mediaAsset) : null;
          const feedDisabled = textDisabled || videoDisabled || !!feedLimitReason;
          // A Story needs something to show, so a text-only post has no Story option at
          // all — hidden rather than disabled, since it isn't a limit of the account.
          const offersStory = supportsStory(c.platform) && !textOnly;
          const storyLimitReason =
            offersStory && mediaAsset ? destinationDisabledReason(c.platform, "story", mediaAsset) : null;
          const storyDisabled = videoDisabled || !!storyLimitReason;
          // A Reel is a VIDEO surface, so it only ever appears alongside an actual video —
          // an image post never offers one, and neither does a platform without a "reel"
          // entry in videoSurfaces (Instagram included: its feed video already IS a Reel,
          // so a separate toggle there would be a distinction with no difference).
          const offersReel = hasVideo && surfaces.includes("reel");
          // Independent of videoDisabled: the whole channel can take this video (Feed is
          // fine), but Reel specifically has its own, tighter limits. offersReel implies
          // videoDisabled is false (a platform with no video surfaces at all never lists
          // "reel"), so this is the only thing that can grey out just the Reel chip.
          const reelLimitReason =
            offersReel && mediaAsset ? destinationDisabledReason(c.platform, "reel", mediaAsset) : null;
          const reelDisabled = videoDisabled || !!reelLimitReason;
          const feedLabel = feedChipLabel(c.platform, hasVideo);
          const feedOn = hasTarget(value, c.id, "feed");
          const storyOn = hasTarget(value, c.id, "story");
          const reelOn = hasTarget(value, c.id, "reel");
          const anyOn = feedOn || (offersStory && storyOn) || (offersReel && reelOn);

          const reason = textDisabled
            ? `${platformLabel(c.platform)} não publica só texto`
            : videoDisabled
              ? `${platformLabel(c.platform)} não publica vídeo`
              : feedLimitReason
                ? feedLimitReason
                : platformLabel(c.platform);
          const approval =
            !feedDisabled && c.requires_approval
              ? postNow
                ? " · aprovação pulada (Postar agora)"
                : " · precisa de aprovação"
              : "";

          const identity = (
            <>
              <ChannelAvatar
                id={c.id}
                name={c.account_name}
                colorHue={c.color_hue}
                avatarPath={c.avatar_path}
                size={20}
              />
              {/* channelColor's bg is a fixed LIGHT tint in every theme, so a selected
                  row must take its paired dark `fg` — on `text-ink` alone the name is
                  near-invisible in the dark themes. Same pairing as ui.tsx's ChannelChip. */}
              <span className="min-w-0">
                <span
                  className="block truncate text-sm font-medium text-ink"
                  style={anyOn && !feedDisabled ? { color: color.fg } : undefined}
                >
                  {c.account_name}
                </span>
                <span
                  className="data block text-[11px] text-muted"
                  style={anyOn && !feedDisabled ? { color: color.fg, opacity: 0.75 } : undefined}
                >
                  {reason}
                  {approval}
                </span>
              </span>
            </>
          );

          // ---- Instagram (Story) / Facebook (Reel): multiple destinations, multiple
          // chips. Same row shape either way, so there is one behaviour to learn rather
          // than two — a channel just shows whichever of Story/Reel it actually has.
          if (offersStory || offersReel) {
            return (
              <Fragment key={c.id}>
              {header ? (
                <div className="sm:col-span-2 pt-2 first:pt-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {header}
                </div>
              ) : null}
              <div
                className={`rounded-lg border px-3 py-2.5 transition-colors ${
                  anyOn ? "border-transparent" : "border-border"
                }`}
                style={
                  anyOn
                    ? { backgroundColor: color.bg, boxShadow: `inset 0 0 0 2px ${color.dot}` }
                    : undefined
                }
              >
                <div className="flex items-center gap-3">
                  {identity}
                  <span className="ml-auto flex shrink-0 gap-1" role="group"
                        aria-label={`Destinos de ${c.account_name}`}>
                    <SurfaceChip
                      label={feedLabel}
                      on={feedOn}
                      disabled={feedDisabled}
                      disabledReason={reason}
                      dot={color.dot}
                      onClick={() => onChange(toggleTarget(value, c.id, "feed"))}
                    />
                    {offersStory ? (
                      <SurfaceChip
                        label="Story"
                        on={storyOn}
                        disabled={storyDisabled}
                        disabledReason={storyLimitReason ?? reason}
                        dot={color.dot}
                        onClick={() => onChange(toggleTarget(value, c.id, "story"))}
                      />
                    ) : null}
                    {offersReel ? (
                      <SurfaceChip
                        label="Reel"
                        on={reelOn}
                        disabled={reelDisabled}
                        disabledReason={reelLimitReason ?? reason}
                        dot={color.dot}
                        onClick={() => onChange(toggleTarget(value, c.id, "reel"))}
                      />
                    ) : null}
                  </span>
                </div>
                {/* Shown inline, not just on hover — the limit should explain itself the
                    moment it matters, same spirit as the reframing/fan-out notes below.
                    Story and Reel are never both offered on the same channel today (one
                    needs Instagram, the other Facebook), but each gets its own line rather
                    than joining them, so this still reads cleanly if that ever changes. */}
                {storyLimitReason ? (
                  <p className="mt-1.5 pl-8 text-[11px] text-muted">{storyLimitReason}</p>
                ) : null}
                {reelLimitReason ? (
                  <p className="mt-1.5 pl-8 text-[11px] text-muted">{reelLimitReason}</p>
                ) : null}
              </div>
              </Fragment>
            );
          }

          // ---- Everything else: unchanged single toggle ---------------------------
          return (
            <Fragment key={c.id}>
            {header ? (
              <div className="sm:col-span-2 pt-2 first:pt-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {header}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => onChange(toggleTarget(value, c.id, "feed"))}
              disabled={feedDisabled}
              aria-pressed={feedOn}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                feedDisabled
                  ? "cursor-not-allowed border-border opacity-50"
                  : feedOn
                    ? "border-transparent"
                    : "border-border hover:bg-surface-sunken"
              }`}
              style={
                feedOn && !feedDisabled
                  ? { backgroundColor: color.bg, boxShadow: `inset 0 0 0 2px ${color.dot}` }
                  : undefined
              }
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                style={{
                  backgroundColor: feedOn && !feedDisabled ? color.dot : "transparent",
                  border: feedOn && !feedDisabled ? "none" : "1.5px solid var(--color-border-strong)",
                }}
              >
                {feedOn && !feedDisabled ? <span className="text-[10px] text-white">✓</span> : null}
              </span>
              {identity}
            </button>
            </Fragment>
          );
        })}
      </div>

      {/* Say the fan-out BEFORE scheduling. There is no carousel Story in the API, so a
          multi-slide post becomes one Story per slide — a surprise if discovered later. */}
      {anyStorySelected && anyNeedsReframing ? (
        <p className="mt-2 text-xs text-muted">
          Não é 9:16 — será reenquadrado para caber num Story. Mude como em Enquadramento.
        </p>
      ) : null}
      {anyStorySelected && storyCount > 1 ? (
        <p className="mt-2 text-xs text-muted">
          {storyCount} slides → {storyCount} Stories, postados em sequência na ordem dos slides.
        </p>
      ) : null}
    </div>
  );
}

function SurfaceChip({
  label,
  on,
  disabled,
  disabledReason,
  dot,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  disabledReason: string;
  dot: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      title={disabled ? disabledReason : undefined}
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
        disabled
          ? "cursor-not-allowed border-border text-muted opacity-50"
          : on
            ? "border-transparent text-white"
            : "border-border-strong text-muted hover:bg-surface-sunken"
      }`}
      style={on && !disabled ? { backgroundColor: dot } : undefined}
    >
      {label}
    </button>
  );
}
