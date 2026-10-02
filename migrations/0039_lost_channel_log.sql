-- 0039_lost_channel_log.sql
-- A record of the accounts the worker removed because their connection died (migration
-- 0038's lost_at) and never came back, so the dashboard can keep a red "N contas perdidas"
-- counter next to the folders even though the channel rows themselves are gone.
--
-- Why a separate table at all: removing a fallen account (worker/lost_channels.py) deletes
-- its channels row, and with it every publication, metric and setting hanging off it by
-- ON DELETE CASCADE. The counter is the one thing the owner wants to KEEP after that, and a
-- number derived from channels can no longer see a channel that does not exist.
--
-- What is stored is deliberately small: a name to recognise it by, which folder it was in,
-- when it fell and when it was removed. Never the token and never the raw API response.
--
-- folder_id has NO foreign key, unlike channels.folder_id: deleting a folder later must not
-- erase the history of what was lost in it, and must not be blocked by it. folder_name is the
-- name at the time, so a count can still be labelled if the folder is renamed or deleted.
--
-- owner_user_id is nullable with no default for the same two reasons as migration 0034's:
-- NULL is the fail-closed value (a login only ever sees rows stamped with its own id, and
-- an admin's unfiltered view sees the rest), and rows written by a worker that cannot
-- resolve an owner must not be rejected by the foreign key.

CREATE TABLE IF NOT EXISTS lost_channel_log (
  id             INTEGER PRIMARY KEY,
  owner_user_id  INTEGER REFERENCES users(id),
  platform       TEXT    NOT NULL,
  account_name   TEXT    NOT NULL,
  folder_id      INTEGER,
  folder_name    TEXT,
  lost_at        TEXT    NOT NULL,
  removed_at     TEXT    NOT NULL,
  reason         TEXT
);

CREATE INDEX IF NOT EXISTS idx_lost_channel_log_owner ON lost_channel_log(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_lost_channel_log_lost_at ON lost_channel_log(lost_at);
