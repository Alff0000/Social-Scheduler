-- 0035_tags_per_owner_unique.sql
-- migrations/0034 added owner_user_id to tags, but tags.name still carries the ORIGINAL
-- global UNIQUE(name COLLATE NOCASE) from 0001_init.sql. Left alone, that constraint
-- means the moment a topic tag is scoped per owner (see lib/queries.ts's createTopicTag),
-- the SECOND tenant to create a tag with any name the first tenant already used — even
-- something as generic as "verao" or "promocao" — hits a UNIQUE violation for a name
-- collision that, from their side, never happened. This rebuilds the table with the
-- uniqueness scoped to (name, owner_user_id) instead.
--
-- The four time_of_day tags (migration 0003: morning/afternoon/evening/anytime) are
-- different in kind, not just in kind='time_of_day' — they are fixed, install-wide
-- scheduling vocabulary seeded once by a migration, never user-created content, and stay
-- shared (owner_user_id NULL) rather than becoming four private copies per tenant.
-- SQLite treats every NULL as distinct from every other NULL in a UNIQUE index, so a
-- single UNIQUE(name, owner_user_id) index would silently let duplicate shared tags
-- through. Two PARTIAL unique indexes instead: one enforces uniqueness among a single
-- owner's own tags, the other enforces it among the shared (owner_user_id IS NULL) ones.
--
-- SQLite cannot ALTER a UNIQUE constraint off a column, so the table is rebuilt — same
-- reasoning and PRAGMA/transaction shape as migrations/0008_platform_foundation.sql.
-- post_tags is the only foreign key referencing tags(id) (checked against every
-- migration file), and ids are preserved verbatim by the INSERT below, so it needs no
-- changes of its own.

PRAGMA foreign_keys = OFF;
BEGIN;

CREATE TABLE tags_new (
    id                  INTEGER PRIMARY KEY,
    name                TEXT    NOT NULL COLLATE NOCASE,
    created_at          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    kind                TEXT    NOT NULL DEFAULT 'topic',
    owner_user_id       INTEGER REFERENCES users(id)
);

INSERT INTO tags_new (id, name, created_at, kind, owner_user_id)
  SELECT id, name, created_at, kind, owner_user_id FROM tags;

DROP TABLE tags;
ALTER TABLE tags_new RENAME TO tags;

CREATE UNIQUE INDEX idx_tags_name_per_owner
  ON tags(name, owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_tags_name_shared
  ON tags(name) WHERE owner_user_id IS NULL;
CREATE INDEX idx_tags_owner_user_id ON tags(owner_user_id);
-- idx_post_tags_tag (migration 0003) is on post_tags, not tags, so it survives the
-- rebuild above untouched and does not need recreating here.

COMMIT;
PRAGMA foreign_keys = ON;
