"""Media prune (worker/prune.py): delete media of long-published posts, and only those.

The rows below are seeded by hand rather than through make_publication, because what is
under test is precisely which combinations of post / publication state are safe to delete.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from worker import prune

NOW = datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _reset_throttle():
    prune._last_run["at"] = None


def _iso(days_ago: float) -> str:
    return (NOW - timedelta(days=days_ago)).isoformat()


def _write(config, rel: str, data: bytes = b"x" * 100) -> None:
    path = config.asset_storage_dir / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def _channel(conn) -> int:
    return conn.execute(
        "INSERT INTO channels (platform, account_name, remote_account_id, access_token) "
        "VALUES ('instagram', 'IG', '1', 't')"
    ).lastrowid


def _asset(conn, config, name: str, *, cover_of: int | None = None) -> int:
    rel, pub, thumb = f"{name}.mp4", f"pub/{name}.mp4", f"thumbs/{name}.jpg"
    for p in (rel, pub, thumb):
        _write(config, p)
    asset_id = conn.execute(
        "INSERT INTO assets (content_hash, media_kind, storage_path, publish_path, "
        "thumbnail_path, byte_size) VALUES (?, 'video', ?, ?, ?, 100)",
        (f"hash-{name}", rel, pub, thumb),
    ).lastrowid
    return asset_id


def _post(conn, asset_id: int, channel_id: int, *, pubs, is_bpp: int = 0) -> int:
    """pubs: list of (status, days_ago_or_None, is_dry_run)."""
    post_id = conn.execute(
        "INSERT INTO posts (caption, post_type, content_status, is_bpp) "
        "VALUES ('c', 'video', 'ready', ?)", (is_bpp,),
    ).lastrowid
    conn.execute(
        "INSERT INTO post_assets (post_id, asset_id, sort_order) VALUES (?, ?, 0)",
        (post_id, asset_id),
    )
    for status, days_ago, dry in pubs:
        conn.execute(
            "INSERT INTO publications (post_id, channel_id, scheduled_at, status, "
            "published_at, is_dry_run) VALUES (?, ?, ?, ?, ?, ?)",
            (post_id, channel_id, _iso(days_ago or 0), status,
             _iso(days_ago) if days_ago is not None else None, dry),
        )
    conn.commit()
    return post_id


def _alive(conn, asset_id: int) -> bool:
    return conn.execute("SELECT 1 FROM assets WHERE id = ?", (asset_id,)).fetchone() is not None


def _files(config, name: str) -> list[bool]:
    return [(config.asset_storage_dir / p).exists()
            for p in (f"{name}.mp4", f"pub/{name}.mp4", f"thumbs/{name}.jpg")]


def test_old_posted_media_is_deleted_files_row_and_post_is_retired(conn, config):
    ch = _channel(conn)
    a = _asset(conn, config, "old")
    post = _post(conn, a, ch, pubs=[("posted", 10, 0)])

    assert prune.prune_media(conn, config, 3, NOW) == 1

    assert _files(config, "old") == [False, False, False]
    assert not _alive(conn, a)
    assert conn.execute("SELECT content_status FROM posts WHERE id=?", (post,)).fetchone()[0] == "retired"


@pytest.mark.parametrize(
    "pubs, bpp, why",
    [
        ([("posted", 1, 0)], 0, "published too recently"),
        ([("posted", 10, 0), ("scheduled", None, 0)], 0, "another send is still pending"),
        ([("posted", 10, 0), ("pending_approval", None, 0)], 0, "awaiting approval"),
        ([("posted", 10, 0), ("publishing", None, 0)], 0, "mid-publish"),
        ([("posted", 10, 1)], 0, "only ever posted in dry-run"),
        ([("failed", 10, 0)], 0, "never actually posted"),
        ([], 0, "no send at all (a draft)"),
        ([("posted", 10, 0)], 1, "a best performer, kept for recycling"),
    ],
)
def test_media_that_must_stay_is_never_touched(conn, config, pubs, bpp, why):
    ch = _channel(conn)
    a = _asset(conn, config, "keep")
    _post(conn, a, ch, pubs=pubs, is_bpp=bpp)

    assert prune.prune_media(conn, config, 3, NOW) == 0, why

    assert _alive(conn, a)
    assert _files(config, "keep") == [True, True, True]


def test_media_shared_with_a_still_scheduled_post_is_kept(conn, config):
    ch = _channel(conn)
    a = _asset(conn, config, "shared")
    _post(conn, a, ch, pubs=[("posted", 10, 0)])
    later = conn.execute(
        "INSERT INTO posts (caption, post_type, content_status) VALUES ('c2', 'video', 'ready')"
    ).lastrowid
    conn.execute("INSERT INTO post_assets (post_id, asset_id, sort_order) VALUES (?, ?, 0)", (later, a))
    conn.execute(
        "INSERT INTO publications (post_id, channel_id, scheduled_at, status) "
        "VALUES (?, ?, ?, 'scheduled')", (later, ch, _iso(-1)),
    )
    conn.commit()

    assert prune.prune_media(conn, config, 3, NOW) == 0
    assert _alive(conn, a) and _files(config, "shared") == [True, True, True]


def test_a_file_another_asset_row_also_uses_is_not_deleted(conn, config):
    # Dedup is per owner, so two rows can point at the same file on disk.
    ch = _channel(conn)
    a = _asset(conn, config, "twin")
    conn.execute(
        "INSERT INTO assets (content_hash, media_kind, storage_path, publish_path, "
        "thumbnail_path, byte_size) VALUES ('other-owner', 'video', 'twin.mp4', "
        "'pub/twin.mp4', 'thumbs/twin.jpg', 100)"
    )
    conn.commit()
    _post(conn, a, ch, pubs=[("posted", 10, 0)])

    assert prune.prune_media(conn, config, 3, NOW) == 1

    assert not _alive(conn, a)
    assert _files(config, "twin") == [True, True, True]  # the other row still needs them


def test_orphaned_cover_is_pruned_with_its_video_but_a_shared_cover_is_kept(conn, config):
    ch = _channel(conn)
    video = _asset(conn, config, "vid")
    cover = _asset(conn, config, "cov")
    conn.execute("UPDATE assets SET cover_asset_id = ? WHERE id = ?", (cover, video))
    _post(conn, video, ch, pubs=[("posted", 10, 0)])

    # A second video, still scheduled, whose cover must survive the first video's pruning.
    keeper = _asset(conn, config, "vid2")
    shared = _asset(conn, config, "cov2")
    conn.execute("UPDATE assets SET cover_asset_id = ? WHERE id = ?", (shared, keeper))
    _post(conn, keeper, ch, pubs=[("scheduled", None, 0)])

    prune.prune_media(conn, config, 3, NOW)

    assert not _alive(conn, video) and not _alive(conn, cover)
    assert _alive(conn, keeper) and _alive(conn, shared)
    assert _files(config, "cov2") == [True, True, True]


def test_files_are_freed_even_if_the_database_write_fails(conn, config, monkeypatch):
    ch = _channel(conn)
    a = _asset(conn, config, "full")
    _post(conn, a, ch, pubs=[("posted", 10, 0)])

    def disk_full(*args, **kwargs):
        raise sqlite3.OperationalError("database or disk is full")

    monkeypatch.setattr(prune, "_delete_rows", disk_full)
    assert prune.prune_media(conn, config, 3, NOW) == 0
    assert _files(config, "full") == [False, False, False]  # space is back...
    assert _alive(conn, a)                                  # ...row is retried later

    monkeypatch.undo()
    assert prune.prune_media(conn, config, 3, NOW) == 1
    assert not _alive(conn, a)


def test_off_by_default_and_throttled_when_on(conn, config):
    ch = _channel(conn)
    a = _asset(conn, config, "gated")
    _post(conn, a, ch, pubs=[("posted", 10, 0)])

    assert prune.run_media_prune(conn, config, NOW) == 0  # media_prune_days defaults to 0
    assert _alive(conn, a)

    config.media_prune_days = 3
    assert prune.run_media_prune(conn, config, NOW) == 1
    b = _asset(conn, config, "gated2")
    _post(conn, b, ch, pubs=[("posted", 10, 0)])
    assert prune.run_media_prune(conn, config, NOW + timedelta(seconds=60)) == 0  # throttled
    assert prune.run_media_prune(conn, config, NOW + timedelta(seconds=1000)) == 1


def test_run_media_prune_never_raises(conn, config, monkeypatch):
    config.media_prune_days = 3

    def boom(*a, **k):
        raise RuntimeError("boom")

    monkeypatch.setattr(prune, "prune_media", boom)
    assert prune.run_media_prune(conn, config, NOW) == 0
