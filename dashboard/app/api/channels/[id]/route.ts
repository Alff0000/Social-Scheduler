import { NextRequest, NextResponse } from "next/server";
import {
  getChannel,
  getChannelGroup,
  updateChannel,
  setChannelGroup,
  setChannelFolder,
  upsertAutofillLane,
  listFolders,
} from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { isSurface } from "@/lib/story-fanout";
import type { Surface } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  const channelId = Number(id);
  const channel = getChannel(channelId);
  if (!channel || (!viewer.is_admin && channel.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }
  // A parsed JSON body genuinely has no known shape; every field below is validated
  // before use. Matches the .catch(() => ...) idiom the other routes use, and avoids an
  // explicit `any` for a value that is only ever read through those checks.
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "O corpo da requisição precisa ser um JSON válido." }, { status: 400 });
  }
  if (
    "color_hue" in body &&
    body.color_hue !== null &&
    (!Number.isInteger(body.color_hue) || body.color_hue < 0 || body.color_hue > 360)
  ) {
    return NextResponse.json(
      { error: "color_hue deve ser nulo ou um número inteiro entre 0 e 360." },
      { status: 400 }
    );
  }
  const fields: Record<string, unknown> = {};
  if (typeof body.account_name === "string") {
    const name = body.account_name.trim();
    // "" satisfies the column's NOT NULL and then renders as a blank chip with nothing
    // left to click, so the only way back would be SQL. Refuse it here.
    if (!name) {
      return NextResponse.json({ error: "O nome da conta não pode ficar vazio." }, { status: 400 });
    }
    fields.account_name = name;
  }
  if ("business_label" in body) fields.business_label = body.business_label || null;
  // `timezone` is intentionally NOT accepted here — it goes through
  // POST /api/channels/[id]/timezone, which also rebases the pending queue.
  if ("timezone" in body) {
    return NextResponse.json(
      { error: "Altere o fuso horário via POST /api/channels/[id]/timezone." },
      { status: 400 }
    );
  }
  if ("remote_account_id" in body) fields.remote_account_id = body.remote_account_id || null;
  if ("linked_page_id" in body) fields.linked_page_id = body.linked_page_id || null;
  if ("access_token" in body) fields.access_token = body.access_token || null;
  if ("requires_approval" in body) fields.requires_approval = body.requires_approval ? 1 : 0;
  if ("is_active" in body) fields.is_active = body.is_active ? 1 : 0;
  // Auto-fill config now lives per (owner, surface) in autofill_lanes, not in columns.
  // The body names its surface; a request without one predates lanes and means feed.
  //
  // An unrecognized surface is refused rather than read as feed. Coercing it wrote the
  // sending panel's cadence and depths onto the LIVE FEED lane — a typo like "stories"
  // silently reconfigured the wrong rotation, on a route that already answers 400 for a
  // bad color_hue and a stray timezone.
  if ("surface" in body && !isSurface(body.surface)) {
    return NextResponse.json(
      { error: 'surface must be one of "feed", "story" or "reel".' },
      { status: 400 }
    );
  }
  const surface: Surface = isSurface(body.surface) ? body.surface : "feed";
  const lane: Record<string, unknown> = {};
  if ("autofill_enabled" in body) lane.enabled = body.autofill_enabled ? 1 : 0;
  if ("cadence_config" in body) lane.cadence_config = body.cadence_config || null;
  if ("min_queue_depth" in body) lane.min_queue_depth = Number(body.min_queue_depth) || 0;
  if ("target_queue_depth" in body) lane.target_queue_depth = Number(body.target_queue_depth) || 0;
  if ("reuse_min_age_days" in body) lane.reuse_min_age_days = Number(body.reuse_min_age_days) || 0;
  if (Object.keys(lane).length > 0) {
    upsertAutofillLane({ kind: "channel", id: channelId }, surface, lane);
  }
  // Math.max(0, …) rather than a bare Number: this value divides slot positions,
  // and a negative would silently mean "off" while reading as if it were on.
  // Clamped to 1..100: 0 would ask for the top nothing-percent and silently suggest
  // nothing, which reads as broken rather than strict.
  for (const key of ["bpp_strong_pct", "bpp_broad_pct"] as const) {
    if (key in body) fields[key] = Math.min(100, Math.max(1, Math.trunc(Number(body[key]) || 1)));
  }
  if ("bpp_every_days" in body)
    fields.bpp_every_days = Math.max(0, Math.trunc(Number(body.bpp_every_days) || 0));
  if ("color_hue" in body) fields.color_hue = body.color_hue ?? null;

  // group_id goes through setChannelGroup() rather than the generic field writer,
  // because updateChannel()'s Partial<> type deliberately does not list it — assignment
  // is a membership change, not a field edit.
  if ("group_id" in body) {
    const gid = body.group_id === null || body.group_id === "" ? null : Number(body.group_id);
    // Not found AND wrong-owner both answer "Group not found" — same 404-style logic as
    // the channel guard above, so this never confirms another tenant's group exists.
    const group = gid !== null ? getChannelGroup(gid) : null;
    if (gid !== null && (!group || group.owner_user_id !== channel.owner_user_id)) {
      return NextResponse.json({ error: "Grupo não encontrado." }, { status: 400 });
    }
    setChannelGroup(channelId, gid);
  }

  // folder_id goes through setChannelFolder() for the same reason group_id does above:
  // it is a membership change to a separate organizational concept (migration 0030,
  // see Folder in lib/types.ts), not a plain column write.
  if ("folder_id" in body) {
    const fid = body.folder_id === null || body.folder_id === "" ? null : Number(body.folder_id);
    const folder = fid !== null ? listFolders(channel.owner_user_id).find((f) => f.id === fid) : null;
    if (fid !== null && !folder) {
      return NextResponse.json({ error: "Pasta não encontrada." }, { status: 400 });
    }
    setChannelFolder(channelId, fid);
  }

  updateChannel(channelId, fields);
  return NextResponse.json({ ok: true });
}
