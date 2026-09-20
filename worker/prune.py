"""Free disk by deleting the media of posts that already went out.

Opt-in: MEDIA_PRUNE_DAYS=N deletes a post's media N days after its last real publish.
Unset or 0 keeps everything, which is the default.

Why it exists: the volume is small, and a scheduled video has to sit on it until it posts,
so with many accounts it fills within days. Once a post has gone out, its files are only
useful for recycling it, which is the trade the owner accepts by turning this on.

What is NEVER touched:
  * anything a still-pending send needs (scheduled / awaiting approval / publishing / held),
  * media of a post marked as a best performer (is_bpp), which is what gets recycled,
  * posts that only "posted" in dry-run,
  * a file that another asset row also points at (dedup is per owner, so two rows can
    share one file on disk).

Files are deleted BEFORE their database rows, on purpose: unlinking needs no free space,
while every database write does. On a full disk the file deletion still works and frees the
room the row deletion then needs, and a row left behind is simply retried next cycle.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from .redact import redact

PRUNE_INTERVAL_SECONDS = 900
MAX_ASSETS_PER_RUN = 100

_PATH_COLUMNS = ("storage_path", "publish_path", "thumbnail_path", "story_path")
_last_run: dict = {"at": None}

_ELIGIBLE_SQL = """
SELECT a.id
  FROM assets a
 WHERE EXISTS (SELECT 1 FROM post_assets pa WHERE pa.asset_id = a.id)
   AND NOT EXISTS (
        SELECT 1
          FROM post_assets pa
          JOIN posts p ON p.id = pa.post_id
         WHERE pa.asset_id = a.id
           AND (
                p.is_bpp = 1
                OR EXISTS (SELECT 1 FROM publications b
                            WHERE b.post_id = p.id
                              AND b.status IN ('scheduled', 'pending_approval', 'publishing'))
                OR NOT EXISTS (SELECT 1 FROM publications b
                                WHERE b.post_id = p.id AND b.status = 'posted'
                                  AND b.is_dry_run = 0)
                OR (SELECT MAX(COALESCE(b.published_at, b.updated_at, b.created_at))
                      FROM publications b
                     WHERE b.post_id = p.id AND b.status = 'posted'
                       AND b.is_dry_run = 0) >= ?
           )
       )
 ORDER BY a.id
 LIMIT ?
"""


def eligible_asset_ids(conn, cutoff_iso: str, limit: int = MAX_ASSETS_PER_RUN) -> list[int]:
    return [row[0] for row in conn.execute(_ELIGIBLE_SQL, (cutoff_iso, limit))]


def _shared_with_another_asset(conn, asset_id: int, rel: str) -> bool:
    clauses = " OR ".join(f"{col} = ?" for col in _PATH_COLUMNS)
    row = conn.execute(
        f"SELECT 1 FROM assets WHERE id != ? AND ({clauses}) LIMIT 1",
        (asset_id, *([rel] * len(_PATH_COLUMNS))),
    ).fetchone()
    return row is not None


def _delete_files(conn, asset, base: Path) -> int:
    """Unlink this asset's files that no other asset row uses. Returns bytes freed."""
    freed = 0
    base = base.resolve()
    for col in _PATH_COLUMNS:
        rel = asset[col]
        if not rel or _shared_with_another_asset(conn, asset["id"], rel):
            continue
        path = Path(rel)
        target = path if path.is_absolute() else base / path
        try:
            target = target.resolve()
            if base not in target.parents or not target.is_file():
                continue
            size = target.stat().st_size
            target.unlink()
            freed += size
        except OSError:
            continue
    return freed


def _delete_rows(conn, asset_id: int, now_iso: str) -> None:
    post_ids = [
        r[0] for r in conn.execute(
            "SELECT DISTINCT post_id FROM post_assets WHERE asset_id = ?", (asset_id,)
        )
    ]
    conn.execute("DELETE FROM post_assets WHERE asset_id = ?", (asset_id,))
    conn.execute("UPDATE publications SET asset_id = NULL WHERE asset_id = ?", (asset_id,))
    conn.execute("UPDATE assets SET cover_asset_id = NULL WHERE cover_asset_id = ?", (asset_id,))
    conn.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
    # A post with no media left must not be picked up again by auto-fill or recycling.
    for post_id in post_ids:
        conn.execute(
            "UPDATE posts SET content_status = 'retired', updated_at = ? "
            "WHERE id = ? AND content_status != 'retired'",
            (now_iso, post_id),
        )
    conn.commit()


def _orphaned_cover_ids(conn, cover_ids: list[int]) -> list[int]:
    """Of these cover images, the ones nothing uses any more."""
    out = []
    for cid in cover_ids:
        used = conn.execute(
            "SELECT 1 FROM post_assets WHERE asset_id = ? "
            "UNION ALL SELECT 1 FROM assets WHERE cover_asset_id = ? "
            "UNION ALL SELECT 1 FROM publications WHERE asset_id = ? LIMIT 1",
            (cid, cid, cid),
        ).fetchone()
        if not used:
            out.append(cid)
    return out


def prune_media(conn, config, days: int, now: datetime, logger=None) -> int:
    """Delete the media of posts last published more than `days` ago. Returns assets removed."""
    cutoff = (now - timedelta(days=days)).isoformat()
    base = Path(config.asset_storage_dir)
    now_iso = now.isoformat()
    removed = 0
    freed = 0

    def prune_one(asset_id: int) -> bool:
        nonlocal freed
        asset = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
        if asset is None:
            return False
        freed += _delete_files(conn, asset, base)
        try:
            _delete_rows(conn, asset_id, now_iso)
        except sqlite3.Error as exc:
            # Files are already gone and that is what frees space; the row is retried next
            # cycle (it stays eligible), by which time there is room to write.
            conn.rollback()
            if logger:
                logger.warning("media prune: kept row %s for now: %s", asset_id, redact(str(exc)))
            return False
        return True

    for asset_id in eligible_asset_ids(conn, cutoff):
        cover = conn.execute(
            "SELECT cover_asset_id FROM assets WHERE id = ?", (asset_id,)
        ).fetchone()
        cover_id = cover[0] if cover else None
        if prune_one(asset_id):
            removed += 1
            if cover_id is not None and _orphaned_cover_ids(conn, [cover_id]):
                if prune_one(cover_id):
                    removed += 1

    if removed and logger:
        logger.info(
            "media prune: removed %d asset(s) from posts published over %d day(s) ago, freed ~%.1f MB",
            removed, days, freed / (1024 * 1024),
        )
    return removed


def run_media_prune(conn, config, now: datetime, logger=None) -> int:
    """Throttled, opt-in, and never raises: a cleanup job must not stop publishing."""
    days = getattr(config, "media_prune_days", 0)
    if not days or days < 1:
        return 0
    last = _last_run["at"]
    if last is not None and (now - last).total_seconds() < PRUNE_INTERVAL_SECONDS:
        return 0
    _last_run["at"] = now
    try:
        return prune_media(conn, config, days, now, logger)
    except Exception as exc:  # noqa: BLE001 — deliberately broad; see docstring
        if logger:
            logger.warning("media prune failed: %s", redact(str(exc)))
        return 0
