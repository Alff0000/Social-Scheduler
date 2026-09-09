-- 0031_stock_accounts.sql
-- Estoque — a bank of Instagram login credentials (username/password/2FA seed) bought or
-- gathered in bulk BEFORE any of them is ever connected through the Graph API. This is
-- deliberately its own table, not a row in `channels`: a channel is an account this
-- install can already PUBLISH to (it carries an access_token and talks to Meta's API); a
-- stock account is raw login credentials for a human to sign into by hand, with nothing
-- to authenticate against Meta yet. Conflating the two would mean every stock account
-- silently satisfies channel queries (insights, publish targets, the sidebar's channel
-- rail) with no token and no platform relationship — wrong on every one of them.
--
-- folder_id reuses the SAME `folders` table channels.folder_id points to (0030) rather
-- than a second "packs" table — a "pack" of purchased accounts and a "folder" of
-- connected ones are the same idea (a named bucket of accounts) at two different stages
-- of the same lifecycle, and a stock account keeps its pack assignment if it is ever
-- promoted to a real channel later.
--
-- password_enc / twofa_enc are ciphertext, NEVER plaintext — see dashboard/lib/crypto.ts.
-- This is the one place in the schema that stores a raw login credential rather than an
-- OAuth token (channels.access_token is issued by Meta and scoped/revocable; a scraped
-- Instagram password is neither), so it is the one place encryption at rest earns its
-- keep. twofa_enc is nullable: not every purchased account ships with 2FA.
--
-- is_used is a plain manual flag, not a status enum — this table tracks inventory, not a
-- warm-up pipeline. What "used" means (claimed, logged into, converted to a channel) is
-- the owner's own bookkeeping; the schema doesn't get to guess at a workflow nobody has
-- described yet (CLAUDE.md: implement in the agreed build order).

CREATE TABLE IF NOT EXISTS stock_accounts (
  id            INTEGER PRIMARY KEY,
  folder_id     INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  username      TEXT NOT NULL,
  password_enc  TEXT NOT NULL,
  twofa_enc     TEXT,
  notes         TEXT,
  is_used       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_accounts_folder ON stock_accounts(folder_id);
