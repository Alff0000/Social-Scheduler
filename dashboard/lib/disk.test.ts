import assert from "node:assert/strict";
import { test } from "node:test";
import { usageFromStatfs, diskBannerLevel } from "./disk";

test("usageFromStatfs computes percent used from block counts", () => {
  const usage = usageFromStatfs({ bsize: 4096, blocks: 125000, bavail: 1250 });
  assert.equal(usage.totalBytes, 4096 * 125000);
  assert.equal(usage.freeBytes, 4096 * 1250);
  assert.ok(usage.usedPercent > 98 && usage.usedPercent < 100);
});

test("usageFromStatfs handles a mostly-empty disk", () => {
  const usage = usageFromStatfs({ bsize: 4096, blocks: 125000, bavail: 120000 });
  assert.ok(usage.usedPercent < 5);
});

test("usageFromStatfs never divides by zero on a bogus zero-block report", () => {
  const usage = usageFromStatfs({ bsize: 4096, blocks: 0, bavail: 0 });
  assert.equal(usage.usedPercent, 0);
});

test("diskBannerLevel is none below 75%", () => {
  assert.equal(diskBannerLevel(0), "none");
  assert.equal(diskBannerLevel(74.9), "none");
});

test("diskBannerLevel is warn from 75% up to (not including) 90%", () => {
  assert.equal(diskBannerLevel(75), "warn");
  assert.equal(diskBannerLevel(89.9), "warn");
});

test("diskBannerLevel is critical at 90% and above", () => {
  assert.equal(diskBannerLevel(90), "critical");
  assert.equal(diskBannerLevel(100), "critical");
});
