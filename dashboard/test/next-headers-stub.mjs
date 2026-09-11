// Route-handler tests call the exported GET/POST/PATCH/DELETE functions directly,
// outside any real Next.js request — so the real next/headers throws
// "`cookies` was called outside a request scope" the moment a route calls
// getSessionUser() (lib/auth.ts), which reads next/headers's cookies(). This stub swaps
// in a plain in-memory Map instead, resolved only for the test runner (see
// test/hook.mjs's next/headers rewrite) — never for the real app.
//
// No per-test reset needed: lib/auth.ts's createSession(userId) always calls .set() with
// a fresh signed token before a test acts as some user, which overwrites whatever was
// here before. A test that never establishes a session simply never touches this store.
const store = new Map();

function cookieStore() {
  return {
    get(name) {
      return store.has(name) ? { name, value: store.get(name) } : undefined;
    },
    set(name, value) {
      store.set(name, value);
    },
    delete(name) {
      store.delete(name);
    },
  };
}

export async function cookies() {
  return cookieStore();
}

export async function headers() {
  return new Headers();
}
