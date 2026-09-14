import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { getSessionUser } from "@/lib/auth";
import { resolveUploadMime, IMAGE_EXT_BY_MIME } from "@/lib/upload-mime";
import { REEL_MIME_TYPES } from "@/lib/video-spec";
import { readVideoMeta, VideoParseError } from "@/lib/video-meta";
import { config } from "@/lib/config";
import { resolveFfmpeg } from "@/lib/video-convert";
import { converterAdvice } from "@/lib/converter-advice";
import { blurImageRegion, blurVideoRegion, clampRect, WatermarkError, type Rect } from "@/lib/watermark";
import { contentDisposition } from "@/lib/download-filename";

export const runtime = "nodejs";

/** Standalone tool, deliberately outside the asset/library data model: nothing here is
 *  saved, dedup'd or tracked — upload, blur one rectangle, hand back the file, done. */
export async function POST(req: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "Não conectado." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  const rawRect: Rect = {
    x: Number(form.get("x")),
    y: Number(form.get("y")),
    width: Number(form.get("width")),
    height: Number(form.get("height")),
  };
  if (!Object.values(rawRect).every((n) => Number.isFinite(n))) {
    return NextResponse.json({ error: "Marque a área da marca d'água antes de enviar." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = resolveUploadMime(file.type, buf);
  const isVideo = mime ? Boolean(REEL_MIME_TYPES[mime]) : false;
  const isImage = mime ? Boolean(IMAGE_EXT_BY_MIME[mime]) : false;
  if (!mime || (!isVideo && !isImage)) {
    return NextResponse.json(
      { error: "Só são aceitas imagens JPEG, PNG ou WebP, e vídeos MP4 ou MOV." },
      { status: 415 }
    );
  }

  const baseName = (file.name || "arquivo").replace(/\.[^./\\]+$/, "");

  if (isImage) {
    let out: Buffer;
    try {
      out = await blurImageRegion(buf, rawRect);
    } catch (err) {
      if (err instanceof WatermarkError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    // blurImageRegion re-encodes as jpeg unless the source was png/webp — sniff the
    // magic bytes it actually produced rather than re-deriving the same decision here.
    const outMime = resolveUploadMime("", out) ?? "image/jpeg";
    const ext = IMAGE_EXT_BY_MIME[outMime] ?? "jpg";
    return new NextResponse(new Uint8Array(out), {
      headers: {
        "Content-Type": outMime,
        "Content-Disposition": contentDisposition(`sem-marca-${baseName}.${ext}`),
      },
    });
  }

  const converter = config.videoConverter === "off" ? null : resolveFfmpeg();
  if (!converter) {
    return NextResponse.json(
      { error: `Remover marca d'água de vídeo precisa do ffmpeg. ${converterAdvice(process.platform)}` },
      { status: 422 }
    );
  }

  let meta;
  try {
    meta = readVideoMeta(buf);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof VideoParseError ? err.message : "Não foi possível ler esse vídeo." },
      { status: 422 }
    );
  }

  let rect: Rect;
  try {
    rect = clampRect(rawRect, meta.width, meta.height);
  } catch (err) {
    if (err instanceof WatermarkError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const stamp = `${crypto.randomUUID()}-${process.pid}`;
  const inputTmp = path.join(os.tmpdir(), `ss-watermark-in-${stamp}.mp4`);
  const outputTmp = path.join(os.tmpdir(), `ss-watermark-out-${stamp}.mp4`);
  const cleanup = () =>
    Promise.all([fs.rm(inputTmp, { force: true }), fs.rm(outputTmp, { force: true }) ]);

  await fs.writeFile(inputTmp, buf);
  try {
    await blurVideoRegion(inputTmp, outputTmp, rect, converter, config.videoConvertTimeoutMs);
    const out = await fs.readFile(outputTmp);
    return new NextResponse(new Uint8Array(out), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": contentDisposition(`sem-marca-${baseName}.mp4`),
      },
    });
  } catch (err) {
    if (err instanceof WatermarkError) {
      console.error("Watermark blur failed:", err.message);
      return NextResponse.json(
        { error: "Não foi possível processar esse vídeo — ele pode estar corrompido ou em um formato não suportado." },
        { status: 422 }
      );
    }
    throw err;
  } finally {
    await cleanup();
  }
}
