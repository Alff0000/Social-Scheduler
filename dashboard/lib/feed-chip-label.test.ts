import assert from "node:assert/strict";
import { test } from "node:test";
import { feedChipLabel } from "./platforms.ts";

test("an Instagram video's feed chip is labelled Reel, not Feed", () => {
  assert.equal(feedChipLabel("instagram", true), "Reel");
});

test("an Instagram image keeps the Feed label", () => {
  assert.equal(feedChipLabel("instagram", false), "Feed");
});

test("a Facebook video keeps the Feed label — it has a genuinely separate Reel surface", () => {
  assert.equal(feedChipLabel("facebook", true), "Feed");
});

test("every other platform's feed chip is unaffected by video", () => {
  for (const platform of ["facebook", "threads", "discord", "telegram", "tiktok"]) {
    assert.equal(feedChipLabel(platform, true), "Feed");
    assert.equal(feedChipLabel(platform, false), "Feed");
  }
});
