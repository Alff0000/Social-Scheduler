import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb } from "../test/helpers.ts";

// See queries.groups.test.ts: every setup() in this file shares the first temp DB, hence the
// per-setup prefix and the lookups by id instead of whole-table equality.
let setupSeq = 0;

async function setup() {
  makeTestDb();
  const q = await import("./queries.ts");
  const db = (await import("./db.ts")).getDb();
  const prefix = `t${++setupSeq}`;
  const channel = (name: string, owner: number | null = null) =>
    q.createChannel({
      platform: "instagram", account_name: `${prefix}-${name}`, timezone: "UTC",
      remote_account_id: `${prefix}-${name}`, access_token: "tok",
    }, owner);
  const metric = (
    channelId: number, day: string,
    v: { views?: number; reach?: number; likes?: number; followers?: number },
  ) =>
    db.prepare(
      `INSERT INTO account_metrics
         (channel_id, day, views, reach, likes, comments, saves, shares, followers_count, fetched_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
    ).run(channelId, day, v.views ?? null, v.reach ?? null, v.likes ?? null,
      v.followers ?? null, new Date().toISOString());
  const publication = (channelId: number, publishedAt: string, o: { dry?: number; status?: string } = {}) => {
    const post = Number(
      db.prepare("INSERT INTO posts (caption, post_type) VALUES ('c', 'single')").run().lastInsertRowid,
    );
    db.prepare(
      `INSERT INTO publications (post_id, channel_id, scheduled_at, status, published_at, is_dry_run)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(post, channelId, publishedAt, o.status ?? "posted", publishedAt, o.dry ?? 0);
  };
  return { q, db, prefix, channel, metric, publication };
}

const RANGE = { start: "2026-09-10", end: "2026-09-16" };
const row = (rows: { id: number }[], id: number) => rows.find((r) => r.id === id) as never as Record<string, unknown>;

test("totals are summed over the range only, and accounts rank by views", async () => {
  const { q, channel, metric } = await setup();
  const low = channel("low");
  const high = channel("high");
  metric(low, "2026-09-10", { views: 10, reach: 5, likes: 1 });
  metric(low, "2026-09-11", { views: 20, reach: 5, likes: 2 });
  metric(high, "2026-09-12", { views: 500, reach: 300, likes: 40 });
  metric(high, "2026-09-01", { views: 99999 }); // outside the range: must not count

  const rows = q.getChannelRanking(RANGE, null);
  const ours = rows.filter((r) => r.id === low || r.id === high);
  assert.deepEqual(ours.map((r) => r.id), [high, low], "highest views first");
  assert.equal(row(rows, high).views, 500);
  assert.equal(row(rows, high).likes, 40);
  assert.equal(row(rows, low).views, 30);
  assert.equal(row(rows, low).reach, 10);
  assert.equal(row(rows, low).days_with_data, 2);
});

test("an account with no metrics in the range is kept, with null totals, below everyone with data", async () => {
  const { q, channel, metric } = await setup();
  const withData = channel("with");
  const without = channel("without");
  const zero = channel("zero");
  metric(withData, "2026-09-12", { views: 7 });
  metric(zero, "2026-09-12", { views: 0 });
  metric(without, "2026-08-01", { views: 1000 }); // only outside the range

  const rows = q.getChannelRanking(RANGE, null);
  const mine = rows.filter((r) => [withData, without, zero].includes(r.id));
  assert.deepEqual(mine.map((r) => r.id), [withData, zero, without]);
  assert.equal(row(rows, without).views, null, "no data is null, not zero");
  assert.equal(row(rows, without).days_with_data, 0);
  assert.equal(row(rows, zero).views, 0, "a real zero stays a zero");
  assert.equal(row(rows, zero).days_with_data, 1);
});

test("followers is the latest known count on or before the range's last day", async () => {
  const { q, channel, metric } = await setup();
  const ch = channel("fol");
  metric(ch, "2026-09-05", { followers: 100 });
  metric(ch, "2026-09-14", { followers: 150 });
  metric(ch, "2026-09-20", { followers: 999 }); // after the range

  assert.equal(row(q.getChannelRanking(RANGE, null), ch).followers, 150);
});

test("posts counts real publishes in the range only: no dry runs, failures or other days", async () => {
  const { q, channel, publication } = await setup();
  const ch = channel("posts");
  publication(ch, "2026-09-10T00:00:00.000Z");
  publication(ch, "2026-09-16T23:59:59.000Z"); // last moment of the inclusive last day
  publication(ch, "2026-09-12T10:00:00.000Z", { dry: 1 });
  publication(ch, "2026-09-12T11:00:00.000Z", { status: "failed" });
  publication(ch, "2026-09-17T00:00:00.000Z"); // the day after
  publication(ch, "2026-09-09T23:59:59.000Z"); // the day before

  assert.equal(row(q.getChannelRanking(RANGE, null), ch).posts, 2);
});

test("inactive accounts are left out", async () => {
  const { q, db, channel, metric } = await setup();
  const off = channel("off");
  metric(off, "2026-09-12", { views: 50 });
  db.prepare("UPDATE channels SET is_active = 0 WHERE id = ?").run(off);

  assert.equal(q.getChannelRanking(RANGE, null).some((r) => r.id === off), false);
});

test("a login sees only its own accounts, admin (null) sees everyone's", async () => {
  const { q, db, prefix, channel, metric } = await setup();
  const owner = Number(
    db.prepare("INSERT INTO users (email, password_hash, is_admin) VALUES (?, 'x', 0)")
      .run(`${prefix}-o@test.dev`).lastInsertRowid,
  );
  const mine = channel("mine", owner);
  const theirs = channel("theirs", null);
  metric(mine, "2026-09-12", { views: 1 });
  metric(theirs, "2026-09-12", { views: 2 });

  const scoped = q.getChannelRanking(RANGE, owner);
  assert.equal(scoped.some((r) => r.id === mine), true);
  assert.equal(scoped.some((r) => r.id === theirs), false);
  assert.equal(q.getChannelRanking(RANGE, null).some((r) => r.id === theirs), true);
});

test("the folder name travels with the row, null when the account has none", async () => {
  const { q, db, channel } = await setup();
  const folder = q.createFolder(`rk-${setupSeq}`, null);
  const inside = channel("inside");
  const outside = channel("outside");
  db.prepare("UPDATE channels SET folder_id = ? WHERE id = ?").run(folder, inside);

  const rows = q.getChannelRanking(RANGE, null);
  assert.equal(row(rows, inside).folder_name, `rk-${setupSeq}`);
  assert.equal(row(rows, outside).folder_name, null);
});
