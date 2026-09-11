-- 0036_periods_per_owner_unique.sql
-- Same problem and same fix as migrations/0035_tags_per_owner_unique.sql, for periods
-- instead of tags: migrations/0034 added owner_user_id to periods, but periods.name
-- still carries the ORIGINAL global UNIQUE(name) from 0002_content_model.sql. Left
-- alone, the second tenant to create a period named "Verao" or "Black Friday" — sooner
-- or later than not, since these are exactly the kind of generic seasonal names more
-- than one person reaches for — hits a UNIQUE violation for a name collision that, from
-- their side, never happened.
--
-- Unlike tags, periods have no shared/fixed subset (nothing seeds a period row), so this
-- is a plain UNIQUE(name, owner_user_id) — no partial indexes needed.
--
-- SQLite cannot ALTER a UNIQUE constraint off a column, so the table is rebuilt — same
-- reasoning and PRAGMA/transaction shape as migrations/0008_platform_foundation.sql.
-- post_periods is the only foreign key referencing periods(id) (checked against every
-- migration file), and ids are preserved verbatim by the INSERT below, so it needs no
-- changes of its own.

PRAGMA foreign_keys = OFF;
BEGIN;

CREATE TABLE periods_new (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    owner_user_id INTEGER REFERENCES users(id),
    recurs_yearly INTEGER NOT NULL DEFAULT 1,
    start_month   INTEGER, start_day INTEGER,
    end_month     INTEGER, end_day   INTEGER,
    start_date    TEXT, end_date TEXT,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO periods_new (
    id, name, owner_user_id, recurs_yearly, start_month, start_day, end_month, end_day,
    start_date, end_date, created_at
)
SELECT
    id, name, owner_user_id, recurs_yearly, start_month, start_day, end_month, end_day,
    start_date, end_date, created_at
FROM periods;

DROP TABLE periods;
ALTER TABLE periods_new RENAME TO periods;

CREATE UNIQUE INDEX idx_periods_name_owner ON periods(name, owner_user_id);
CREATE INDEX idx_periods_owner_user_id ON periods(owner_user_id);

COMMIT;
PRAGMA foreign_keys = ON;
