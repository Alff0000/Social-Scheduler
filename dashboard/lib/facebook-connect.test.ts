import assert from "node:assert/strict";
import { test } from "node:test";
import {
  missingTasks,
  verifyPageToken,
  verifyInstagramToken,
  exchangeCodeForToken,
  listPages,
  selectInstagram,
  type MetaAppConfig,
} from "./facebook-connect.ts";

const PAGE_ID = "111222333";

/** A token that passes every check — each test below spoils exactly one thing. */
const GOOD = {
  type: "PAGE",
  scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
  expires_at: 0,
  profile_id: PAGE_ID,
};

test("a fully valid Page token is accepted", () => {
  assert.equal(verifyPageToken(GOOD, PAGE_ID), null);
});

// ---- the four token checks, one test each ---------------------------------------

test("a USER token on a Page channel is refused", () => {
  // It reads fine and never publishes, so nothing downstream would catch this.
  const problem = verifyPageToken({ ...GOOD, type: "USER" }, PAGE_ID);
  assert.ok(problem);
  assert.match(problem!, /not a Page token/);
});

test("a token without pages_manage_posts is refused, and names the error it would cause", () => {
  // Its absence is the (#200) Permissions error and nothing else is — worth naming,
  // because the failure appears at publish time with no reference to a missing scope.
  const scopes = GOOD.scopes.filter((s) => s !== "pages_manage_posts");
  const problem = verifyPageToken({ ...GOOD, scopes }, PAGE_ID);
  assert.ok(problem);
  assert.match(problem!, /pages_manage_posts/);
  assert.match(problem!, /#200/);
  // An existing token never gains a scope retroactively — without saying so, the obvious
  // next move is to add the permission and retry with the same dead token.
  assert.match(problem!, /NEW token|new token/);
});

test("a Page token that still expires is refused — the whole reason this step exists", () => {
  // THE bug from exchange_token.py's header: a Page token derived from an UNEXTENDED
  // user token is indistinguishable from a permanent one until it dies that afternoon.
  // expires_at is the only thing that can tell them apart.
  const inAnHour = 1_777_000_000;
  const problem = verifyPageToken({ ...GOOD, expires_at: inAnHour }, PAGE_ID);
  assert.ok(problem);
  assert.match(problem!, /still expires/);
});

test("a token for a different Page is refused", () => {
  // Guards against storing Page B's token on Page A's channel, which publishes happily
  // to the wrong audience rather than failing.
  const problem = verifyPageToken({ ...GOOD, profile_id: "999888777" }, PAGE_ID);
  assert.ok(problem);
  assert.match(problem!, /999888777/);
  assert.match(problem!, new RegExp(PAGE_ID));
});

test("a numeric profile_id still matches a string page id", () => {
  // Meta is inconsistent about quoting ids. A type mismatch here would reject a correct
  // token with "belongs to a different Page", which is a maddening thing to debug.
  assert.equal(verifyPageToken({ ...GOOD, profile_id: Number(PAGE_ID) }, PAGE_ID), null);
});

test("a missing type is refused rather than treated as absent-therefore-fine", () => {
  const problem = verifyPageToken({ scopes: GOOD.scopes, expires_at: 0 }, PAGE_ID);
  assert.ok(problem, "an empty debug_token response must not pass");
});

// ---- the fifth check: roles held on the Page itself ------------------------------

test("both publishing roles are required", () => {
  assert.deepEqual(missingTasks(["CREATE_CONTENT", "MANAGE", "MODERATE"]), []);
  assert.deepEqual(missingTasks(["CREATE_CONTENT"]), ["MANAGE"]);
  assert.deepEqual(missingTasks(["MANAGE"]), ["CREATE_CONTENT"]);
  assert.deepEqual(missingTasks(["ANALYZE"]), ["CREATE_CONTENT", "MANAGE"]);
});

test("an absent or malformed tasks list means no roles, not all roles", () => {
  // The safe direction: a missing tasks array must not read as full access. Meta omits
  // the field in some responses, and defaulting it open would skip the check entirely.
  assert.deepEqual(missingTasks(undefined), ["CREATE_CONTENT", "MANAGE"]);
  assert.deepEqual(missingTasks(null), ["CREATE_CONTENT", "MANAGE"]);
  assert.deepEqual(missingTasks("CREATE_CONTENT"), ["CREATE_CONTENT", "MANAGE"]);
});

// ---- verifyInstagramToken: the Instagram-publishing equivalent of verifyPageToken ------

const GOOD_IG = {
  type: "PAGE",
  scopes: ["pages_show_list", "instagram_basic", "instagram_content_publish"],
  expires_at: 0,
};

test("a fully valid Instagram-publishing Page token is accepted", () => {
  assert.equal(verifyInstagramToken(GOOD_IG), null);
});

test("a USER token is refused for Instagram publishing too", () => {
  const problem = verifyInstagramToken({ ...GOOD_IG, type: "USER" });
  assert.ok(problem);
  assert.match(problem!, /not a Page token/);
});

test("a token without instagram_content_publish is refused, naming the error it would cause", () => {
  const scopes = GOOD_IG.scopes.filter((s) => s !== "instagram_content_publish");
  const problem = verifyInstagramToken({ ...GOOD_IG, scopes });
  assert.ok(problem);
  assert.match(problem!, /instagram_content_publish/);
  assert.match(problem!, /#200/);
});

test("an Instagram Page token that still expires is refused", () => {
  const problem = verifyInstagramToken({ ...GOOD_IG, expires_at: 1_777_000_000 });
  assert.ok(problem);
  assert.match(problem!, /still expires/);
});

// ---- fetch-mocked: the OAuth hops that never ran against real Meta --------------------

const CONFIG: MetaAppConfig = { graphVersion: "v25.0", appId: "app123", appSecret: "shh" };

function fakeFetch(responses: Record<string, unknown>) {
  const calls: string[] = [];
  const impl = (async (url: string | URL) => {
    const href = String(url);
    calls.push(href);
    for (const [match, body] of Object.entries(responses)) {
      if (href.includes(match)) {
        return { json: async () => body } as Response;
      }
    }
    throw new Error(`fakeFetch: no stub for ${href}`);
  }) as typeof fetch;
  return { impl, calls };
}

test("exchangeCodeForToken trades a code for a short-lived access_token", async () => {
  const { impl, calls } = fakeFetch({
    "oauth/access_token": { access_token: "short-lived-token" },
  });
  const token = await exchangeCodeForToken("auth-code", "https://app.test/callback", CONFIG, impl);
  assert.equal(token, "short-lived-token");
  assert.match(calls[0], /code=auth-code/);
  assert.match(calls[0], /client_secret=shh/);
});

test("exchangeCodeForToken surfaces Meta's own error message", async () => {
  const { impl } = fakeFetch({
    "oauth/access_token": { error: { message: "Invalid verification code format.", code: 100 } },
  });
  await assert.rejects(
    () => exchangeCodeForToken("bad-code", "https://app.test/callback", CONFIG, impl),
    /Invalid verification code format/,
  );
});

test("listPages reports each Page's linked Instagram account, or null when it has none", async () => {
  const { impl } = fakeFetch({
    "oauth/access_token": { access_token: "extended-user-token" },
    "me/accounts": {
      data: [
        {
          id: "111", name: "Clinic Page", tasks: ["CREATE_CONTENT", "MANAGE"],
          access_token: "page-token-1",
          instagram_business_account: { id: "999", username: "clinic_ig" },
        },
        { id: "222", name: "No-IG Page", tasks: ["CREATE_CONTENT", "MANAGE"], access_token: "page-token-2" },
      ],
    },
  });
  const result = await listPages("user-token", CONFIG, impl);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(result.pages[0].instagram, { id: "999", username: "clinic_ig" });
  assert.equal(result.pages[1].instagram, null);
});

test("selectInstagram refuses a Page with no linked Instagram account", async () => {
  const { impl } = fakeFetch({
    "oauth/access_token": { access_token: "extended-user-token" },
    "me/accounts": {
      data: [{ id: "222", name: "No-IG Page", tasks: ["CREATE_CONTENT", "MANAGE"], access_token: "t" }],
    },
  });
  const result = await selectInstagram("user-token", "222", CONFIG, impl);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /no Instagram Business account/);
});

test("selectInstagram verifies the token and returns the Page token Instagram publishing uses", async () => {
  const { impl } = fakeFetch({
    "oauth/access_token": { access_token: "extended-user-token" },
    "me/accounts": {
      data: [
        {
          id: "111", name: "Clinic Page", tasks: ["CREATE_CONTENT", "MANAGE"],
          access_token: "page-token-1",
          instagram_business_account: { id: "999", username: "clinic_ig" },
        },
      ],
    },
    debug_token: { data: { ...GOOD_IG } },
  });
  const result = await selectInstagram("user-token", "111", CONFIG, impl);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.igId, "999");
  assert.equal(result.username, "clinic_ig");
  assert.equal(result.pageToken, "page-token-1");
});

test("selectInstagram refuses a token missing instagram_content_publish", async () => {
  const { impl } = fakeFetch({
    "oauth/access_token": { access_token: "extended-user-token" },
    "me/accounts": {
      data: [
        {
          id: "111", name: "Clinic Page", tasks: ["CREATE_CONTENT", "MANAGE"],
          access_token: "page-token-1",
          instagram_business_account: { id: "999", username: "clinic_ig" },
        },
      ],
    },
    debug_token: { data: { type: "PAGE", scopes: ["pages_show_list"], expires_at: 0 } },
  });
  const result = await selectInstagram("user-token", "111", CONFIG, impl);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /instagram_content_publish/);
});
