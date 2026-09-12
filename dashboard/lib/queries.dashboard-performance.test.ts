import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb } from "../test/helpers.ts";

// See queries.bands.test.ts: node --test gives each FILE its own process, but lib/db.ts
// memoises its connection, so every setup() in this file shares the first temp DB. Hence
// the per-setup prefix to keep fixtures from colliding.
let setupSeq = 0;

async function setup() {
  makeTestDb();
  const q = await import("./queries.ts");
  const db = (await import("./db.ts")).getDb();
  return { q, db, prefix: `t${++setupSeq}` };
}

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** A 7-day range ending today — these functions used to take a plain `days` count; now
 *  they take an explicit calendar range (see lib/date-range.ts), so every existing "7
 *  days" call site here becomes this. */
function last7Days() {
  return { start: isoDay(-6), end: isoDay(0) };
}

function seedAccountMetricsRow(
  db: ReturnType<typeof import("better-sqlite3")>,
  channelId: number,
  day: string,
  values: { reach?: number; views?: number; likes?: number; comments?: number },
) {
  db.prepare(
    `INSERT INTO account_metrics (channel_id, day, reach, views, likes, comments, saves, shares, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
  ).run(
    channelId, day,
    values.reach ?? null, values.views ?? null, values.likes ?? null, values.comments ?? null,
    new Date().toISOString(),
  );
}

// ---- getAggregateAccountMetrics -------------------------------------------------------

test("getAggregateAccountMetrics sums across every active channel, per day", async () => {
  const { q, db, prefix } = await setup();
  const a = q.createChannel({
    platform: "instagram", account_name: `${prefix}-a`, timezone: "UTC",
    remote_account_id: `${prefix}-a`, access_token: "tok",
  }, null);
  const b = q.createChannel({
    platform: "instagram", account_name: `${prefix}-b`, timezone: "UTC",
    remote_account_id: `${prefix}-b`, access_token: "tok",
  }, null);
  const today = isoDay(0);
  seedAccountMetricsRow(db, a, today, { reach: 100, views: 200, likes: 10, comments: 1 });
  seedAccountMetricsRow(db, b, today, { reach: 50, views: 80, likes: 5, comments: 2 });

  const rows = q.getAggregateAccountMetrics(last7Days(), null);
  const row = rows.find((r) => r.day === today);
  assert.ok(row, "today's aggregate row must exist");
  assert.equal(row!.reach, 150);
  assert.equal(row!.views, 280);
  assert.equal(row!.likes, 15);
  assert.equal(row!.comments, 3);
});

test("getAggregateAccountMetrics excludes an inactive channel", async () => {
  const { q, db, prefix } = await setup();
  // Every setup() in this file shares one DB (see the file-level comment), so another
  // test's active channels may already have data for today — the only assertion that
  // survives that is a BEFORE/AFTER delta, not an absolute value or "today is absent".
  const before = q.getAggregateAccountMetrics(last7Days(), null).find((r) => r.day === isoDay(0));
  const beforeReach = before?.reach ?? 0;

  const a = q.createChannel({
    platform: "instagram", account_name: `${prefix}-a`, timezone: "UTC",
    remote_account_id: `${prefix}-a`, access_token: "tok",
  }, null);
  db.prepare("UPDATE channels SET is_active = 0 WHERE id = ?").run(a);
  seedAccountMetricsRow(db, a, isoDay(0), { reach: 999 });

  const after = q.getAggregateAccountMetrics(last7Days(), null).find((r) => r.day === isoDay(0));
  assert.equal(after?.reach ?? 0, beforeReach, "an inactive channel's reach must not be added in");
});

test("getAggregateAccountMetrics leaves fields it never asked for as null, not zero", async () => {
  const { q, db, prefix } = await setup();
  const a = q.createChannel({
    platform: "instagram", account_name: `${prefix}-a`, timezone: "UTC",
    remote_account_id: `${prefix}-a`, access_token: "tok",
  }, null);
  seedAccountMetricsRow(db, a, isoDay(0), { reach: 10 });
  const row = q.getAggregateAccountMetrics(last7Days(), null).find((r) => r.day === isoDay(0));
  assert.equal(row!.followers_count, null);
  assert.equal(row!.accounts_engaged, null);
});

// ---- getTopChannelsByReach -------------------------------------------------------------

test("getTopChannelsByReach ranks by total reach, highest first", async () => {
  const { q, db, prefix } = await setup();
  const low = q.createChannel({
    platform: "instagram", account_name: `${prefix}-low`, timezone: "UTC",
    remote_account_id: `${prefix}-low`, access_token: "tok",
  }, null);
  const high = q.createChannel({
    platform: "instagram", account_name: `${prefix}-high`, timezone: "UTC",
    remote_account_id: `${prefix}-high`, access_token: "tok",
  }, null);
  seedAccountMetricsRow(db, low, isoDay(0), { reach: 10 });
  seedAccountMetricsRow(db, high, isoDay(0), { reach: 500 });

  // A high limit, then filtered to this test's own two channels: other tests in this
  // file share the same DB (see the file-level comment) and may plant channels with
  // even higher reach, which top[0]/top[1] would otherwise pick up instead of these.
  const mine = q
    .getTopChannelsByReach(last7Days(), 1000, null)
    .filter((c) => c.account_name === `${prefix}-low` || c.account_name === `${prefix}-high`);
  assert.equal(mine.length, 2, "both of this test's own channels must be present");
  assert.equal(mine[0].account_name, `${prefix}-high`);
  assert.equal(mine[0].reach, 500);
  assert.equal(mine[1].account_name, `${prefix}-low`);
});

test("getTopChannelsByReach excludes a channel with no reach recorded", async () => {
  const { q, db, prefix } = await setup();
  const noData = q.createChannel({
    platform: "instagram", account_name: `${prefix}-empty`, timezone: "UTC",
    remote_account_id: `${prefix}-empty`, access_token: "tok",
  }, null);
  seedAccountMetricsRow(db, noData, isoDay(0), { reach: undefined, views: 100 });

  const top = q.getTopChannelsByReach(last7Days(), 5, null);
  assert.equal(top.find((c) => c.account_name === `${prefix}-empty`), undefined);
});

test("getTopChannelsByReach respects the limit", async () => {
  const { q, db, prefix } = await setup();
  for (let i = 0; i < 3; i += 1) {
    const id = q.createChannel({
      platform: "instagram", account_name: `${prefix}-c${i}`, timezone: "UTC",
      remote_account_id: `${prefix}-c${i}`, access_token: "tok",
    }, null);
    seedAccountMetricsRow(db, id, isoDay(0), { reach: 10 + i });
  }
  assert.equal(q.getTopChannelsByReach(last7Days(), 2, null).length, 2);
});

// ---- getPublicationsByHour --------------------------------------------------------------

function seedPostedPublication(
  db: ReturnType<typeof import("better-sqlite3")>,
  channelId: number,
  publishedAtIso: string,
): number {
  const postId = Number(
    db
      .prepare(
        `INSERT INTO posts (caption, post_type, status, content_status, content_kind)
         VALUES ('x','single','posted','ready','one_time')`,
      )
      .run().lastInsertRowid,
  );
  return Number(
    db
      .prepare(
        `INSERT INTO publications (post_id, channel_id, scheduled_at, status, published_at)
         VALUES (?, ?, ?, 'posted', ?)`,
      )
      .run(postId, channelId, publishedAtIso, publishedAtIso).lastInsertRowid,
  );
}

// Every test below shares one DB across the whole file (see the file-level comment), so
// none of them can assume theirs is the only publication in existence — each measures a
// BEFORE/AFTER delta instead of an absolute count.

test("getPublicationsByHour returns all 24 hours, zero-filled where nothing posted", async () => {
  const { q, db, prefix } = await setup();
  const a = q.createChannel({
    platform: "instagram", account_name: `${prefix}-a`, timezone: "UTC",
    remote_account_id: `${prefix}-a`, access_token: "tok",
  }, null);
  const before = q.getPublicationsByHour(last7Days(), null);
  const before14 = before.find((h) => h.hour === 14)?.count ?? 0;

  seedPostedPublication(db, a, new Date().toISOString().slice(0, 11) + "14:30:00Z");

  const after = q.getPublicationsByHour(last7Days(), null);
  assert.equal(after.length, 24, "every hour of the day must be represented");
  assert.equal(after.find((h) => h.hour === 14)?.count, before14 + 1);
  // An hour nothing in this test touched must still be a present, numeric 0 — never
  // absent from the array — so the chart never has to special-case a missing key.
  assert.equal(typeof after.find((h) => h.hour === 3)?.count, "number");
});

test("getPublicationsByHour ignores a publication outside the window", async () => {
  const { q, db, prefix } = await setup();
  const a = q.createChannel({
    platform: "instagram", account_name: `${prefix}-a`, timezone: "UTC",
    remote_account_id: `${prefix}-a`, access_token: "tok",
  }, null);
  const before = q.getPublicationsByHour(last7Days(), null).reduce((sum, h) => sum + h.count, 0);

  const old = new Date();
  old.setUTCDate(old.getUTCDate() - 30);
  seedPostedPublication(db, a, old.toISOString());

  const after = q.getPublicationsByHour(last7Days(), null).reduce((sum, h) => sum + h.count, 0);
  assert.equal(after, before, "a 30-day-old publication must not count toward a 7-day window");
});

test("getPublicationsByHour ignores publications that never actually posted", async () => {
  const { q, db, prefix } = await setup();
  const a = q.createChannel({
    platform: "instagram", account_name: `${prefix}-a`, timezone: "UTC",
    remote_account_id: `${prefix}-a`, access_token: "tok",
  }, null);
  const before = q.getPublicationsByHour(last7Days(), null).reduce((sum, h) => sum + h.count, 0);

  const postId = Number(
    db
      .prepare(
        `INSERT INTO posts (caption, post_type, status, content_status, content_kind)
         VALUES ('x','single','draft','ready','one_time')`,
      )
      .run().lastInsertRowid,
  );
  db.prepare(
    `INSERT INTO publications (post_id, channel_id, scheduled_at, status, published_at)
     VALUES (?, ?, ?, 'failed', NULL)`,
  ).run(postId, a, new Date().toISOString());

  const after = q.getPublicationsByHour(last7Days(), null).reduce((sum, h) => sum + h.count, 0);
  assert.equal(after, before, "a failed send with no published_at must not be counted");
});

// ---- getPostedTodayCount ----------------------------------------------------------------

test("getPostedTodayCount counts only today's posted publications", async () => {
  const { q, db, prefix } = await setup();
  const a = q.createChannel({
    platform: "instagram", account_name: `${prefix}-a`, timezone: "UTC",
    remote_account_id: `${prefix}-a`, access_token: "tok",
  }, null);
  const before = q.getPostedTodayCount(null, isoDay(0));

  seedPostedPublication(db, a, new Date().toISOString());
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  seedPostedPublication(db, a, yesterday.toISOString());

  assert.equal(q.getPostedTodayCount(null, isoDay(0)), before + 1, "only the one posted TODAY counts");
});
