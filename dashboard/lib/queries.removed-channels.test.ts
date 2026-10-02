import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb } from "../test/helpers.ts";

// See queries.groups.test.ts: every setup() in this file shares the first temp DB, hence the
// per-setup prefix and the owner-scoped assertions below instead of whole-table equality.
let setupSeq = 0;

async function setup() {
  makeTestDb();
  const q = await import("./queries.ts");
  const db = (await import("./db.ts")).getDb();
  const prefix = `t${++setupSeq}`;
  const user = (suffix: string) =>
    Number(
      db.prepare("INSERT INTO users (email, password_hash, is_admin) VALUES (?, 'x', 0)")
        .run(`${prefix}-${suffix}@test.dev`).lastInsertRowid,
    );
  // Mirrors exactly what worker/lost_channels.py writes when it removes a fallen account.
  const logRemoval = (o: {
    owner: number | null; folderId?: number | null; folderName?: string | null; lostAt: string;
  }) =>
    db.prepare(
      `INSERT INTO lost_channel_log
         (owner_user_id, platform, account_name, folder_id, folder_name, lost_at, removed_at)
       VALUES (?, 'instagram', ?, ?, ?, ?, ?)`,
    ).run(o.owner, `${prefix}-gone`, o.folderId ?? null, o.folderName ?? null, o.lostAt, o.lostAt);
  return { q, db, prefix, user, logRemoval };
}

test("removed accounts are counted per folder, biggest first, scoped to the owner", async () => {
  const { q, user, logRemoval } = await setup();
  const owner = user("a");
  const small = q.createFolder("small", owner);
  const big = q.createFolder("big", owner);
  logRemoval({ owner, folderId: small, lostAt: "2026-09-10T00:00:00Z" });
  for (let i = 0; i < 3; i++) logRemoval({ owner, folderId: big, lostAt: "2026-09-10T00:00:00Z" });
  logRemoval({ owner, folderId: null, lostAt: "2026-09-10T00:00:00Z" });
  logRemoval({ owner: user("other"), folderId: big, lostAt: "2026-09-10T00:00:00Z" });

  assert.deepEqual(q.getRemovedChannelCounts(owner), [
    { folder_id: big, count: 3 },
    { folder_id: small, count: 1 },
    { folder_id: null, count: 1 },
  ]);
});

test("admin (null) sees every owner's removed accounts", async () => {
  const { q, user, logRemoval } = await setup();
  const folder = q.createFolder("admin-sees", user("x"));
  logRemoval({ owner: user("y"), folderId: folder, lostAt: "2026-09-10T00:00:00Z" });

  const all = q.getRemovedChannelCounts(null);
  assert.ok(all.find((c) => c.folder_id === folder && c.count >= 1));
});

test("a folder deleted after the removal folds its count into Sem pasta instead of vanishing", async () => {
  const { q, user, logRemoval } = await setup();
  const owner = user("a");
  const doomed = q.createFolder("doomed", owner);
  logRemoval({ owner, folderId: doomed, folderName: "doomed", lostAt: "2026-09-10T00:00:00Z" });
  assert.deepEqual(q.getRemovedChannelCounts(owner), [{ folder_id: doomed, count: 1 }]);

  q.deleteFolder(doomed);

  // The log keeps the dead folder's id on purpose (no foreign key), so the count is still
  // there — it just has no name to hang on, so it reports as unfoldered.
  assert.deepEqual(q.getRemovedChannelCounts(owner), [{ folder_id: null, count: 1 }]);
});

test("the Overview's lost-accounts count includes ones already removed, inside the range only", async () => {
  const { q, db, prefix, user, logRemoval } = await setup();
  const owner = user("a");
  const live = q.createChannel({
    platform: "instagram", account_name: `${prefix}-live`, timezone: "UTC",
    remote_account_id: `${prefix}-live`, access_token: "tok",
  }, owner);
  db.prepare("UPDATE channels SET lost_at = ? WHERE id = ?").run("2026-09-12T00:00:00Z", live);
  logRemoval({ owner, lostAt: "2026-09-15T00:00:00Z" });
  logRemoval({ owner, lostAt: "2026-09-16T00:00:00Z" });
  logRemoval({ owner, lostAt: "2026-08-01T00:00:00Z" }); // outside the range below
  logRemoval({ owner: user("other"), lostAt: "2026-09-15T00:00:00Z" }); // someone else's

  const september = { start: "2026-09-01", end: "2026-09-30" };
  assert.equal(q.getLostChannelsCount(september, owner), 3, "1 still on the page + 2 removed");
  assert.equal(
    q.getLostChannelsCount({ start: "2026-08-01", end: "2026-08-31" }, owner),
    1,
    "only the August removal",
  );
});
