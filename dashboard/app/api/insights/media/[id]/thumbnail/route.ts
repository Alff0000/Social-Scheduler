import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { resolveInsideStore } from "@/lib/asset-files";
import { avatarContentType } from "@/lib/avatar-files";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Serve the cached thumbnail for one synced post.
 *
 * Directly mirrors app/api/channels/[id]/avatar/route.ts, and for the same reason: the
 * platform's own thumbnail URLs are short-lived signed CDN links, so hotlinking them
 * produces a table of broken images a few weeks later. The worker keeps a copy
 * (worker/thumbnails.py) and this serves it from our disk.
 *
 * A missing file is a 404, not an error. The worker may not have reached this post yet,
 * and for a post whose CDN link expired before we did there will never be one — both are
 * normal states the UI renders as a plain tinted square.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });
  const { id } = await params;
  const mediaId = Number(id);
  if (!Number.isInteger(mediaId)) {
    return NextResponse.json({ error: "Id inválido." }, { status: 400 });
  }

  // Joined to channels for the ownership check in one query, rather than a second
  // round trip through lib/ownership.ts's getRemoteMediaOwnerId.
  const row = getDb()
    .prepare(
      `SELECT rm.thumbnail_path AS thumbnail_path, c.owner_user_id AS owner_user_id
         FROM remote_media rm
         JOIN channels c ON c.id = rm.channel_id
        WHERE rm.id = ?`
    )
    .get(mediaId) as { thumbnail_path: string | null; owner_user_id: number | null } | undefined;

  if (!row || (!viewer.is_admin && row.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Sem miniatura." }, { status: 404 });
  }
  if (!row.thumbnail_path) {
    return NextResponse.json({ error: "Sem miniatura." }, { status: 404 });
  }

  // Guards against a stored path escaping the asset store via traversal — the value
  // comes from our own worker, but a serving route should not depend on that.
  const abs = resolveInsideStore(config.assetStorageDir, row.thumbnail_path);
  if (!abs) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }

  try {
    const buf = await fs.readFile(abs);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": avatarContentType(row.thumbnail_path),
        // A given post's thumbnail never changes, so this can cache hard. Private
        // because the dashboard is not public and these are the owner's own media.
        "Cache-Control": "private, max-age=86400",
        "Content-Length": String(buf.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo ausente no disco." }, { status: 404 });
  }
}
