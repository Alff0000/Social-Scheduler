import { NextRequest, NextResponse } from "next/server";
import {
  bulkCreatePublications,
  getCaptionVariants,
  getChannel,
  getPost,
  getPostAssets,
  IncompatiblePostTargetError,
  type BulkEntry,
} from "@/lib/queries";
import { intervalSlots } from "@/lib/scheduling";
import { incompatiblePostError } from "@/lib/platforms";
import { captionLimitError } from "@/lib/caption-limits";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Bulk-schedule N posts at a fixed interval to one or more channels.
 * Each channel gets its own slot sequence (computed in the channel's timezone):
 * post i lands in slot i.
 */
export async function POST(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const ownerId = viewer.is_admin ? null : viewer.id;

  const body = await req.json();
  const postIds: number[] = Array.isArray(body.post_ids) ? body.post_ids : [];
  const channelIds: number[] = Array.isArray(body.channel_ids) ? body.channel_ids : [];
  const everyDays = Number(body.every_days);
  const time: string = body.time || "";
  const startDate: string = body.start_date || ""; // "YYYY-MM-DD"

  if (postIds.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um post." }, { status: 400 });
  }
  if (channelIds.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos uma conta." }, { status: 400 });
  }
  if (!Number.isFinite(everyDays) || everyDays < 1) {
    return NextResponse.json({ error: "A frequência deve ser de ao menos 1 dia." }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: "Digite um horário no formato HH:MM." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "Escolha uma data de início." }, { status: 400 });
  }

  const channels = channelIds.map((cid) => getChannel(cid));
  // A channel that exists but belongs to someone else answers exactly like one that does
  // not exist at all — same convention as posts/targets/bulk/route.ts.
  const unknownChannelIdx = channels.findIndex(
    (c) => !c || (ownerId !== null && c.owner_user_id !== ownerId)
  );
  if (unknownChannelIdx !== -1) {
    return NextResponse.json({ error: `Conta desconhecida ${channelIds[unknownChannelIdx]}.` }, { status: 400 });
  }
  const targetChannels = channels.map((c) => c!);

  const posts = postIds.map((pid) => getPost(pid));
  const unknownPostIdx = posts.findIndex(
    (p) => !p || (ownerId !== null && p.owner_user_id !== ownerId)
  );
  if (unknownPostIdx !== -1) {
    return NextResponse.json({ error: `Post desconhecido ${postIds[unknownPostIdx]}.` }, { status: 400 });
  }
  // Per post, not just per post_type: two carousels can share a post_type but differ in
  // asset count, and this route never checked carousel size against maxCarousel at all
  // before — an oversized one used to sail through and fail terminally at publish.
  for (const post of posts) {
    const assetCount = post!.post_type === "carousel" ? getPostAssets(post!.id).length : 0;
    const compatError = incompatiblePostError(post!.post_type, assetCount, targetChannels);
    if (compatError) {
      return NextResponse.json({ error: compatError }, { status: 400 });
    }
    // Same reasoning as [id]/schedule/route.ts: this route creates real publications
    // immediately, so a caption too long for one of the selected channels must be
    // rejected here rather than scheduled and left to fail terminally at publish time.
    const variants = getCaptionVariants(post!.id).map((v) => ({ platform: v.platform, body: v.body }));
    const captionError = captionLimitError(targetChannels, variants, post!.caption, post!.post_type);
    if (captionError) {
      return NextResponse.json({ error: `Post ${post!.id}: ${captionError}` }, { status: 400 });
    }
  }

  const entries: BulkEntry[] = [];
  for (const channel of targetChannels) {
    const slots = intervalSlots(startDate, time, everyDays, postIds.length, channel.timezone);
    const status = channel.requires_approval ? "pending_approval" : "scheduled";
    postIds.forEach((postId, i) => {
      entries.push({ post_id: postId, channel_id: channel.id, scheduled_at: slots[i], status });
    });
  }

  try {
    const created = bulkCreatePublications(entries, ownerId);
    return NextResponse.json({ created }, { status: 201 });
  } catch (err) {
    if (err instanceof IncompatiblePostTargetError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
