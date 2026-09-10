/**
 * Uploading an image now also decides story_path, not just publish_path.
 *
 * The bug this guards: a Story target can be selected (components/channel-surface-picker.tsx)
 * and scheduled without ever opening the Framing dialog — toggling "Story" is a pure
 * client-side selection with no API call of its own. Before this fix, story_path stayed NULL
 * until (or unless) the Framing dialog ever wrote it, and worker/publisher.py's _resolve_rel
 * falls back to the untouched original whenever it is NULL — which could be a PNG/WebP,
 * exactly the format Instagram's Story endpoint (like its Feed photo endpoint) refuses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { makeTestDb } from "./helpers.ts";

makeTestDb();
const { config } = await import("../lib/config.ts");
const { POST } = await import("../app/api/assets/upload/route.ts");

async function upload(buf: Buffer, name: string, type: string) {
  const form = new FormData();
  form.append("file", new Blob([buf], { type }), name);
  const res = (await POST(
    new NextRequest("http://localhost:3939/api/assets/upload", { method: "POST", body: form })
  )) as unknown as Response;
  const json = await res.json();
  return { res, json };
}

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 20, g: 90, b: 160, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

test("an already-9:16 PNG upload gets a JPEG story_path immediately, no Framing dialog needed", async () => {
  // 1080x1920 is exactly 9:16 — needsStoryCanvas is false, so this is the "no reframe"
  // path the Story chip can reach purely by being toggled on, with nothing else touched.
  const { res, json } = await upload(await png(1080, 1920), "story-safe.png", "image/png");
  assert.equal(res.status, 200);
  assert.ok(json.asset.story_path, "story_path must be populated at upload time");

  const abs = path.join(config.assetStorageDir, json.asset.story_path);
  const meta = await sharp(abs).metadata();
  assert.equal(meta.format, "jpeg", "a PNG original must not be what a Story fallback serves");
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1920);
});

test("a landscape PNG that needs reframing is left without a story_path — that choice stays the owner's", async () => {
  // 1600x1200 is nowhere near 9:16 (needsStoryCanvas is true). The upload route must not
  // guess crop vs. blurred fill on the owner's behalf — only the Framing dialog does that.
  const { json } = await upload(await png(1600, 1200), "needs-reframe.png", "image/png");
  assert.equal(json.asset.story_path, null);
});

test("story_path and publish_path are independent derivatives, not the same file", async () => {
  const { json } = await upload(await png(1080, 1920), "independent.png", "image/png");
  assert.notEqual(json.asset.story_path, json.asset.publish_path);
  await fs.access(path.join(config.assetStorageDir, json.asset.story_path));
  await fs.access(path.join(config.assetStorageDir, json.asset.publish_path));
});
