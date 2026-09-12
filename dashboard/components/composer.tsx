"use client";

import { useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { channelColor, formatParts } from "@/lib/format";
import { ChannelAvatar } from "@/components/ui";
import { platformLabel, supportsText, supportsVideo, captionLimit, PLATFORMS } from "@/lib/platforms";
import { destinationDisabledReason } from "@/lib/media-limits";
import { captionsForPlatform } from "@/lib/caption-limits";
import { captionLength } from "@/lib/caption-length";
import { insertAtCaret } from "@/lib/insert-at-caret";
import { EmojiPicker } from "@/components/emoji-picker";
import type { Asset, Period, PeriodMode, PostTarget, Tag } from "@/lib/types";
import type { PublishReadiness } from "@/lib/publish-readiness";
import { CaptionVariantsEditor, type CaptionVariantDraft } from "@/components/caption-variants-editor";
import { TikTokCaptionNotice } from "@/components/tiktok-caption-notice";
import { PeriodAttach } from "@/components/period-attach";
import { TagEditor } from "@/components/tag-editor";
import { FramingButton } from "@/components/framing-button";
import { PostPreview } from "@/components/post-preview";
import { CoverFramePicker } from "@/components/cover-frame-picker";
import { PostNowReadinessNotice } from "@/components/post-now-readiness";
import { SlideReorder, type Slide } from "@/components/slide-reorder";
import { ChannelSurfacePicker } from "@/components/channel-surface-picker";
import { TimezonePicker } from "@/components/timezone-picker";

interface ChannelLite {
  id: number;
  platform: string;
  account_name: string;
  timezone: string;
  requires_approval: boolean;
  color_hue: number | null;
  avatar_path: string | null;
}
// Wraps the full Asset row the upload API returns (needed as-is for <CoverFramePicker>)
// plus the bits that only make sense while composing: whether this upload matched
// an existing asset by content hash, any non-blocking warnings the Reels validator
// raised (e.g. "no audio track") that the API returns but a plain image upload never
// has, and — when an out-of-spec video was silently rewritten to fit Instagram's
// limits — the before/after dimensions, so the owner can be told plainly what
// happened instead of just noticing the framing changed.
interface UploadedAsset {
  asset: Asset;
  deduped: boolean;
  warnings: string[];
  converted?: { from: string; to: string };
}

/**
 * Render a `datetime-local` value ("2026-09-04T09:00") as "Fri, Sep 4 at 9:00 AM".
 *
 * The digits are a WALL CLOCK with no zone — the Timezone control beside the field says
 * which zone they belong to. So they are pinned to UTC purely to be formatted, and read
 * back in UTC, which reproduces them exactly. Handing the raw string to `new Date()` and
 * formatting in the viewer's zone would be the same mistake that briefly titled August's
 * calendar grid "July".
 */
function formatWallClock(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  // formatParts, not Intl directly: it pins the date/time connector so the server and
  // the browser agree despite their different ICU versions. See lib/format.ts.
  return formatParts(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi)), {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function Composer({
  channels,
  defaultTimezone,
  defaultScheduledLocal = "",
  periods,
  timeOfDayTags,
  topicTags,
  readiness,
}: {
  channels: ChannelLite[];
  defaultTimezone: string;
  /** Prefilled date+time: the calendar's clicked day on arrival from its empty-day "+",
   *  or today (09:00) on a plain visit — the owner still has to pick the actual time. */
  defaultScheduledLocal?: string;
  periods: Period[];
  timeOfDayTags: Tag[];
  topicTags: Tag[];
  readiness: PublishReadiness;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [variants, setVariants] = useState<CaptionVariantDraft[]>([{ platform: "", body: "" }]);
  const [firstComment, setFirstComment] = useState("");
  const firstCommentRef = useRef<HTMLTextAreaElement>(null);
  // Where the caret goes once the new value reaches the DOM. See the layout effect below.
  const pendingCaret = useRef<number | null>(null);

  /**
   * Put the caret back after an emoji insert.
   *
   * useLayoutEffect keyed on the value, NOT requestAnimationFrame. rAF can fire before React
   * commits the new text, so setSelectionRange lands on the OLD string and the re-render
   * then throws the caret to the end — verified in a browser.
   */
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null) return;
    pendingCaret.current = null;
    const el = firstCommentRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(caret, caret);
  }, [firstComment]);

  /** Splice a picked emoji into the first-comment box at the caret, not at the end. */
  function insertFirstCommentEmoji(emoji: string) {
    const el = firstCommentRef.current;
    const start = el?.selectionStart ?? firstComment.length;
    const end = el?.selectionEnd ?? firstComment.length;
    const next = insertAtCaret(firstComment, emoji, start, end);
    pendingCaret.current = next.caret;
    setFirstComment(next.text);
  }
  // Targets, not channel ids: an Instagram channel can be picked for its Feed, its
  // Story, or both, and each is an independent send. See channel-surface-picker.
  const [targets, setTargets] = useState<PostTarget[]>([]);
  // The three prunes elsewhere in this component (onFiles, removeAsset, toggleTextOnly)
  // fire on a SPECIFIC event and drop targets that became structurally incompatible.
  // This is the general safety net alongside them, in the same "derive, don't sync" style
  // post-editor.tsx/post-sends-panel.tsx/schedule-from-library.tsx already use for their
  // own effectiveTargets: whenever the post's asset changes, any already-selected
  // (channel, surface) target that the shared media limits (dashboard/media-limits.json,
  // via destinationDisabledReason — the SAME check ChannelSurfacePicker greys every chip
  // with) now refuse for the new asset is dropped, without writing back into `targets`
  // state. Without this, a Story target picked while a video was in-spec could survive
  // that video being swapped for an out-of-spec one — the exact "chip hid itself, target
  // survived, wrong media published" failure mode this project has already shipped twice.
  const effectiveTargets = useMemo(() => {
    const asset = assets[0]?.asset;
    if (!asset) return targets;
    return targets.filter((t) => {
      const channel = channels.find((c) => c.id === t.channel_id);
      if (!channel) return true;
      return destinationDisabledReason(channel.platform, t.surface, asset) === null;
    });
  }, [targets, assets, channels]);
  const selectedChannelIds = new Set(effectiveTargets.map((t) => t.channel_id));
  const [textOnly, setTextOnly] = useState(false);
  const [timezone, setTimezone] = useState(defaultTimezone);
  // Reported up by TimezonePicker; gates scheduling on a valid zone. Irrelevant
  // when postNow is on, since that path never converts a wall clock.
  const [tzValid, setTzValid] = useState(true);
  const [scheduledLocal, setScheduledLocal] = useState(defaultScheduledLocal);
  const whenLabel = formatWallClock(scheduledLocal);
  const [postNow, setPostNow] = useState(false);
  const [contentKind, setContentKind] = useState<"evergreen" | "one_time">("evergreen");
  const [periodModes, setPeriodModes] = useState<Record<number, PeriodMode>>({});
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<"draft" | "ready">("draft");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const caption =
    variants.find((v) => v.platform === "" && v.body.trim())?.body ??
    variants.find((v) => v.body.trim())?.body ??
    "";

  const captionVariantsPayload = variants
    .filter((v) => v.body.trim())
    .map((v, i) => ({ platform: v.platform || null, body: v.body.trim(), sort_order: i }));

  const periodLinksPayload = Object.entries(periodModes).map(([periodId, mode]) => ({
    periodId: Number(periodId),
    mode,
  }));

  // A video post is always exactly one video asset — mixing video with anything else, or
  // more than one video, is rejected up front in onFiles below, so "the one asset present
  // is a video" is equivalent to "this is a video post". Gated on !textOnly too: switching Text
  // only on always submits asset_ids: [] regardless of what's still sitting in `assets`
  // (see submit below), so a leftover video asset must not keep disabling every
  // text-capable channel or blocking channel selection once the post is really text-only.
  const hasVideo = !textOnly && assets.length === 1 && assets[0].asset.media_kind === "video";

  const postType = textOnly
    ? "text"
    : hasVideo
    ? "video"
    : assets.length > 1
    ? "carousel"
    : assets.length === 1
    ? "single"
    : "—";

  // Mirrors worker/publisher.py's _select_caption's matching rules, but — like
  // captionLimitError on the server — checks the length of EVERY variant that would
  // match this platform, not just the first. The worker rotates through all of a
  // platform's variants by post count, so a second, longer variant a `.find()` would
  // never reach can still get selected on a later publish and fail terminally; showing
  // the worst (longest) candidate here keeps the counter honest about that risk.
  function worstCaptionLengthForPlatform(platform: string): number {
    const trimmedVariants = variants
      .filter((v) => v.body.trim())
      .map((v) => ({ platform: v.platform || null, body: v.body.trim() }));
    const candidates = captionsForPlatform(platform, trimmedVariants, caption);
    return Math.max(0, ...candidates.map((c) => captionLength(c)));
  }

  const selectedChannels = channels.filter((c) => selectedChannelIds.has(c.id));

  // One check per selected channel that actually declares a caption limit — each using
  // the worst-case caption that could actually get published to THAT platform, not the
  // generic display caption.
  const captionChecks = selectedChannels
    .map((c) => {
      const limit = captionLimit(c.platform, postType);
      return limit === null ? null : { channel: c as ChannelLite | null, limit, length: worstCaptionLengthForPlatform(c.platform) };
    })
    .filter((v): v is { channel: ChannelLite | null; limit: number; length: number } => v !== null);

  // With nothing selected yet in text-only mode, fall back to the strictest limit among
  // text-capable platforms so the counter is still meaningful before a channel is picked.
  const fallbackLimits = PLATFORMS.filter((p) => p.supportsText)
    .map((p): number | null => captionLimit(p.value, postType))
    .filter((n): n is number => n !== null);
  const fallbackCheck =
    captionChecks.length === 0 && textOnly && fallbackLimits.length > 0
      ? { channel: null, limit: Math.min(...fallbackLimits), length: captionLength(caption) }
      : null;

  const allCaptionChecks = fallbackCheck ? [fallbackCheck] : captionChecks;
  const worstCaptionCheck =
    allCaptionChecks.length > 0
      ? allCaptionChecks.reduce((worst, c) => (c.length - c.limit > worst.length - worst.limit ? c : worst))
      : null;
  const overCaptionLimit = allCaptionChecks.some((c) => c.length > c.limit);

  // Shared by the Threads text-only toggle and the video-channel gating below: drop any
  // already-selected channel that the given predicate says can no longer take this post,
  // rather than leaving it selected-but-disabled (which would submit a target that can't
  // work).
  function deselectIncompatible(isCompatible: (platform: string) => boolean) {
    setTargets((prev) =>
      prev.filter((t) => {
        const channel = channels.find((c) => c.id === t.channel_id);
        return channel ? isCompatible(channel.platform) : false;
      })
    );
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setNotice(null);

    // A reel is a single video with no other media — the API rejects a mixed carousel
    // too, but catching it here gives an immediate, specific message instead of a
    // confusing 400 after the upload already completed.
    const incoming = Array.from(files);
    const incomingHasVideo = incoming.some((f) => f.type.startsWith("video/"));
    if (hasVideo) {
      setError("Remova o vídeo atual antes de adicionar mais mídia.");
      return;
    }
    if (incomingHasVideo && (assets.length > 0 || incoming.length > 1)) {
      setError("Um Reel é um único vídeo, sem outras imagens ou vídeos junto.");
      return;
    }

    setUploading(true);
    let dedupCount = 0;
    for (const file of incoming) {
      const fd = new FormData();
      fd.append("file", file);
      // fetch() itself rejects on a dropped connection (not just a bad HTTP status) —
      // a real risk on a large video upload over a flaky connection. Without this catch,
      // that throw skipped straight past setUploading(false) below and left the UI
      // stuck showing "uploading" forever with no error, which is indistinguishable from
      // a hang.
      let res: Response;
      try {
        res = await fetch("/api/assets/upload", { method: "POST", body: fd });
      } catch {
        setError(
          `A conexão caiu durante o envio de ${file.name}. Verifique sua internet e tente de novo.`
        );
        continue;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Não foi possível enviar ${file.name}.`);
        continue;
      }
      if (body.deduped) dedupCount += 1;
      setAssets((prev) =>
        prev.some((a) => a.asset.id === body.asset.id)
          ? prev
          : [
              ...prev,
              {
                asset: body.asset,
                deduped: body.deduped,
                warnings: body.warnings ?? [],
                converted: body.converted,
              },
            ]
      );
      if (body.asset.media_kind === "video") {
        // Mirrors toggleTextOnly's deselect below: a video just became this post's only
        // asset, so any selected channel that can't publish video has to go.
        deselectIncompatible(supportsVideo);
      }
    }
    if (dedupCount > 0) {
      // "file", not "image" — a video dedupes the same way, by content hash.
      const noun = dedupCount === 1 ? "file" : "files";
      setNotice(`${dedupCount} ${noun} already existed (matched by content) — reused, not duplicated.`);
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  function removeAsset(id: number) {
    const removed = assets.find((a) => a.asset.id === id);
    setAssets((prev) => prev.filter((a) => a.asset.id !== id));
    if (removed?.asset.media_kind === "video") {
      // The Reel chip disappears once hasVideo goes false, but an ALREADY-picked reel
      // target would otherwise survive the removal and be submitted invisibly — mirrors
      // toggleTextOnly's story-target pruning below. (The worker's _validate refuses a
      // stale reel target terminally too, but pruning it here keeps the UI honest about
      // what's actually selected.)
      setTargets((prev) => prev.filter((t) => t.surface !== "reel"));
    }
  }

  function toggleTextOnly(next: boolean) {
    setTextOnly(next);
    // Deselect any already-selected channel that can't take a text-only post — leaving
    // it selected-but-disabled would submit a target that cannot work.
    if (next) {
      deselectIncompatible(supportsText);
      // A text post has no media, so it has nothing a Story or a Reel could show — hasVideo
      // flips false the same way it would if the video itself were removed (see
      // removeAsset), so both chips hide. An ALREADY-picked story/reel target would
      // otherwise survive the switch and be submitted invisibly.
      setTargets((prev) => prev.filter((t) => t.surface !== "story" && t.surface !== "reel"));
    }
  }

  const anyApprovalNeeded = channels.some(
    (c) => selectedChannelIds.has(c.id) && c.requires_approval
  );

  async function submit() {
    setError(null);
    if (textOnly) {
      if (!caption.trim()) return setError("Escreva uma legenda para o post de texto.");
    } else if (assets.length === 0) {
      return setError("Adicione ao menos uma imagem.");
    }
    if (overCaptionLimit) {
      const names = allCaptionChecks
        .filter((c) => c.length > c.limit)
        .map((c) => (c.channel ? `${c.channel.account_name} (${c.length}/${c.limit})` : `${c.limit}-character limit`))
        .join(", ");
      return setError(`Legenda acima do limite para: ${names}.`);
    }
    if (effectiveTargets.length === 0) return setError("Selecione ao menos uma conta.");
    if (!postNow && !scheduledLocal) return setError("Escolha uma data e hora.");

    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caption,
        first_comment: firstComment,
        post_type: textOnly ? "text" : undefined,
        asset_ids: textOnly ? [] : assets.map((a) => a.asset.id),
        targets: effectiveTargets,
        ...(postNow ? { post_now: true } : { scheduled_local: scheduledLocal }),
        timezone,
        content_kind: contentKind,
        caption_variants: captionVariantsPayload,
        period_links: periodLinksPayload,
        tag_ids: tagIds,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Não foi possível agendar a publicação.");
      return;
    }
    startSubmit(() => router.push("/"));
  }

  async function saveDraft() {
    setError(null);
    if (textOnly) {
      if (!caption.trim()) return setError("Escreva uma legenda para o post de texto.");
    } else if (assets.length === 0) {
      return setError("Adicione ao menos uma imagem para salvar um rascunho.");
    }
    const res = await fetch("/api/posts/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caption,
        first_comment: firstComment,
        post_type: textOnly ? "text" : undefined,
        asset_ids: textOnly ? [] : assets.map((a) => a.asset.id),
        content_kind: contentKind,
        content_status: libraryStatus,
        targets: effectiveTargets,
        caption_variants: captionVariantsPayload,
        period_links: periodLinksPayload,
        tag_ids: tagIds,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Não foi possível salvar o rascunho.");
      return;
    }
    startSubmit(() => router.push("/library"));
  }

  const label = "block text-xs font-medium text-ink-soft mb-1.5";
  const fieldCls =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-brand";
  const segBtn = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm transition-colors ${
      active ? "bg-brand-weak font-medium text-brand-strong" : "text-muted hover:text-ink"
    }`;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      {/* ---- Builder ---- */}
      <div className="space-y-6">
        {/* Text only toggle */}
        <section className="flex items-center justify-between rounded-card border border-border bg-surface p-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-ink">Só texto</h3>
            <p className="text-xs text-muted">
              Escreva uma legenda sem imagem — só contas que suportam posts de texto podem
              ser escolhidas.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-soft">
            <input
              type="checkbox"
              checked={textOnly}
              onChange={(e) => toggleTextOnly(e.target.checked)}
            />
            {textOnly ? "Ligado" : "Desligado"}
          </label>
        </section>

        {/* Images / video */}
        {!textOnly ? (
          <section className="rounded-card border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-ink">
                {hasVideo ? "Vídeo" : "Imagens"}
                <span className="data ml-2 text-xs font-normal text-faint">{postType}</span>
              </h3>
              <button
                onClick={() => fileInput.current?.click()}
                disabled={hasVideo}
                className="rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? "Enviando…" : "Adicionar mídia"}
              </button>
              {/* The accept list names extensions ALONGSIDE the MIME types on purpose: a
                  file picker matches MIME entries against the type the OS reports, and a
                  Windows machine with nothing registered for .webp reports none — greying
                  out files this app accepts perfectly well. See lib/upload-mime.ts. */}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.jpg,.jpeg,.png,.webp,.mp4,.mov"
                multiple
                hidden
                onChange={(e) => onFiles(e.target.files)}
              />
            </div>

            {assets.length === 0 ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onFiles(e.dataTransfer.files);
                }}
                className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-sm text-muted"
              >
                Arraste imagens ou um vídeo aqui, ou use <span className="text-ink-soft">Adicionar mídia</span>.
                <br />
                <span className="text-xs text-faint">
                  A deduplicação é por conteúdo — o mesmo arquivo não é guardado duas vezes. Um
                  único vídeo vira um Reel; não pode ser misturado com imagens.
                </span>
              </div>
            ) : hasVideo ? (
              <div className="max-w-xs space-y-2">
                <CoverFramePicker asset={assets[0].asset} />
                {assets[0].converted ? (
                  <p className="inline-block rounded bg-accent-weak px-1.5 py-0.5 text-[11px] font-medium text-accent-strong">
                    Convertido para {assets[0].converted.to} para o Instagram aceitar. Seu
                    original permanece intacto.
                  </p>
                ) : null}
                {assets[0].warnings.length > 0 ? (
                  <ul className="space-y-1">
                    {assets[0].warnings.map((w, i) => (
                      <li key={i} className="text-xs font-medium text-accent-strong">
                        {w}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeAsset(assets[0].asset.id)}
                  className="text-xs font-medium text-status-failed hover:underline"
                >
                  Remover vídeo
                </button>
              </div>
            ) : (
              <div>
                <p className="mb-2 text-xs text-muted">
                  Arraste para reordenar — esta é a ordem do carrossel.
                </p>
                <SlideReorder
                  slides={assets.map((a): Slide => ({
                    assetId: a.asset.id,
                    label: a.asset.original_filename ?? undefined,
                  }))}
                  onReorder={(next) =>
                    // SlideReorder only knows slide order (by assetId) — translate that
                    // back into the composer's own UploadedAsset[] so the rest of the
                    // component (upload metadata, warnings, conversion notices) rides
                    // along unchanged.
                    setAssets((prev) =>
                      next.map((s) => prev.find((a) => a.asset.id === s.assetId)!)
                    )
                  }
                  onRemove={removeAsset}
                  // Per-image framing review only applies to images (video never reaches
                  // this branch — hasVideo renders CoverFramePicker instead), so it stays
                  // composer-side rather than being baked into the shared component.
                  renderExtra={(slide) => {
                    const a = assets.find((x) => x.asset.id === slide.assetId);
                    // Unconditional: gating on needs_review hid the control once a choice
                    // was made, which is half of the one-way bug. A just-uploaded image has
                    // no sends yet, so the count defaults to 0.
                    return a ? (
                      <FramingButton
                        asset={a.asset}
                      />
                    ) : null;
                  }}
                />
              </div>
            )}
            {notice ? <p className="mt-3 text-xs text-brand-strong">{notice}</p> : null}
          </section>
        ) : null}

        {/* Content kind */}
        <section className="rounded-card border border-border bg-surface p-5">
          <h3 className="mb-1 font-display text-sm font-semibold text-ink">Tipo</h3>
          <p className="mb-3 text-xs text-muted">
            Evergreen recicla ao longo do tempo. Uma vez posta uma única vez por conta, depois se aposenta.
          </p>
          <div className="inline-flex rounded-lg border border-border p-0.5">
            <button
              type="button"
              className={segBtn(contentKind === "evergreen")}
              onClick={() => setContentKind("evergreen")}
            >
              Evergreen
            </button>
            <button
              type="button"
              className={segBtn(contentKind === "one_time")}
              onClick={() => setContentKind("one_time")}
            >
              Uma vez
            </button>
          </div>
        </section>

        {/* Caption + first comment */}
        <section className="rounded-card border border-border bg-surface p-5 space-y-4">
          <CaptionVariantsEditor value={variants} onChange={setVariants} postType={postType} />
          {/* TikTok takes the video and nothing else — say so beside the caption box
              rather than letting the phone deliver the surprise. */}
          <TikTokCaptionNotice channels={selectedChannels} caption={caption} />
          {worstCaptionCheck ? (
            <p
              className={`text-xs ${
                overCaptionLimit ? "font-medium text-accent-strong" : "text-muted"
              }`}
            >
              {worstCaptionCheck.length} / {worstCaptionCheck.limit} caracteres
              {worstCaptionCheck.channel ? ` para ${platformLabel(worstCaptionCheck.channel.platform)}` : ""}
              {overCaptionLimit ? " — acima do limite de uma conta selecionada." : ""}
            </p>
          ) : null}
          <div>
            <div className="flex items-center justify-between gap-2">
              <label className={label}>
                Primeiro comentário{" "}
                <span className="font-normal text-faint">
                  (postado automaticamente após publicar — bom para hashtags)
                </span>
              </label>
              <EmojiPicker onInsert={insertFirstCommentEmoji} />
            </div>
            <textarea
              ref={firstCommentRef}
              className={`${fieldCls} min-h-16 resize-y`}
              placeholder="#hashtags #vai #aqui"
              value={firstComment}
              onChange={(e) => setFirstComment(e.target.value)}
            />
          </div>
        </section>

        {/* Channels */}
        <section className="rounded-card border border-border bg-surface p-5">
          <h3 className="mb-1 font-display text-sm font-semibold text-ink">
            Para onde isso vai?
          </h3>
          <p className="mb-3 text-xs text-muted">
            Escolha as contas. Cada uma recebe seu próprio envio agendado — e no Instagram,
            Feed e Story são envios separados que você pode escolher de forma independente.
          </p>
          <ChannelSurfacePicker
            channels={channels}
            value={effectiveTargets}
            onChange={setTargets}
            textOnly={textOnly}
            hasVideo={hasVideo}
            slideCount={assets.length}
            assets={assets.map((a) => ({
              width: a.asset.width,
              height: a.asset.height,
              duration_ms: a.asset.duration_ms,
              // byte_size/publish_path/conform_mode: without these the CHIP checked a
              // narrower shape than the PRUNE above (effectiveTargets, which already
              // reads the full asset row) — a 400MB video could render its chip enabled
              // while every click on it silently did nothing. Also lets
              // destinationDisabledReason tell an out-of-spec original from one that's
              // already been conformed for the feed (see lib/media-limits.ts).
              byte_size: a.asset.byte_size,
              publish_path: a.asset.publish_path,
              conform_mode: a.asset.conform_mode,
            }))}
            postNow={postNow}
          />
        </section>

        {/* Schedule */}
        <section className="rounded-card border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-ink">Agendamento</h3>
            <div className="inline-flex rounded-lg border border-border p-0.5">
              <button
                type="button"
                className={segBtn(!postNow)}
                onClick={() => setPostNow(false)}
              >
                Agendar
              </button>
              <button
                type="button"
                className={segBtn(postNow)}
                onClick={() => setPostNow(true)}
              >
                Postar agora
              </button>
            </div>
          </div>

          {!postNow ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>Data e hora</label>
                <input
                  type="datetime-local"
                  className={fieldCls}
                  value={scheduledLocal}
                  onChange={(e) => setScheduledLocal(e.target.value)}
                />
              </div>
              <div>
                <label className={label}>Fuso horário</label>
                <TimezonePicker
                  value={timezone}
                  onChange={setTimezone}
                  onValidityChange={setTzValid}
                  className={fieldCls}
                />
              </div>
            </div>
          ) : (
            <PostNowReadinessNotice readiness={readiness} />
          )}
        </section>

        <PeriodAttach periods={periods} value={periodModes} onChange={setPeriodModes} />

        <section className="rounded-card border border-border bg-surface p-5">
          <h3 className="mb-2 font-display text-sm font-semibold text-ink">Etiquetas</h3>
          <TagEditor
            timeOfDayTags={timeOfDayTags}
            topicTags={topicTags}
            value={tagIds}
            onChange={setTagIds}
          />
        </section>

        {error ? (
          <p className="rounded-lg bg-accent-weak px-3 py-2 text-sm text-accent-strong">{error}</p>
        ) : null}
      </div>

      {/* ---- Live preview (sticky) ---- */}
      <div className="lg:sticky lg:top-6 self-start space-y-4">
        {/* Both surfaces, at their real shapes. Replaces a fixed aspect-square,
            object-cover box fed from `/api/media/{id}` with no variant — i.e. the
            untouched ORIGINAL, CSS-cropped to a shape Instagram never publishes. See
            post-preview.tsx's header for why that was worse than showing nothing. */}
        <PostPreview
          assets={assets.map((a) => a.asset)}
          caption={caption}
          firstComment={firstComment}
          textOnly={textOnly}
        />

        {/* When, before where. The date & time controls live far down the left column,
            below the fold — arriving from the calendar's empty-day "+" the date is already
            filled in, but nothing on the first screen said so, which is no better than
            having to remember it. This card is visible the moment the page loads. */}
        <div className="rounded-card border border-border bg-surface p-4">
          <p className="mb-2 text-xs font-medium text-ink-soft">Quando</p>
          {postNow ? (
            <p className="text-sm text-ink">Assim que você clicar em Postar agora</p>
          ) : whenLabel ? (
            <>
              <p className="text-sm text-ink">{whenLabel}</p>
              <p className="data mt-0.5 text-[11px] text-faint">{timezone}</p>
            </>
          ) : (
            <p className="text-xs text-faint">Nenhuma data escolhida ainda.</p>
          )}
        </div>

        <div className="rounded-card border border-border bg-surface p-4">
          <p className="mb-2 text-xs font-medium text-ink-soft">Indo para</p>
          {effectiveTargets.length === 0 ? (
            <p className="text-xs text-faint">Nenhuma conta selecionada ainda.</p>
          ) : (
            <ul className="space-y-1.5">
              {channels
                .filter((c) => selectedChannelIds.has(c.id))
                .map((c) => {
                  return (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <ChannelAvatar
                        id={c.id}
                        name={c.account_name}
                        colorHue={c.color_hue}
                        avatarPath={c.avatar_path}
                        size={14}
                      />
                      <span className="text-ink">{c.account_name}</span>
                    </li>
                  );
                })}
            </ul>
          )}
          {anyApprovalNeeded ? (
            <p className="mt-3 rounded bg-surface-sunken px-2 py-1.5 text-[11px] text-muted">
              {postNow
                ? "Uma ou mais contas exigem aprovação — Postar agora pula essa etapa."
                : "Uma ou mais contas exigem aprovação — esses envios esperam até serem aprovados."}
            </p>
          ) : null}
        </div>

        <button
          onClick={submit}
          disabled={submitting || overCaptionLimit || (!postNow && !tzValid)}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-ink disabled:opacity-50"
        >
          {submitting ? (postNow ? "Enviando…" : "Agendando…") : postNow ? "Postar agora" : "Agendar publicação"}
        </button>
        <div className="rounded-card border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink-soft">Status na biblioteca</p>
            <div className="inline-flex rounded-lg border border-border p-0.5">
              <button
                type="button"
                className={segBtn(libraryStatus === "draft")}
                onClick={() => setLibraryStatus("draft")}
              >
                Rascunho
              </button>
              <button
                type="button"
                className={segBtn(libraryStatus === "ready")}
                onClick={() => setLibraryStatus("ready")}
              >
                Pronto
              </button>
            </div>
          </div>
          <p className="text-[11px] text-faint">
            Conteúdo pronto é elegível para preenchimento automático; rascunhos não são.
          </p>
        </div>
        <button
          onClick={saveDraft}
          disabled={submitting}
          className="w-full rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-sunken disabled:opacity-50"
        >
          Salvar na biblioteca
        </button>
        <p className="text-center text-[11px] text-faint">
          Rascunhos ficam na Agendamento em Massa — agende em lote ou reaproveite quando quiser.
        </p>
      </div>
    </div>
  );
}
