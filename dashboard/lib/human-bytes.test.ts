import assert from "node:assert/strict";
import { test } from "node:test";
import { humanBytes } from "./format";

test("humanBytes renders null as an em dash", () => {
  assert.equal(humanBytes(null), "—");
});

test("humanBytes stays in bytes under 1 KB", () => {
  assert.equal(humanBytes(512), "512 B");
});

test("humanBytes switches to KB under 1 MB", () => {
  assert.equal(humanBytes(2048), "2 KB");
});

test("humanBytes switches to MB under 1 GB", () => {
  assert.equal(humanBytes(5 * 1024 * 1024), "5.0 MB");
});

test("humanBytes switches to GB at 1 GB and above", () => {
  // The disk-usage banner is the reason this tier exists: a near-full multi-GB volume
  // read as an ugly, hard-to-parse "17941.3 MB" before this.
  assert.equal(humanBytes(1024 * 1024 * 1024), "1.0 GB");
  assert.equal(humanBytes(17941 * 1024 * 1024), "17.5 GB");
});
