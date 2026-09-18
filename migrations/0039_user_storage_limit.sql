-- 0039_user_storage_limit.sql
-- A single install-wide disk volume is shared by every login on it (see CLAUDE.md's
-- multi-tenancy note) -- one login uploading without limit can fill the whole thing and
-- break uploads, deletes and everything else for every other login at once, since SQLite
-- itself needs a little free space to write ANY change, not just a big one. This gives
-- the admin a per-login cap to prevent that, not a feature the login sets for itself.
--
-- Nullable, no default, same reasoning as owner_user_id (migration 0034): NULL means
-- "no limit" -- the correct default for every existing login today, none of which have
-- ever been capped, and for makeTestDb()'s zero-users fixtures (a NOT NULL/defaulted
-- column would need every test that creates a user to also pick an arbitrary limit).

ALTER TABLE users ADD COLUMN storage_limit_mb INTEGER;
