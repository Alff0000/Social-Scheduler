/**
 * The one deliberately unauthenticated route: Meta downloads media from here at publish
 * time, when PUBLIC_ASSET_BASE_URL points at this app's own public URL rather than the
 * default per-publish Cloudflare tunnel (see app/api/public-assets/[...path]/route.ts's
 * own comment for the real deploy failure this exists to fix — Meta received this app's
 * login page, as HTML, instead of a video).
 *
 * The middleware exemption (middleware.ts) is exercised separately — this file is the
 * route handler itself: does it serve the right bytes, the right Content-Type, refuse a
 * traversal attempt, and 404 rather than fall through to anything HTML-shaped when the
 * file genuinely isn't there.
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
const { GET } = await import("../app/api/public-assets/[...path]/route.ts");

function req(url: string) {
  return new NextRequest(url);
}

async function callRoute(segments: string[]) {
  const url = `http://localhost:3939/api/public-assets/${segments.join("/")}`;
  return (await GET(req(url), { params: Promise.resolve({ path: segments }) })) as unknown as Response;
}

let seq = 0;

test("serves a top-level asset file (the exact shape worker._resolve_rel builds for an unconformed video) with the right Content-Type", async () => {
  const n = ++seq;
  const name = `pubasset${n}.mp4`;
  await fs.mkdir(config.assetStorageDir, { recursive: true });
  await fs.writeFile(path.join(config.assetStorageDir, name), Buffer.from("fake-mp4-bytes"));

  const res = await callRoute([name]);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "video/mp4");
  const body = Buffer.from(await res.arrayBuffer());
  assert.equal(body.toString(), "fake-mp4-bytes");
});

test("serves a nested conformed derivative (pub/<hash>.jpg)", async () => {
  const n = ++seq;
  const rel = `pub/pubasset${n}.jpg`;
  await fs.mkdir(path.join(config.assetStorageDir, "pub"), { recursive: true });
  const jpeg = await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 200, g: 10, b: 10 } },
  })
    .jpeg()
    .toBuffer();
  await fs.writeFile(path.join(config.assetStorageDir, rel), jpeg);

  const res = await callRoute(["pub", `pubasset${n}.jpg`]);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "image/jpeg");
});

test("a missing file is a real 404, never an HTML page", async () => {
  const res = await callRoute(["does-not-exist.mp4"]);
  assert.equal(res.status, 404);
  const contentType = res.headers.get("Content-Type") ?? "";
  assert.doesNotMatch(
    contentType, /text\/html/,
    "the real bug this route fixes: Meta receiving HTML instead of a 404/the asset"
  );
});

test("a traversal attempt is refused, not served from outside the asset store", async () => {
  // Guards against the exact path built from a hostile ".."-laden segment resolving
  // outside config.assetStorageDir — serveFile's shared guard, exercised through this
  // route specifically since it is the one reachable with no authentication at all.
  const res = await callRoute(["..", "..", "etc", "passwd"]);
  assert.notEqual(res.status, 200);
});

test("Range requests are honoured — Meta's video fetcher may request a video in ranges", async () => {
  const n = ++seq;
  const name = `pubasset-range${n}.mp4`;
  const bytes = Buffer.from("0123456789");
  await fs.mkdir(config.assetStorageDir, { recursive: true });
  await fs.writeFile(path.join(config.assetStorageDir, name), bytes);

  const r = new NextRequest(`http://localhost:3939/api/public-assets/${name}`, {
    headers: { Range: "bytes=2-5" },
  });
  const res = (await GET(r, { params: Promise.resolve({ path: [name] }) })) as unknown as Response;
  assert.equal(res.status, 206);
  const body = Buffer.from(await res.arrayBuffer());
  assert.equal(body.toString(), "2345");
});
