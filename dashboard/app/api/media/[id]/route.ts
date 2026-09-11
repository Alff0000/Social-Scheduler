import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import { contentDisposition, downloadFilename } from "@/lib/download-filename";
import { getAsset } from "@/lib/queries";
import { needsStoryCanvas, renderStoryCanvas, type StoryMode } from "@/lib/story-canvas";
import { conformImage, type ConformMode } from "@/lib/conform";
import { needsFeedConform } from "@/lib/feed-geometry";
import { serveFile } from "@/lib/serve-file";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/** Serve a stored asset (or its thumbnail) for in-dashboard preview only. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const asset = getAsset(Number(id));
  if (!asset || (!viewer.is_admin && asset.owner_user_id !== viewer.id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const variant = req.nextUrl.searchParams.get("variant");

  // Saving a copy to the viewer's computer. Deliberately placed ABOVE every variant branch
  // below, because a download means the ORIGINAL as uploaded — never the thumbnail, the
  // story canvas, or (for video) the H.264 derivative the preview substitutes so Chrome can
  // decode it. Those exist to make the browser show something; none of them is the file the
  // owner actually uploaded and is now asking for a copy of.
  //
  // Where the file lands is the browser's business, not ours. Content-Disposition is the
  // portable instruction: with "ask where to save each file" ticked it opens a save dialog,
  // and without it the file goes straight to Downloads. showSaveFilePicker() would have
  // given a dialog directly but is Chromium-only — it does not exist in Safari, so it would
  // silently do nothing for this install's owner.
  if (req.nextUrl.searchParams.get("download")) {
    const name = downloadFilename(asset.original_filename, asset.id, asset.storage_path);
    return serveFile(asset.storage_path, req, contentDisposition(name));
  }

  // A story canvas may not exist on disk yet. The framing dialog has to show BOTH options
  // before either is chosen, and generating a canvas for every upload would burn CPU and
  // disk on the many images that are never storied — so render on demand, then cache.
  if (variant === "story" && asset.media_kind === "image") {
    const requested = req.nextUrl.searchParams.get("mode");
    const mode: StoryMode =
      requested === "crop" || requested === "blurred" ? requested : asset.story_mode;

    // Already story-shaped: there is no canvas and the original IS the right answer —
    // the same rule the publish path applies (docs/design-story-canvas-and-framing.md §2).
    if (!needsStoryCanvas(asset.width ?? 0, asset.height ?? 0)) {
      return serveFile(asset.storage_path, req);
    }

    // Same naming as the story-framing route, so a preview and a committed choice share
    // one cached render rather than each keeping their own.
    const rel = `story/${asset.content_hash}-${mode}.jpg`;
    const abs = path.join(config.assetStorageDir, rel);
    try {
      await fs.access(abs);
    } catch {
      try {
        const original = await fs.readFile(
          path.join(config.assetStorageDir, asset.storage_path)
        );
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, await renderStoryCanvas(original, mode));
      } catch {
        return NextResponse.json(
          { error: "Could not render a story canvas for this image." },
          { status: 404 }
        );
      }
    }
    return serveFile(rel, req);
  }

  // A FEED derivative for a mode that has not been chosen yet. Exactly the same idea as
  // the story branch above, and it exists for the same reason: the framing dialog has to
  // show what Crop and Pad each look like BEFORE either is committed. Without it the only
  // way to see Pad was to save it, which is how framing got changed by accident just by
  // looking. Renders on demand, caches, and — the important part — never touches the asset
  // row: `pub/<hash>-<mode>.jpg` is deliberately a different path from the committed
  // `pub/<hash>.jpg`, so previewing cannot overwrite what is scheduled to publish.
  if (variant === "publish" && asset.media_kind === "image") {
    const requested = req.nextUrl.searchParams.get("mode");
    if (requested === "crop" || requested === "pad") {
      // In range means conformImage() resolves "none" and both modes produce identical
      // pixels — serve the committed derivative rather than render two copies of it.
      if (!needsFeedConform(asset.width, asset.height)) {
        return serveFile(asset.publish_path ?? asset.storage_path, req);
      }
      const mode: ConformMode = requested;
      const rel = `pub/${asset.content_hash}-${mode}.jpg`;
      const abs = path.join(config.assetStorageDir, rel);
      try {
        await fs.access(abs);
      } catch {
        try {
          const original = await fs.readFile(
            path.join(config.assetStorageDir, asset.storage_path)
          );
          const conformed = await conformImage(original, mode);
          await fs.mkdir(path.dirname(abs), { recursive: true });
          await fs.writeFile(abs, conformed.buffer);
        } catch {
          return NextResponse.json(
            { error: "Could not render a feed preview for this image." },
            { status: 404 }
          );
        }
      }
      return serveFile(rel, req);
    }
  }

  // Video defaults to the DERIVATIVE, not the original. An iPhone original is routinely
  // HEVC, which Chrome cannot decode (canPlayType('video/mp4; codecs="hvc1"') === "") —
  // the <video> element loads metadata, sizes itself correctly, and then paints nothing.
  // That silently broke every preview AND the cover-frame scrubber, so a cover could only
  // be chosen blind. The derivative is H.264 by construction (see lib/video-convert.ts),
  // and is also the smaller file. Falls back to the original when no derivative exists.
  const rel =
    asset.media_kind === "video"
      ? (asset.publish_path ?? asset.storage_path)
      : variant === "thumb" && asset.thumbnail_path
        ? asset.thumbnail_path
        : variant === "publish"
          ? (asset.publish_path ?? asset.storage_path)
          : asset.storage_path;

  return serveFile(rel, req);
}
