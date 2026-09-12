-- 0038_channel_lost.sql
-- Detect when a connected account's own access has died — not a single failed send, but
-- the TOKEN itself no longer working at all — so the dashboard can show how many accounts
-- need reconnecting, and when that happened.
--
-- Meta answers a publish attempt with OAuthException (code 190, see
-- GraphAPIError.is_auth_revoked in worker/graph_api.py) when the token is expired, the
-- person revoked it, a password change invalidated every session, or the account itself
-- was disabled/suspended/checkpointed. Unlike migration 0024's code 100/subcode 33 (which
-- Meta admits conflates a deleted object with a permissions problem, and needed several
-- occurrences in a row before a caller could act on it), 190 is unambiguous on the very
-- first occurrence: whatever the underlying cause, this token cannot publish.
--
-- Deliberately recoverable, same shape as remote_missing_at: saving a fresh access_token
-- for the channel (the normal reconnect flow) clears both columns, so a channel one click
-- from being fixed is never still counted as lost.

ALTER TABLE channels ADD COLUMN lost_at TEXT;

-- Human-readable, for the dashboard and for anyone reading the row later. Never the raw
-- API response: that is logged, and it can carry material we do not want stored.
ALTER TABLE channels ADD COLUMN lost_reason TEXT;
