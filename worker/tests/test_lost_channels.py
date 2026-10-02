"""Removing accounts that stayed disconnected (worker/lost_channels.py).

Deleting a channel is irreversible, so most of these tests are about the cases where it must
NOT happen: too soon, reconnected, working again, uncertain, or a wave of failures that points
at the app rather than at the accounts.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from worker import lost_channels
from worker.graph_api import GraphAPIError

NOW = datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc)
HOURS = 24


@pytest.fixture(autouse=True)
def _reset_throttle():
    lost_channels._last_run["at"] = None


def _ago(hours: float) -> str:
    return (NOW - timedelta(hours=hours)).isoformat()


class _Client:
    """Stands in for the Graph client. `outcome` is what get_account_profile does."""

    def __init__(self, outcome="dead"):
        self.outcome = outcome
        self.calls = []

    def get_account_profile(self, account_id, token, fields):
        self.calls.append((account_id, fields))
        if self.outcome == "dead":
            raise GraphAPIError("Error validating access token", code=190)
        if self.outcome == "flaky":
            raise GraphAPIError("Service unavailable", code=2)
        if self.outcome == "network":
            raise ConnectionError("boom")
        return {"id": account_id}


def _client_for(client):
    return lambda platform: client


def _channel(conn, name="acct", *, platform="instagram", lost_hours=48.0, folder_id=None,
             owner=None, avatar=None, token="tok") -> int:
    channel_id = conn.execute(
        "INSERT INTO channels (platform, account_name, remote_account_id, access_token, "
        "lost_at, lost_reason, folder_id, owner_user_id, avatar_path) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (platform, name, f"id-{name}", token,
         _ago(lost_hours) if lost_hours is not None else None,
         "token expired" if lost_hours is not None else None, folder_id, owner, avatar),
    ).lastrowid
    # Committed, like the real worker's connection always is by the time this job runs: the
    # error path rolls back, and must not take the test's own setup with it.
    conn.commit()
    return channel_id


def _exists(conn, channel_id) -> bool:
    return conn.execute("SELECT 1 FROM channels WHERE id = ?", (channel_id,)).fetchone() is not None


def _log(conn):
    return conn.execute("SELECT * FROM lost_channel_log ORDER BY id").fetchall()


def _run(conn, config, **kw):
    config.lost_channel_prune_hours = HOURS
    return lost_channels.run_lost_channel_cleanup(conn, config, NOW, **kw)


def test_a_channel_lost_long_enough_and_still_dead_is_removed_and_logged(conn, config):
    folder = conn.execute("INSERT INTO folders (name) VALUES ('LIDACI')").lastrowid
    user = conn.execute(
        "INSERT INTO users (email, password_hash, is_admin, is_active) VALUES ('a@b.c', 'x', 0, 1)"
    ).lastrowid
    ch = _channel(conn, "fallen", folder_id=folder, owner=user)
    _channel(conn, "healthy", lost_hours=None)
    _channel(conn, "healthy2", lost_hours=None)
    client = _Client("dead")

    assert _run(conn, config, client_for=_client_for(client)) == 1

    assert not _exists(conn, ch)
    (row,) = _log(conn)
    assert (row["account_name"], row["platform"], row["folder_id"], row["folder_name"]) == (
        "fallen", "instagram", folder, "LIDACI",
    )
    assert row["owner_user_id"] == user
    assert row["lost_at"] == _ago(48) and row["removed_at"] == NOW.isoformat()
    assert row["reason"] == "token expired"
    assert client.calls == [("id-fallen", "id")]  # it re-checked before deleting


def test_removal_takes_the_channels_queue_with_it_but_not_the_post_or_other_channels(conn, config):
    gone = _channel(conn, "gone")
    kept = _channel(conn, "kept", lost_hours=None)
    _channel(conn, "kept2", lost_hours=None)
    post = conn.execute("INSERT INTO posts (caption, post_type) VALUES ('c', 'single')").lastrowid
    for ch in (gone, kept):
        conn.execute(
            "INSERT INTO publications (post_id, channel_id, scheduled_at) VALUES (?, ?, ?)",
            (post, ch, _ago(-1)),
        )
    conn.commit()

    _run(conn, config, client_for=_client_for(_Client("dead")))

    rows = conn.execute("SELECT channel_id FROM publications").fetchall()
    assert [r["channel_id"] for r in rows] == [kept]
    assert conn.execute("SELECT 1 FROM posts WHERE id = ?", (post,)).fetchone() is not None


def test_cached_avatar_and_thumbnails_are_deleted_with_the_channel(conn, config):
    avatar = config.asset_storage_dir / "avatars" / "1.jpg"
    thumb = config.asset_storage_dir / "thumbnails" / "9.jpg"
    for p in (avatar, thumb):
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"x")
    ch = _channel(conn, "gone", avatar="avatars/1.jpg")
    _channel(conn, "ok1", lost_hours=None)
    _channel(conn, "ok2", lost_hours=None)
    conn.execute(
        "INSERT INTO remote_media (channel_id, remote_post_id, thumbnail_path) VALUES (?, 'r1', ?)",
        (ch, "thumbnails/9.jpg"),
    )
    conn.commit()

    _run(conn, config, client_for=_client_for(_Client("dead")))

    assert not avatar.exists() and not thumb.exists()


@pytest.mark.parametrize(
    "lost_hours, why",
    [(None, "never lost"), (2, "lost for less than the delay"), (23.9, "just under the delay")],
)
def test_channels_that_are_not_ready_are_never_touched(conn, config, lost_hours, why):
    ch = _channel(conn, "x", lost_hours=lost_hours)
    _channel(conn, "ok1", lost_hours=None)
    _channel(conn, "ok2", lost_hours=None)
    client = _Client("dead")

    assert _run(conn, config, client_for=_client_for(client)) == 0, why

    assert _exists(conn, ch) and client.calls == []


def test_a_token_that_works_again_clears_the_flag_and_keeps_the_account(conn, config):
    ch = _channel(conn, "recovered")
    _channel(conn, "ok1", lost_hours=None)
    _channel(conn, "ok2", lost_hours=None)

    assert _run(conn, config, client_for=_client_for(_Client("works"))) == 0

    row = conn.execute("SELECT lost_at, lost_reason FROM channels WHERE id = ?", (ch,)).fetchone()
    assert row["lost_at"] is None and row["lost_reason"] is None
    assert _log(conn) == []


@pytest.mark.parametrize("outcome", ["flaky", "network"])
def test_an_inconclusive_check_keeps_the_account_and_retries_later(conn, config, outcome):
    ch = _channel(conn, "unsure")
    _channel(conn, "ok1", lost_hours=None)
    _channel(conn, "ok2", lost_hours=None)

    assert _run(conn, config, client_for=_client_for(_Client(outcome))) == 0

    still = conn.execute("SELECT lost_at FROM channels WHERE id = ?", (ch,)).fetchone()
    assert still["lost_at"] is not None and _log(conn) == []


def test_without_a_client_a_meta_channel_cannot_be_confirmed_so_it_stays(conn, config):
    ch = _channel(conn, "x")
    _channel(conn, "ok1", lost_hours=None)
    _channel(conn, "ok2", lost_hours=None)

    assert _run(conn, config, client_for=None) == 0
    assert _exists(conn, ch)


@pytest.mark.parametrize("platform", ["tiktok", "threads", "discord", "telegram"])
def test_platforms_that_cannot_be_rechecked_go_on_the_delay_alone(conn, config, platform):
    ch = _channel(conn, "x", platform=platform)
    _channel(conn, "ok1", lost_hours=None)
    _channel(conn, "ok2", lost_hours=None)
    client = _Client("works")  # must not even be asked

    assert _run(conn, config, client_for=_client_for(client)) == 1
    assert not _exists(conn, ch) and client.calls == []


def test_a_wave_of_lost_channels_removes_nothing(conn, config):
    # 3 of 4 lost at once: that is the app or Meta, not three accounts falling together.
    ids = [_channel(conn, f"x{i}") for i in range(3)] + [_channel(conn, "ok", lost_hours=None)]

    assert _run(conn, config, client_for=_client_for(_Client("dead"))) == 0

    assert all(_exists(conn, i) for i in ids) and _log(conn) == []


def test_exactly_half_lost_is_not_a_wave(conn, config):
    gone = [_channel(conn, f"x{i}") for i in range(2)]
    _channel(conn, "ok1", lost_hours=None)
    _channel(conn, "ok2", lost_hours=None)

    assert _run(conn, config, client_for=_client_for(_Client("dead"))) == 2
    assert not any(_exists(conn, i) for i in gone)


def test_a_tiny_install_is_not_blocked_by_the_wave_guard(conn, config):
    ch = _channel(conn, "only")
    _channel(conn, "other", lost_hours=None)

    assert _run(conn, config, client_for=_client_for(_Client("dead"))) == 1
    assert not _exists(conn, ch)


def test_off_in_dry_run_when_the_hours_are_zero_and_throttled_between_runs(conn, config):
    ch = _channel(conn, "x")
    _channel(conn, "ok1", lost_hours=None)
    _channel(conn, "ok2", lost_hours=None)
    client = _Client("dead")

    assert _run(conn, config, client_for=_client_for(client), dry_run=True) == 0
    lost_channels._last_run["at"] = None
    config.lost_channel_prune_hours = 0
    assert lost_channels.run_lost_channel_cleanup(
        conn, config, NOW, client_for=_client_for(client)
    ) == 0
    assert _exists(conn, ch) and client.calls == []

    lost_channels._last_run["at"] = None
    assert _run(conn, config, client_for=_client_for(client)) == 1
    again = _channel(conn, "y")
    gap = lost_channels.CLEANUP_INTERVAL_SECONDS
    config.lost_channel_prune_hours = HOURS
    assert lost_channels.run_lost_channel_cleanup(
        conn, config, NOW + timedelta(seconds=gap - 1), client_for=_client_for(client)
    ) == 0
    assert _exists(conn, again)


def test_a_database_error_on_one_channel_keeps_it_and_does_not_crash(conn, config, monkeypatch):
    ch = _channel(conn, "x")
    _channel(conn, "ok1", lost_hours=None)
    _channel(conn, "ok2", lost_hours=None)

    def boom(*a, **k):
        raise sqlite3.OperationalError("database or disk is full")

    monkeypatch.setattr(lost_channels, "_remove", boom)

    assert _run(conn, config, client_for=_client_for(_Client("dead"))) == 0
    assert _exists(conn, ch)


def test_the_cleanup_never_raises(conn, config, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("boom")

    monkeypatch.setattr(lost_channels, "remove_lost_channels", boom)
    assert _run(conn, config, client_for=_client_for(_Client("dead"))) == 0
