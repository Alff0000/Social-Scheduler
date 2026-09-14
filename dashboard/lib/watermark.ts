/**
 * Cover a rectangular region of an OWN photo or video with a heavy blur — the "Ferramentas"
 * watermark tool. This is deliberately NOT reconstruction: it never tries to guess what was
 * behind the mark, only obscures it, the same trade-off documented to the owner before this
 * was built. Runs entirely locally (sharp for images, ffmpeg for video) — no third-party API,
 * matching this project's "no cloud service without saying so first" rule.
 *
 * Pure of HTTP/route concerns, same spirit as video-convert.ts: paths and buffers in,
 * a buffer or a rejection out.
 */
import { execFile, type ExecFileException } from "node:child_process";
import fs from "node:fs";
import sharp from "sharp";
import type { ResolvedConverter } from "./video-convert";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class WatermarkError extends Error {}

/**
 * Clamp a client-supplied rectangle to the media's real dimensions. The picker draws this
 * box against whatever the browser decoded, but the request itself is just four numbers —
 * never trusted as already valid. A rectangle that would sit fully outside the frame
 * (negative size, or starting past an edge) is rejected outright rather than silently
 * clamped to nothing, which would blur a 0x0 box and report success on a no-op.
 */
export function clampRect(rect: Rect, mediaWidth: number, mediaHeight: number): Rect {
  const x = Math.max(0, Math.min(Math.round(rect.x), mediaWidth - 1));
  const y = Math.max(0, Math.min(Math.round(rect.y), mediaHeight - 1));
  const width = Math.max(1, Math.min(Math.round(rect.width), mediaWidth - x));
  const height = Math.max(1, Math.min(Math.round(rect.height), mediaHeight - y));
  if (width < 4 || height < 4) {
    throw new WatermarkError("A área marcada é pequena demais.");
  }
  return { x, y, width, height };
}

// Strong enough to make ordinary watermark text/logos unreadable without being a
// project-wide "how blurry" setting someone needs to tune — this tool has exactly one job.
const IMAGE_BLUR_SIGMA = 25;
// A bare "radius:power" sets BOTH luma and chroma to the same radius — and chroma_radius
// caps at 15 (luma alone allows up to 30), so 15 is the highest single value valid for
// both. Applying it 4 times (power) compensates for the lower radius so the result is
// still thoroughly illegible, not just softened.
const VIDEO_BOXBLUR = "15:4"; // radius:power

/**
 * Blur only `rect` of an image, leaving the rest byte-for-byte composited from the
 * original. Follows conform.ts's own normalize-before-metadata rule: rotate + strip to
 * sRGB and materialize BEFORE reading dimensions, since sharp's .metadata() reflects only
 * what has actually executed, not operations still queued on the pipeline.
 */
export async function blurImageRegion(input: Buffer, rect: Rect): Promise<Buffer> {
  const normalized = await sharp(input).rotate().toColourspace("srgb").toBuffer();
  const meta = await sharp(normalized).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new WatermarkError("Não foi possível ler as dimensões dessa imagem.");
  }
  const box = clampRect(rect, width, height);

  const blurredPatch = await sharp(normalized)
    .extract({ left: box.x, top: box.y, width: box.width, height: box.height })
    .blur(IMAGE_BLUR_SIGMA)
    .toBuffer();

  const format = meta.format === "png" || meta.format === "webp" ? meta.format : "jpeg";
  return sharp(normalized)
    .composite([{ input: blurredPatch, left: box.x, top: box.y }])
    .toFormat(format, format === "jpeg" ? { quality: 92, mozjpeg: true } : undefined)
    .toBuffer();
}

/**
 * Build the ffmpeg filter graph for blurring one rectangle: crop that region out of the
 * original, box-blur the crop, then overlay the blurred patch back at the same position.
 * Kept as a pure, exported function — same reasoning as video-convert.ts's own
 * buildArgs() — so the exact filter string is unit-testable without spawning ffmpeg.
 */
export function buildWatermarkArgs(input: string, output: string, rect: Rect): string[] {
  const { x, y, width, height } = rect;
  const filter =
    `[0:v]crop=${width}:${height}:${x}:${y},boxblur=${VIDEO_BOXBLUR}[wm];` +
    `[0:v][wm]overlay=${x}:${y}[out]`;
  return [
    "-y",
    "-nostdin",
    "-loglevel",
    "error",
    "-nostats",
    "-i",
    input,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-map",
    "0:a?",
    "-c:v",
    "h264",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    output,
  ];
}

const MAX_FFMPEG_BUFFER_BYTES = 64 * 1024 * 1024;

function cleanupPartial(output: string): void {
  try {
    fs.rmSync(output, { force: true });
  } catch {
    // best-effort — nothing further to do if this fails
  }
}

/**
 * Run ffmpeg to blur `rect` across every frame of the video at inputPath, writing the
 * result to outputPath. Mirrors video-convert.ts's convertVideo(): execFile (never a
 * shell), args as an array, partial output deleted on any failure.
 */
export function blurVideoRegion(
  inputPath: string,
  outputPath: string,
  rect: Rect,
  converter: ResolvedConverter,
  timeoutMs: number
): Promise<void> {
  const args = buildWatermarkArgs(inputPath, outputPath, rect);
  return new Promise<void>((resolve, reject) => {
    execFile(
      converter.bin,
      args,
      { timeout: timeoutMs, maxBuffer: MAX_FFMPEG_BUFFER_BYTES },
      (error: ExecFileException | null) => {
        if (error) {
          cleanupPartial(outputPath);
          reject(
            new WatermarkError(
              error.killed
                ? `ffmpeg excedeu o tempo limite de ${timeoutMs}ms`
                : `ffmpeg falhou: ${error.message}`
            )
          );
          return;
        }
        resolve();
      }
    );
  });
}
