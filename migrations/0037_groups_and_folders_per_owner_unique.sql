-- 0037_groups_and_folders_per_owner_unique.sql
-- Same problem, same fix, third and fourth time: migrations/0035 (tags) and 0036
-- (periods) already found that adding owner_user_id without also relaxing a
-- pre-existing global UNIQUE(name) leaves the SECOND tenant unable to reuse a name the
-- first tenant already picked. channel_groups.name (0013_channel_groups.sql) and
-- folders.name (0030_account_folders.sql) have the exact same global UNIQUE(name), and
-- were missed when migrations/0034_owner_scoping.sql first added the column — this
-- closes that gap for both in one migration since they are the same shape of fix.
--
-- Neither table has a shared/fixed subset (nothing seeds a channel_group or folder row),
-- so both get a plain UNIQUE(name, owner_user_id) — no partial indexes needed, unlike
-- tags' shared time_of_day bands.
--
-- SQLite cannot ALTER a UNIQUE constraint off a column, so both tables are rebuilt — same
-- reasoning and PRAGMA/transaction shape as migrations/0008_platform_foundation.sql.
-- Every foreign key referencing these two tables (channels.group_id, channels.folder_id,
-- autofill_lanes.group_id, stock_accounts.folder_id — checked against every migration
-- file) points at ids, which are preserved verbatim by the INSERTs below, so none of
-- those tables need any changes of their own.

PRAGMA foreign_keys = OFF;
BEGIN;

-- ---- channel_groups ----------------------------------------------------------------
CREATE TABLE channel_groups_new (
  id                  INTEGER PRIMARY KEY,
  name                TEXT NOT NULL,
  owner_user_id       INTEGER REFERENCES users(id),
  timezone            TEXT NOT NULL DEFAULT 'UTC',
  autofill_enabled    INTEGER NOT NULL DEFAULT 0,
  cadence_config      TEXT,
  min_queue_depth     INTEGER NOT NULL DEFAULT 0,
  target_queue_depth  INTEGER NOT NULL DEFAULT 0,
  reuse_min_age_days  INTEGER NOT NULL DEFAULT 180,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT
);

INSERT INTO channel_groups_new (
  id, name, owner_user_id, timezone, autofill_enabled, cadence_config, min_queue_depth,
  target_queue_depth, reuse_min_age_days, is_active, created_at, updated_at
)
SELECT
  id, name, owner_user_id, timezone, autofill_enabled, cadence_config, min_queue_depth,
  target_queue_depth, reuse_min_age_days, is_active, created_at, updated_at
FROM channel_groups;

DROP TABLE channel_groups;
ALTER TABLE channel_groups_new RENAME TO channel_groups;

CREATE UNIQUE INDEX idx_channel_groups_name_owner ON channel_groups(name, owner_user_id);
CREATE INDEX idx_channel_groups_owner_user_id ON channel_groups(owner_user_id);

-- ---- folders -------------------------------------------------------------------------
CREATE TABLE folders_new (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  owner_user_id INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO folders_new (id, name, owner_user_id, created_at)
SELECT id, name, owner_user_id, created_at FROM folders;

DROP TABLE folders;
ALTER TABLE folders_new RENAME TO folders;

CREATE UNIQUE INDEX idx_folders_name_owner ON folders(name, owner_user_id);
CREATE INDEX idx_folders_owner_user_id ON folders(owner_user_id);

COMMIT;
PRAGMA foreign_keys = ON;
