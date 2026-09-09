-- 0032_meta_apps.sql
-- meta_apps — a registry of Meta for Developers apps this install can authenticate
-- through, so /settings/meta-apps and /settings/integration have more than the single
-- (METMETA_APP_ID, META_APP_SECRET) pair .env supports today.
--
-- This is a deliberate, narrow exception to CLAUDE.md's "credentials come from .env
-- only" rule — made explicitly with the owner, not silently. The reasoning: that rule
-- assumes ONE app per install, which is all a single .env pair can ever express, but a
-- "list of apps" page has no meaning under that assumption. Everything else this install
-- treats as a secret still lives in .env (this file changes nothing about that); only a
-- Meta App's own client secret moves to the database, and only because a LIST of them is
-- the feature being built.
--
-- app_secret_enc is ciphertext (dashboard/lib/crypto.ts, the same AES-256-GCM scheme and
-- the same CREDENTIALS_ENCRYPTION_KEY as stock_accounts' passwords in 0031) for the same
-- reason: a Meta App secret is a bearer credential, not a revocable per-user OAuth token,
-- so it is worth protecting at rest the way channels.access_token is not.
--
-- graph_version is nullable and overrides config.graphVersion (META_GRAPH_VERSION in
-- .env) ONLY for requests made through this specific app — most installs will leave it
-- null and inherit the install-wide default, exactly like a channel's own settings
-- override an auto-fill group's only when set.
--
-- Deliberately NOT linked from `channels` yet: nothing in this migration changes how a
-- channel authenticates (still the existing paste-a-token flow — see
-- lib/facebook-connect.ts). Wiring a channel to a specific registered app is a separate,
-- larger change and is not part of what these two pages ask for.

CREATE TABLE IF NOT EXISTS meta_apps (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  app_id          TEXT NOT NULL,
  app_secret_enc  TEXT NOT NULL,
  graph_version   TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
