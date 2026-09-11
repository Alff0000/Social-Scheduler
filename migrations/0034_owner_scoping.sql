-- 0034_owner_scoping.sql
-- Per-login data isolation: each dashboard login (users, migration 0029) becomes its own
-- tenant — its own channels, posts, media library, calendar, tags and periods — except
-- is_admin, which keeps seeing everyone's. Root entities get owner_user_id; everything
-- that hangs off one of them (publications, post_assets, post_targets, post_tags,
-- post_periods, caption_variants, remote_media, account_metrics, media_metrics,
-- post_metrics, audience_demographics, publish_limits, autofill_lanes) inherits
-- ownership by JOINing up to its root ancestor instead of getting its own column — an
-- extra owner_user_id on a publication that could only ever agree with its post's would
-- just be a second place for the same fact to go stale.
--
-- Deliberately left untouched: notification_settings and worker_heartbeat are
-- install-wide operational state (worker health, alert config), not tenant content —
-- there is exactly one of each row, for the whole install, regardless of how many logins
-- it has. The Python worker itself needs no changes for any of this: it has no concept
-- of users and keeps working every channel/publication it finds, which is correct — one
-- background daemon serving the whole install, not one per tenant.
--
-- owner_user_id is NULLABLE, on every table, with NO default. Two reasons, not one:
--   1. A fresh install's very first migrate.py run (and this project's whole test suite,
--      which builds a throwaway DB per test file via makeTestDb()) has ZERO rows in
--      `users` at this exact moment — a NOT NULL column, or one with a hardcoded default
--      id, would make every existing INSERT in the codebase (and every existing test)
--      start failing immediately, since id 1 doesn't exist yet to reference.
--   2. NULL is the CORRECT fail-closed default, free: `WHERE owner_user_id = ?` never
--      matches NULL, so a row nobody has claimed is invisible to every ordinary login and
--      visible only through an admin's unfiltered (owner_user_id IS NULL in the query
--      layer, not here) view — never accidentally shared with the wrong tenant.
--
-- The backfill below assigns every row that exists BEFORE this migration runs to
-- whichever user id is lowest — on every real install that is the original admin account
-- (the only login that existed until now), so nothing already connected disappears out
-- of the one login that's been using it. On a genuinely fresh clone with no users yet,
-- the subselect returns NULL and the UPDATE is a harmless no-op; those rows simply don't
-- exist yet either.

ALTER TABLE channels       ADD COLUMN owner_user_id INTEGER REFERENCES users(id);
ALTER TABLE posts          ADD COLUMN owner_user_id INTEGER REFERENCES users(id);
ALTER TABLE assets         ADD COLUMN owner_user_id INTEGER REFERENCES users(id);
ALTER TABLE tags           ADD COLUMN owner_user_id INTEGER REFERENCES users(id);
ALTER TABLE periods        ADD COLUMN owner_user_id INTEGER REFERENCES users(id);
ALTER TABLE channel_groups ADD COLUMN owner_user_id INTEGER REFERENCES users(id);
ALTER TABLE folders        ADD COLUMN owner_user_id INTEGER REFERENCES users(id);
ALTER TABLE meta_apps      ADD COLUMN owner_user_id INTEGER REFERENCES users(id);
ALTER TABLE stock_accounts ADD COLUMN owner_user_id INTEGER REFERENCES users(id);

UPDATE channels       SET owner_user_id = (SELECT MIN(id) FROM users) WHERE owner_user_id IS NULL;
UPDATE posts          SET owner_user_id = (SELECT MIN(id) FROM users) WHERE owner_user_id IS NULL;
UPDATE assets          SET owner_user_id = (SELECT MIN(id) FROM users) WHERE owner_user_id IS NULL;
UPDATE tags           SET owner_user_id = (SELECT MIN(id) FROM users) WHERE owner_user_id IS NULL;
UPDATE periods        SET owner_user_id = (SELECT MIN(id) FROM users) WHERE owner_user_id IS NULL;
UPDATE channel_groups SET owner_user_id = (SELECT MIN(id) FROM users) WHERE owner_user_id IS NULL;
UPDATE folders        SET owner_user_id = (SELECT MIN(id) FROM users) WHERE owner_user_id IS NULL;
UPDATE meta_apps      SET owner_user_id = (SELECT MIN(id) FROM users) WHERE owner_user_id IS NULL;
UPDATE stock_accounts SET owner_user_id = (SELECT MIN(id) FROM users) WHERE owner_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_channels_owner_user_id       ON channels(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_posts_owner_user_id          ON posts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_assets_owner_user_id         ON assets(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_tags_owner_user_id           ON tags(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_periods_owner_user_id        ON periods(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_channel_groups_owner_user_id ON channel_groups(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_folders_owner_user_id        ON folders(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_meta_apps_owner_user_id      ON meta_apps(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_stock_accounts_owner_user_id ON stock_accounts(owner_user_id);
