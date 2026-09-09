-- 0030_account_folders.sql
-- folders — purely organizational grouping of accounts, deliberately separate from
-- channel_groups (0013_channel_groups.sql).
--
-- channel_groups already means something specific: a set of channels that auto-fill as
-- ONE unit, with its own cadence_config, timezone and BPP pool (see 0013's header and
-- components/channel-groups.tsx, which labels it "Auto-fill groups" in the UI). Folders
-- answer a different question — "which accounts belong together for browsing/bulk
-- operations" (the Stories composer's folder picker, Story Rotina's per-folder renewal,
-- Estoque's packs of purchased accounts) — and have no cadence, timezone or auto-fill
-- semantics of their own. Reusing channel_groups for this would mean creating one just to
-- organize a handful of stock accounts silently opts them into auto-fill bookkeeping they
-- were never meant to have. A channel can therefore sit in a folder AND (independently)
-- in an auto-fill group at the same time; the two ideas do not know about each other.
--
-- One folder per channel (folder_id, not a join table) mirrors channels.group_id exactly,
-- and matches every use named for it so far: a Story Rotina renews "the folder", an
-- Estoque account arrives in "a pack" — both read as an account having ONE home, not
-- several at once. ON DELETE SET NULL, not CASCADE, for the same reason group_id uses it:
-- a folder is an organizational label, not an owner of the channels in it — deleting one
-- must return its accounts to unfoldered, never delete the accounts or anything hanging
-- off them.
--
-- Purely additive (new table + ALTER TABLE ADD COLUMN, no CHECK on the existing table),
-- so this needs none of the table-rebuild cascade-delete handling that 0008/0009 carry.
-- Same shape as 0013_channel_groups.sql.

CREATE TABLE IF NOT EXISTS folders (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE channels ADD COLUMN folder_id INTEGER
  REFERENCES folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_channels_folder ON channels(folder_id);
