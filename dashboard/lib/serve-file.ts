import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

/**
 * Serve one stored file, with Range support.
 *
 * Shared by every route that hands back asset bytes — the dashboard's own authenticated
 * preview (app/api/media/[id]) and the public, unauthenticated route Meta downloads from
 * at publish time (app/api/public-assets/[...path]) — so Range handling (206, required
 * for a <video> to be seekable at all) and path-traversal guarding live in exactly one
 * place rather than risking the two drifting apart.
 *
 * `disposition`, when given, is the full Content-Disposition value and turns the response
 * from something rendered inline into something saved. Applied to the 206 as well as the
 * 200 so a resumed or ranged download keeps its filename.
 */
export async function serveFile(
  rel: string,
  req: NextRequest,
  disposition?: string
): Promise<NextResponse> {
  const base = path.resolve(config.assetStorageDir);
  const abs = path.resolve(base, rel);
  if (!abs.startsWith(base + path.sep)) {
    return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
  }

  try {
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).slice(1).toLowerCase();
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";

    // Range support (206 Partial Content) — required for <video> seeking to work at
    // all. Without Accept-Ranges + a real 206 response, Chromium reports the whole
    // media element as unseekable (seekable() stays [0,0] forever, even once the file
    // is fully buffered) rather than just seeking within what's downloaded so far.
    // Images never needed this (never seeked), but the cover-frame scrubber's whole
    // point is scrubbing a <video>, so this was a silent blocker for that feature
    // specifically. Harmless to apply to every variant, image or video — and Meta's own
    // video fetcher may issue ranged requests too for a large Reel upload.
    const range = req.headers.get("range");
    const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
    // Only a single-range header with at least one of start/end present is handled
    // here (per RFC 7233 §2.1/§3.1). An unparseable header (e.g. "bytes=abc") or a
    // multi-range header (e.g. "bytes=0-9,20-29") doesn't match this regex at all —
    // match stays null and we deliberately ignore the header, falling through to the
    // existing full-file 200 below, rather than rejecting with 416.
    if (match && (match[1] || match[2])) {
      const total = buf.length;
      // Suffix form ("bytes=-500" — last N bytes, RFC 7233 §2.1): match[1] is empty,
      // so `start` must count back from the end, not default to 0. Safari/QuickTime
      // use this form to fetch a trailing moov atom in .mov files.
      const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]));
      const end = match[1]
        ? match[2]
          ? Math.min(Number(match[2]), total - 1)
          : total - 1
        : total - 1;
      if (start >= total || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes */${total}` },
        });
      }
      return new NextResponse(buf.subarray(start, end + 1), {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=3600",
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(end - start + 1),
          ...(disposition ? { "Content-Disposition": disposition } : {}),
        },
      });
    }

    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        "Accept-Ranges": "bytes",
        "Content-Length": String(buf.length),
        ...(disposition ? { "Content-Disposition": disposition } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo ausente no disco." }, { status: 404 });
  }
}
