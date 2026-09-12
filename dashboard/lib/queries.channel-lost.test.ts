import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb } from "../test/helpers.ts";

// See queries.groups.test.ts: node --test gives each FILE its own process, but lib/db.ts
// memoises its connection, so every setup() in this file shares the first temp DB. Hence
// the per-setup prefix to keep fixtures from colliding.
let setupSeq = 0;

async function setup() {
  makeTestDb();
  const q = await import("./queries.ts");
  const db = (await import("./db.ts")).getDb();
  return { q, db, prefix: `t${++setupSeq}` };
}

test("getLostChannels is empty until the worker marks a channel lost", async () => {
  const { q, prefix } = await setup();
  const id = q.createChannel({
    platform: "instagram", account_name: `${prefix}-a`, timezone: "UTC",
    remote_account_id: `${prefix}-a`, access_token: "tok",
  }, null);

  assert.equal(q.getLostChannels(null).find((c) => c.id === id), undefined);
});

test("getLostChannels lists a marked channel, most recent first", async () => {
  const { q, db, prefix } = await setup();
  const older = q.createChannel({
    platform: "instagram", account_name: `${prefix}-older`, timezone: "UTC",
    remote_account_id: `${prefix}-older`, access_token: "tok",
  }, null);
  const newer = q.createChannel({
    platform: "instagram", account_name: `${prefix}-newer`, timezone: "UTC",
    remote_account_id: `${prefix}-newer`, access_token: "tok",
  }, null);
  // Mirrors exactly what worker/publisher.py writes on an OAuthException (code 190) —
  // see migration 0038.
  db.prepare("UPDATE channels SET lost_at = ?, lost_reason = ? WHERE id = ?")
    .run("2026-09-01T00:00:00.000Z", "Error validating access token", older);
  db.prepare("UPDATE channels SET lost_at = ?, lost_reason = ? WHERE id = ?")
    .run("2026-09-10T00:00:00.000Z", "Error validating access token", newer);

  const lost = q.getLostChannels(null).filter((c) => c.id === older || c.id === newer);
  assert.deepEqual(lost.map((c) => c.id), [newer, older], "most recently lost first");
  assert.equal(lost[0].lost_reason, "Error validating access token");
});

test("getLostChannels scopes to the owner, admin sees every owner's", async () => {
  const { q, db, prefix } = await setup();
  const ownerAId = Number(
    db.prepare("INSERT INTO users (email, password_hash, is_admin) VALUES (?, 'x', 0)")
      .run(`${prefix}-a@test.dev`).lastInsertRowid,
  );

  const chanA = q.createChannel({
    platform: "instagram", account_name: `${prefix}-chanA`, timezone: "UTC",
    remote_account_id: `${prefix}-chanA`, access_token: "tok",
  }, ownerAId);
  db.prepare("UPDATE channels SET lost_at = ?, lost_reason = ? WHERE id = ?")
    .run("2026-09-10T00:00:00.000Z", "Error validating access token", chanA);

  assert.equal(q.getLostChannels(ownerAId).some((c) => c.id === chanA), true);
  assert.equal(q.getLostChannels(999999).some((c) => c.id === chanA), false, "a different owner never sees it");
  assert.equal(q.getLostChannels(null).some((c) => c.id === chanA), true, "admin (null) sees every owner's");
});

test("saving a fresh access_token clears lost_at and lost_reason", async () => {
  const { q, db, prefix } = await setup();
  const id = q.createChannel({
    platform: "instagram", account_name: `${prefix}-recon`, timezone: "UTC",
    remote_account_id: `${prefix}-recon`, access_token: "old-tok",
  }, null);
  db.prepare("UPDATE channels SET lost_at = ?, lost_reason = ? WHERE id = ?")
    .run("2026-09-01T00:00:00.000Z", "Error validating access token", id);
  assert.equal(q.getLostChannels(null).some((c) => c.id === id), true, "sanity: it starts marked lost");

  // The exact call the Channels page's token-paste and the OAuth reconnect flow both
  // already make — see updateChannel's own comment for why clearing lives here rather
  // than at every caller.
  q.updateChannel(id, { access_token: "new-tok" });

  const row = q.getChannel(id);
  assert.equal(row?.lost_at, null);
  assert.equal(row?.lost_reason, null);
  assert.equal(q.getLostChannels(null).some((c) => c.id === id), false);
});

test("clearing access_token to null does not itself mark a channel lost or unlost", async () => {
  const { q, prefix } = await setup();
  const id = q.createChannel({
    platform: "instagram", account_name: `${prefix}-cleared`, timezone: "UTC",
    remote_account_id: `${prefix}-cleared`, access_token: "tok",
  }, null);
  // A falsy access_token (disconnecting on purpose) must not trigger the "fresh token"
  // auto-clear — there is no fresh token here to justify treating the channel as fixed.
  q.updateChannel(id, { access_token: null });
  const row = q.getChannel(id);
  assert.equal(row?.lost_at, null, "was never marked lost, and clearing the token doesn't mark it either");
});

test("a caller that explicitly sets lost_at itself is not overridden by the auto-clear", async () => {
  const { q, prefix } = await setup();
  const id = q.createChannel({
    platform: "instagram", account_name: `${prefix}-explicit`, timezone: "UTC",
    remote_account_id: `${prefix}-explicit`, access_token: "tok",
  }, null);
  q.updateChannel(id, { access_token: "new-tok", lost_at: "2026-09-11T00:00:00.000Z", lost_reason: "manual" });
  const row = q.getChannel(id);
  assert.equal(row?.lost_at, "2026-09-11T00:00:00.000Z");
  assert.equal(row?.lost_reason, "manual");
});
