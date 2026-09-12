import { NextRequest, NextResponse } from "next/server";
import { createDraftPostsBulk, getAsset, getChannel, getPeriod, listTags } from "@/lib/queries";
import type { ContentKind, ContentStatus } from "@/lib/types";
import { parsePeriodLinks, parseTagIds } from "@/lib/content-model-validation";
import { captionLimitError } from "@/lib/caption-limits";
import { feedTargets } from "@/lib/story-fanout";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const ownerId = viewer.is_admin ? null : viewer.id;
  const body = await req.json().catch(() => ({}));

  // --- items (one per image) ---
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "Adicione ao menos uma imagem." }, { status: 400 });
  }
  if (body.items.length > 100) {
    return NextResponse.json({ error: "Um lote pode ter no máximo 100 imagens." }, { status: 400 });
  }
  const items: { asset_id: number; caption: string }[] = [];
  for (const it of body.items) {
    const assetId = Number(it?.asset_id);
    const asset = Number.isInteger(assetId) ? getAsset(assetId) : undefined;
    if (!asset || (ownerId !== null && asset.owner_user_id !== ownerId)) {
      return NextResponse.json({ error: `Arquivo desconhecido ${it?.asset_id}.` }, { status: 400 });
    }
    if (it.caption !== undefined && typeof it.caption !== "string") {
      return NextResponse.json({ error: "caption deve ser uma string." }, { status: 400 });
    }
    items.push({ asset_id: assetId, caption: typeof it.caption === "string" ? it.caption : "" });
  }

  // --- shared defaults (same rules as /api/posts/draft) ---
  let contentKind: ContentKind | undefined;
  if (body.content_kind !== undefined) {
    if (body.content_kind !== "evergreen" && body.content_kind !== "one_time") {
      return NextResponse.json({ error: "content_kind inválido." }, { status: 400 });
    }
    contentKind = body.content_kind;
  }

  let contentStatus: ContentStatus | undefined;
  if (body.content_status !== undefined) {
    if (body.content_status !== "draft" && body.content_status !== "ready") {
      return NextResponse.json({ error: "content_status inválido." }, { status: 400 });
    }
    contentStatus = body.content_status;
  }

  let targetChannelIds: number[] | undefined;
  if (body.target_channel_ids !== undefined) {
    if (!Array.isArray(body.target_channel_ids)) {
      return NextResponse.json({ error: "target_channel_ids inválido." }, { status: 400 });
    }
    for (const cid of body.target_channel_ids) {
      const ch = typeof cid === "number" ? getChannel(cid) : undefined;
      if (!ch || (ownerId !== null && ch.owner_user_id !== ownerId)) {
        return NextResponse.json({ error: `Conta desconhecida ${cid}.` }, { status: 400 });
      }
    }
    targetChannelIds = body.target_channel_ids;
  }

  // Same check the other creation routes make. Each item becomes its own 'single' post
  // with its own caption as the (only) generic variant — if target_channel_ids is set
  // and content_status ends up "ready", this post is immediately autofill-eligible, so
  // an over-limit caption must be rejected here rather than silently created and left
  // for autofill to skip forever.
  if (targetChannelIds) {
    const targetChannels = targetChannelIds.map((cid) => getChannel(cid)!);
    for (const item of items) {
      const captionError = captionLimitError(targetChannels, [], item.caption, "single");
      if (captionError) {
        return NextResponse.json(
          { error: `Asset ${item.asset_id}: ${captionError}` },
          { status: 400 }
        );
      }
    }
  }

  const validTagIds = new Set(listTags(undefined, ownerId).map((t) => t.id));
  const tagIds = parseTagIds(body.tag_ids, (id) => validTagIds.has(id));
  if (tagIds === "invalid") {
    return NextResponse.json({ error: "tag_ids inválido." }, { status: 400 });
  }

  const periodLinks = parsePeriodLinks(body.period_links, (pid) => {
    const p = getPeriod(pid);
    return p && (ownerId === null || p.owner_user_id === ownerId) ? p : undefined;
  });
  if (periodLinks === "invalid") {
    return NextResponse.json({ error: "period_links inválido." }, { status: 400 });
  }

  const ids = createDraftPostsBulk(items, {
    targets: targetChannelIds ? feedTargets(targetChannelIds) : undefined,
    content_kind: contentKind,
    content_status: contentStatus,
    tag_ids: tagIds ?? undefined,
    period_links: periodLinks ?? undefined,
  }, ownerId);
  return NextResponse.json({ created: ids.length }, { status: 201 });
}
