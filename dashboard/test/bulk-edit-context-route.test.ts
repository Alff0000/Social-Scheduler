import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { makeTestDb } from "./helpers.ts";

makeTestDb();
const q = await import("../lib/queries.ts");
const db = (await import("../lib/db.ts")).getDb();

const commonTag = q.createTopicTag("bulk-context-route-common", null);
const periodId = q.createPeriod({
  name: "Bulk context route period",
  recurs_yearly: true,
  start_month: 1,
  start_day: 1,
  end_month: 12,
  end_day: 31,
}, null);
const postA = q.createDraftPost({
  caption: "bulk-context-route-a",
  first_comment: "",
  asset_ids: [],
  tag_ids: [commonTag.id],
  period_links: [{ periodId, mode: "green" }],
}, null);
const postB = q.createDraftPost({
  caption: "bulk-context-route-b",
  first_comment: "",
  asset_ids: [],
  tag_ids: [commonTag.id],
  period_links: [{ periodId, mode: "green" }],
}, null);
q.createDraftPost({
  caption: "bulk-context-route-c",
  first_comment: "",
  asset_ids: [],
}, null);

const { createSession } = await import("../lib/auth.ts");
const { POST } = await import("../app/api/posts/bulk-edit/context/route.ts");

// The route now requires a session (migrations/0034_owner_scoping.sql). This file's
// posts are all seeded with owner_user_id NULL, so admin (which skips the ownership
// check entirely) is what matches them — same as test/bulk-edit-route.test.ts.
const adminId = Number(
  db
    .prepare("INSERT INTO users (email, password_hash, is_admin) VALUES ('admin@test', 'x', 1)")
    .run().lastInsertRowid,
);
await createSession(adminId);

function readStoredRows() {
  return {
    posts: db.prepare("SELECT * FROM posts WHERE id IN (?, ?) ORDER BY id").all(postA, postB),
    tags: db.prepare("SELECT * FROM post_tags ORDER BY post_id, tag_id").all(),
    periods: db
      .prepare("SELECT * FROM post_periods ORDER BY post_id, period_id, mode")
      .all(),
  };
}

async function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost:3939/api/posts/bulk-edit/context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function postRaw(body: string) {
  return POST(
    new NextRequest("http://localhost:3939/api/posts/bulk-edit/context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
  );
}

test("malformed JSON and invalid bodies return 400", async () => {
  const malformed = await postRaw("{");
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: "Corpo da requisição inválido." });

  for (const body of [null, [], "bad"]) {
    const response = await post(body);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Corpo da requisição inválido." });
  }
});

test("post_ids must be a non-empty array", async () => {
  for (const body of [{}, { post_ids: null }, { post_ids: [] }]) {
    const response = await post(body);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Selecione ao menos um post." });
  }
});

test("every post id must be an integer", async () => {
  for (const invalidId of ["bad", 1.5, null]) {
    const response = await post({ post_ids: [postA, invalidId] });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "post_ids deve conter apenas números inteiros." });
  }
});

test("an unknown post id is rejected before context is returned", async () => {
  const response = await post({ post_ids: [postA, 999999] });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Post desconhecido 999999." });
});

test("a duplicate selection returns deduplicated context without writing links", async () => {
  const before = readStoredRows();

  const response = await post({ post_ids: [postA, postB, postA] });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    post_count: 2,
    tags: [{ tag_id: commonTag.id, count: 2 }],
    periods: [{ period_id: periodId, mode: "green", count: 2 }],
    content_statuses: [{ value: "draft", count: 2 }],
    content_kinds: [{ value: "evergreen", count: 2 }],
    cooldowns: [{ value: null, count: 2 }],
  });
  assert.deepEqual(readStoredRows(), before);
});
