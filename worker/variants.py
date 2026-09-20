"""Per-publication video variants: the same footage, a different file for every account.

Posting one video to many accounts used to hand Meta byte-identical files each time. A
variant is a lossless remux (`ffmpeg -c copy`, no re-encode, no quality loss) whose
container metadata is rewritten with fresh random values, so each account receives a
different file.

Honest limit: this changes the FILE, not the pictures or audio inside it. If Instagram's
duplicate detection looks at content, this alone will not defeat it; it only removes the
cheapest signal (identical bytes and identical container tags).

A variant is a full copy of the video, and the volume is small, so it is only ever a
short-lived temp file: created right before a publish, deleted right after it.
"""

from __future__ import annotations

import random
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

VARIANTS_DIRNAME = "variants"

# A crash between "variant written" and "variant deleted" would strand a full copy of a
# video on a nearly-full disk forever, so anything older than this is swept.
STALE_AFTER_SECONDS = 3600

_VIDEO_HANDLERS = ("VideoHandler", "Core Media Video", "Video Media Handler", "MP4 Video")


def build_metadata(rng: random.Random, now: datetime) -> dict[str, str]:
    created = now - timedelta(days=rng.randint(1, 45), seconds=rng.randint(0, 86399))
    return {
        "creation_time": created.strftime("%Y-%m-%dT%H:%M:%S.000000Z"),
        "title": f"VID_{created:%Y%m%d}_{rng.randint(100000, 999999)}",
        "comment": f"{rng.getrandbits(64):016x}",
    }


def build_command(ffmpeg: str, src: Path, dest: Path, meta: dict[str, str],
                  rng: random.Random) -> list[str]:
    cmd = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
        "-map", "0:v:0", "-map", "0:a?",
        "-c", "copy",
        # Drop the source's own tags first: they are identical on every copy.
        "-map_metadata", "-1", "-map_chapters", "-1",
    ]
    for key, value in meta.items():
        cmd += ["-metadata", f"{key}={value}"]
    cmd += [
        "-metadata:s:v:0", f"handler_name={rng.choice(_VIDEO_HANDLERS)}",
        "-movflags", "+faststart",
        str(dest),
    ]
    return cmd


def make_variant(
    src: Path,
    dest_dir: Path,
    ffmpeg: str,
    *,
    rng: random.Random | None = None,
    now: datetime | None = None,
    run=subprocess.run,
    timeout: int = 180,
) -> Path | None:
    """Write a metadata-varied copy of `src` into `dest_dir`; None if that failed.

    Never raises: a failed variant must fall back to the original file, not fail a post.
    The output keeps the source's extension so a .mov is not silently relabelled.
    """
    rng = rng or random.Random()
    now = now or datetime.now(timezone.utc)
    dest = dest_dir / f"{rng.getrandbits(64):016x}{src.suffix.lower()}"
    try:
        dest_dir.mkdir(parents=True, exist_ok=True)
        proc = run(
            build_command(ffmpeg, src, dest, build_metadata(rng, now), rng),
            capture_output=True, timeout=timeout,
        )
        if proc.returncode != 0 or not dest.is_file() or dest.stat().st_size == 0:
            discard(dest)
            return None
        return dest
    except (OSError, subprocess.SubprocessError):
        discard(dest)
        return None


def discard(path: Path | None) -> None:
    if path is None:
        return
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def sweep_stale(dest_dir: Path, now_ts: float | None = None,
                max_age: int = STALE_AFTER_SECONDS) -> int:
    """Delete variants old enough that no publish can still need them. Returns the count."""
    now_ts = time.time() if now_ts is None else now_ts
    removed = 0
    try:
        entries = list(dest_dir.iterdir())
    except OSError:
        return 0
    for entry in entries:
        try:
            if entry.is_file() and now_ts - entry.stat().st_mtime > max_age:
                entry.unlink()
                removed += 1
        except OSError:
            continue
    return removed
