"""Remove accounts whose connection died and stayed dead.

A channel is marked lost (channels.lost_at, migration 0038) the first time a publish hits an
unrecoverable auth error. This job deletes such a channel once it has stayed lost for
LOST_CHANNEL_PRUNE_HOURS (default 24; 0 turns the job off), so fallen accounts stop cluttering
the Contas page. Each removal is written to lost_channel_log first (migration 0039), which is
what keeps the red "contas perdidas" counter honest after the channel row is gone.

Deleting a channel is not reversible: its queue, history and metrics go with it by ON DELETE
CASCADE. So this is deliberately cautious, in this order:

  1. Wait. A channel must have been lost for the whole delay. Reconnecting it in that time
     clears lost_at and it is never considered.
  2. Re-check. For Instagram and Facebook the stored token is tried once more right before
     deleting. If it works again (lost_at is only cleared by a reconnect, so a one-off Meta
     error would otherwise leave a healthy account flagged forever), the flag is cleared and
     the account is KEPT. If the answer is anything but a clear "token rejected" (timeout, 5xx),
     it is skipped and retried later. Other platforms cannot be re-checked cheaply, so the
     delay is their only protection.
  3. Refuse a wave. If more than half the install's channels are lost at once, the cause is
     almost certainly the app (a rotated secret, a disabled app, a Meta outage), not that many
     accounts falling together, and deleting would wipe everything. It logs and does nothing.

It also never runs in dry-run mode or while the kill switch is on.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from . import db
from .graph_api import GraphAPIError
from .redact import redact

CLEANUP_INTERVAL_SECONDS = 300
MAX_REMOVALS_PER_RUN = 20
MASS_FAILURE_MIN_CHANNELS = 3
# Platforms whose stored token can be tried against an identity endpoint. The rest are
# trusted on lost_at plus the delay alone.
_VERIFIABLE = ("instagram", "facebook")

_last_run: dict = {"at": None}


def _verdict(channel, client_for) -> bool | None:
    """True = confirmed dead, False = the token works again, None = could not tell."""
    if channel["platform"] not in _VERIFIABLE:
        return True
    token, remote_id = channel["access_token"], channel["remote_account_id"]
    if not token or not remote_id:
        return True  # nothing left to authenticate with
    if client_for is None:
        return None
    try:
        client = client_for(channel["platform"])
        client.get_account_profile(remote_id, token, "id")
    except GraphAPIError as exc:
        return True if exc.is_auth_revoked else None
    except Exception:  # noqa: BLE001 — a network blip is "could not tell", never "dead"
        return None
    return False


def _looks_systemic(total_channels: int, lost_ready: int) -> bool:
    return total_channels >= MASS_FAILURE_MIN_CHANNELS and lost_ready * 2 > total_channels


def _unlink_cached_files(conn, channel, base: Path) -> None:
    """Avatar and cached post thumbnails of the channel being removed. Pure disk cache,
    so a failure here is ignored — and they go BEFORE the rows, like worker/prune.py,
    because unlinking needs no free space and every database write does."""
    rels = [channel["avatar_path"]]
    rels += [
        r[0] for r in conn.execute(
            "SELECT thumbnail_path FROM remote_media WHERE channel_id = ? "
            "AND thumbnail_path IS NOT NULL", (channel["id"],),
        )
    ]
    base = base.resolve()
    for rel in rels:
        if not rel:
            continue
        try:
            target = (base / rel).resolve()
            if base in target.parents and target.is_file():
                target.unlink()
        except OSError:
            continue


def _remove(conn, channel, base: Path, now_iso: str) -> None:
    folder_name = None
    if channel["folder_id"] is not None:
        row = conn.execute(
            "SELECT name FROM folders WHERE id = ?", (channel["folder_id"],)
        ).fetchone()
        folder_name = row[0] if row else None
    _unlink_cached_files(conn, channel, base)
    # One transaction: the log row and the delete land together or not at all, so the
    # counter can never miss a removal or count one that did not happen.
    conn.execute(
        "INSERT INTO lost_channel_log (owner_user_id, platform, account_name, folder_id, "
        "folder_name, lost_at, removed_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            channel["owner_user_id"], channel["platform"], channel["account_name"],
            channel["folder_id"], folder_name, channel["lost_at"], now_iso,
            channel["lost_reason"],
        ),
    )
    conn.execute("DELETE FROM channels WHERE id = ?", (channel["id"],))
    conn.commit()


def remove_lost_channels(conn, config, hours: int, now: datetime, *, client_for=None,
                         logger=None) -> int:
    cutoff = (now - timedelta(hours=hours)).isoformat()
    ready = conn.execute(
        "SELECT * FROM channels WHERE lost_at IS NOT NULL AND lost_at <= ? "
        "ORDER BY lost_at, id", (cutoff,),
    ).fetchall()
    if not ready:
        return 0

    total = conn.execute("SELECT COUNT(*) FROM channels").fetchone()[0]
    if _looks_systemic(total, len(ready)):
        if logger:
            logger.warning(
                "lost-channel cleanup: %d of %d channels are lost at once, which looks like a "
                "problem with the app or with Meta rather than accounts falling — removing "
                "NOTHING. Check META_APP_ID/META_APP_SECRET and the app's status.",
                len(ready), total,
            )
        return 0

    base = Path(config.asset_storage_dir)
    now_iso = now.isoformat()
    removed = 0
    for channel in ready[:MAX_REMOVALS_PER_RUN]:
        verdict = _verdict(channel, client_for)
        if verdict is None:
            continue
        if verdict is False:
            db.update_channel(conn, channel["id"], lost_at=None, lost_reason=None)
            if logger:
                logger.info(
                    "lost-channel cleanup: %s works again — cleared the flag, kept the account",
                    channel["account_name"],
                )
            continue
        try:
            _remove(conn, channel, base, now_iso)
        except sqlite3.Error as exc:
            conn.rollback()
            if logger:
                logger.warning(
                    "lost-channel cleanup: kept %s for now: %s",
                    channel["account_name"], redact(str(exc)),
                )
            continue
        removed += 1
        if logger:
            logger.info(
                "lost-channel cleanup: removed %s (%s), lost since %s",
                channel["account_name"], channel["platform"], channel["lost_at"],
            )
    return removed


def run_lost_channel_cleanup(conn, config, now: datetime, *, client_for=None, logger=None,
                             dry_run: bool = False) -> int:
    """Throttled, never raises: a cleanup job must not stop publishing. Off when the hours
    setting is 0, in dry-run, and (via the caller) while the kill switch is on."""
    hours = getattr(config, "lost_channel_prune_hours", 0)
    if not hours or hours < 1 or dry_run:
        return 0
    last = _last_run["at"]
    if last is not None and (now - last).total_seconds() < CLEANUP_INTERVAL_SECONDS:
        return 0
    _last_run["at"] = now
    try:
        return remove_lost_channels(
            conn, config, hours, now, client_for=client_for, logger=logger
        )
    except Exception as exc:  # noqa: BLE001 — deliberately broad; see docstring
        if logger:
            logger.warning("lost-channel cleanup failed: %s", redact(str(exc)))
        return 0
