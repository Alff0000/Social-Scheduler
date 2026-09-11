import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb } from "../test/helpers.ts";

// See queries.groups.test.ts: node --test gives each FILE its own process, but lib/db.ts
// memoises its connection, so every setup() in this file shares the first temp DB. Hence
// the per-setup prefix to keep fixtures from colliding, and users seeded fresh each time
// rather than assumed to be the only ones in the database.
let setupSeq = 0;

async function setup() {
  makeTestDb();
  const q = await import("./queries.ts");
  const db = (await import("./db.ts")).getDb();
  const prefix = `t${++setupSeq}`;
  const userA = Number(
    db
      .prepare("INSERT INTO users (email, password_hash, is_admin) VALUES (?, 'x', 0)")
      .run(`${prefix}-a@example.com`).lastInsertRowid
  );
  const userB = Number(
    db
      .prepare("INSERT INTO users (email, password_hash, is_admin) VALUES (?, 'x', 0)")
      .run(`${prefix}-b@example.com`).lastInsertRowid
  );
  return { q, db, prefix, userA, userB };
}

// ---- Channels ------------------------------------------------------------------------

test("getChannels scoped to a user never returns another user's channels", async () => {
  const { q, prefix, userA, userB } = await setup();
  q.createChannel(
    { platform: "instagram", account_name: `${prefix}-a`, timezone: "UTC" } as Parameters<
      typeof q.createChannel
    >[0],
    userA
  );
  q.createChannel(
    { platform: "instagram", account_name: `${prefix}-b`, timezone: "UTC" } as Parameters<
      typeof q.createChannel
    >[0],
    userB
  );

  const mineA = q.getChannels(userA).filter((c) => c.account_name.startsWith(prefix));
  const mineB = q.getChannels(userB).filter((c) => c.account_name.startsWith(prefix));
  assert.deepEqual(mineA.map((c) => c.account_name), [`${prefix}-a`]);
  assert.deepEqual(mineB.map((c) => c.account_name), [`${prefix}-b`]);
});

test("getChannels with ownerId null (admin) sees every user's channels", async () => {
  const { q, prefix, userA, userB } = await setup();
  q.createChannel(
    { platform: "instagram", account_name: `${prefix}-a`, timezone: "UTC" } as Parameters<
      typeof q.createChannel
    >[0],
    userA
  );
  q.createChannel(
    { platform: "instagram", account_name: `${prefix}-b`, timezone: "UTC" } as Parameters<
      typeof q.createChannel
    >[0],
    userB
  );

  const all = q.getChannels(null).filter((c) => c.account_name.startsWith(prefix));
  assert.equal(all.length, 2, "admin (ownerId null) must see both users' channels");
});

test("getActiveChannels honors the same per-user scoping as getChannels", async () => {
  const { q, prefix, userA, userB } = await setup();
  q.createChannel(
    { platform: "instagram", account_name: `${prefix}-a`, timezone: "UTC" } as Parameters<
      typeof q.createChannel
    >[0],
    userA
  );
  q.createChannel(
    { platform: "instagram", account_name: `${prefix}-b`, timezone: "UTC" } as Parameters<
      typeof q.createChannel
    >[0],
    userB
  );

  const mineA = q.getActiveChannels(userA).filter((c) => c.account_name.startsWith(prefix));
  assert.deepEqual(mineA.map((c) => c.account_name), [`${prefix}-a`]);
});

test("createChannel stamps owner_user_id, and a null owner is invisible to every non-admin", async () => {
  const { q, db, prefix, userA } = await setup();
  const id = q.createChannel(
    { platform: "instagram", account_name: `${prefix}-owned`, timezone: "UTC" } as Parameters<
      typeof q.createChannel
    >[0],
    userA
  );
  assert.equal(q.getChannel(id)?.owner_user_id, userA);

  const orphanId = Number(
    db
      .prepare(
        "INSERT INTO channels (platform, account_name, timezone) VALUES ('instagram', ?, 'UTC')"
      )
      .run(`${prefix}-orphan`).lastInsertRowid
  );
  assert.equal(
    q.getChannels(userA).some((c) => c.id === orphanId),
    false,
    "a NULL owner_user_id must never match a real user's scoped query"
  );
  assert.ok(
    q.getChannels(null).some((c) => c.id === orphanId),
    "admin's unfiltered view still sees an unclaimed row"
  );
});

// ---- Channel groups --------------------------------------------------------------------

test("listChannelGroups scoped to a user never returns another user's groups", async () => {
  const { q, prefix, userA, userB } = await setup();
  q.createChannelGroup({ name: `${prefix}-A`, timezone: "UTC" }, userA);
  q.createChannelGroup({ name: `${prefix}-B`, timezone: "UTC" }, userB);

  const mineA = q.listChannelGroups(userA).filter((g) => g.name.startsWith(prefix));
  assert.deepEqual(mineA.map((g) => g.name), [`${prefix}-A`]);

  const all = q.listChannelGroups(null).filter((g) => g.name.startsWith(prefix));
  assert.equal(all.length, 2, "admin sees both users' groups");
});

// ---- Folders -----------------------------------------------------------------------------

test("listFolders scoped to a user never returns another user's folders", async () => {
  const { q, prefix, userA, userB } = await setup();
  q.createFolder(`${prefix}-A`, userA);
  q.createFolder(`${prefix}-B`, userB);

  const mineA = q.listFolders(userA).filter((f) => f.name.startsWith(prefix));
  assert.deepEqual(mineA.map((f) => f.name), [`${prefix}-A`]);

  const all = q.listFolders(null).filter((f) => f.name.startsWith(prefix));
  assert.equal(all.length, 2, "admin sees both users' folders");
});
