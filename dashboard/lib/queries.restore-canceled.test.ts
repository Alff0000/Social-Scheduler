import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb } from "../test/helpers.ts";

async function setup() {
  makeTestDb();
  const q = await import("./queries.ts");
  const db = (await import("./db.ts")).getDb();
  const channelId = db
    .prepare(
      `INSERT INTO channels (platform, account_name, remote_account_id, access_token, timezone)
       VALUES ('instagram', 'Restore Test', 'IGRESTORE1', 'tok', 'UTC') RETURNING id`,
    )
    .get().id as number;
  return { q, db, channelId };
}

test("restoreCanceledPublication brings a canceled send back to scheduled, at the new time", async () => {
  const { q, db, channelId } = await setup();
  const postId = q.createDraftPost({
    caption: "was canceled", first_comment: "", asset_ids: [],
  }, null);
  const pubId = db
    .prepare(
      `INSERT INTO publications (post_id, channel_id, scheduled_at, status)
       VALUES (?, ?, '2026-01-01T00:00:00+00:00', 'canceled') RETURNING id`,
    )
    .get(postId, channelId).id as number;

  const ok = q.restoreCanceledPublication(pubId, "2026-06-01T12:00:00+00:00");
  assert.equal(ok, true);

  const row = db.prepare("SELECT status, scheduled_at FROM publications WHERE id = ?").get(pubId) as {
    status: string; scheduled_at: string;
  };
  assert.equal(row.status, "scheduled");
  assert.equal(row.scheduled_at, "2026-06-01T12:00:00+00:00");
});

test("restoreCanceledPublication refuses a send that isn't canceled", async () => {
  const { q, db, channelId } = await setup();
  const postId = q.createDraftPost({
    caption: "still scheduled", first_comment: "", asset_ids: [],
  }, null);
  const pubId = db
    .prepare(
      `INSERT INTO publications (post_id, channel_id, scheduled_at, status)
       VALUES (?, ?, '2026-01-01T00:00:00+00:00', 'scheduled') RETURNING id`,
    )
    .get(postId, channelId).id as number;

  const ok = q.restoreCanceledPublication(pubId, "2026-06-01T12:00:00+00:00");
  assert.equal(ok, false, "only a canceled send should be restorable");

  const row = db.prepare("SELECT status, scheduled_at FROM publications WHERE id = ?").get(pubId) as {
    status: string; scheduled_at: string;
  };
  assert.equal(row.status, "scheduled", "untouched — not overwritten by the failed restore attempt");
  assert.equal(row.scheduled_at, "2026-01-01T00:00:00+00:00");
});

test("restoreCanceledPublication clears a leftover next_retry_at", async () => {
  const { q, db, channelId } = await setup();
  const postId = q.createDraftPost({
    caption: "canceled after a failed retry wait", first_comment: "", asset_ids: [],
  }, null);
  const pubId = db
    .prepare(
      `INSERT INTO publications (post_id, channel_id, scheduled_at, status, next_retry_at)
       VALUES (?, ?, '2026-01-01T00:00:00+00:00', 'canceled', '2026-01-01T01:00:00+00:00') RETURNING id`,
    )
    .get(postId, channelId).id as number;

  q.restoreCanceledPublication(pubId, "2026-06-01T12:00:00+00:00");

  const row = db.prepare("SELECT next_retry_at FROM publications WHERE id = ?").get(pubId) as {
    next_retry_at: string | null;
  };
  assert.equal(row.next_retry_at, null);
});
