-- 0033_notification_settings.sql
-- Notification preferences — single-row table (id is always 1), same shape as
-- worker_heartbeat (0005): one install, one set of preferences, no per-user rows.
--
-- This is PREFERENCE STORAGE ONLY. Nothing in this install currently sends an alert
-- anywhere — there is no email service (CLAUDE.md: no paid SaaS, no cloud service added
-- silently) and no notification-delivery job in the worker yet. Flipping these toggles on
-- changes nothing observable today; they exist so the dashboard has somewhere to persist
-- the owner's intent before that delivery job is built (same reasoning, and the same
-- owner decision, as skipping Story Rotina's worker automation for now).
--
-- Each column is a plain 0/1 flag, not a JSON blob, because there are exactly three
-- known alert kinds and each is independently meaningful — a JSON blob would need its own
-- parsing/validation for no benefit at this size.
CREATE TABLE IF NOT EXISTS notification_settings (
  id                      INTEGER PRIMARY KEY CHECK (id = 1),
  queue_error_enabled     INTEGER NOT NULL DEFAULT 0,
  auto_report_enabled     INTEGER NOT NULL DEFAULT 0,
  account_blocked_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at              TEXT
);

INSERT OR IGNORE INTO notification_settings (id) VALUES (1);
