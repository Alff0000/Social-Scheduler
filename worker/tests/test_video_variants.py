"""Per-account video variants (worker/variants.py + publisher._apply_video_variant).

Nothing here runs a real ffmpeg: the command is inspected, and the runner is faked. What
matters is that every account gets a different file, that a failed variant falls back to
the original instead of failing the post, and that the temp copy never outlives the send.
"""

from __future__ import annotations

import os
import random
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from worker import publisher, variants

NOW = datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc)


# ---- variants.py --------------------------------------------------------------------
def test_metadata_differs_between_accounts_and_is_in_the_past():
    a = variants.build_metadata(random.Random(1), NOW)
    b = variants.build_metadata(random.Random(2), NOW)
    assert a != b
    assert a["comment"] != b["comment"]
    assert a["creation_time"] < NOW.strftime("%Y-%m-%dT%H:%M:%S")


def test_command_is_a_lossless_remux_that_drops_the_source_tags():
    rng = random.Random(3)
    cmd = variants.build_command(
        "ffmpeg", Path("in.mp4"), Path("out.mp4"),
        variants.build_metadata(rng, NOW), rng,
    )
    assert cmd[cmd.index("-c") + 1] == "copy"
    assert cmd[cmd.index("-map_metadata") + 1] == "-1"
    assert "libx264" not in cmd and "-vf" not in cmd
    assert any(part.startswith("creation_time=") for part in cmd)
    assert cmd[-1] == "out.mp4"


def _runner(returncode=0, write=True):
    def run(cmd, **kwargs):
        if write:
            Path(cmd[-1]).write_bytes(b"varied-bytes")
        return SimpleNamespace(returncode=returncode)

    return run


def test_make_variant_writes_a_new_file_that_keeps_the_extension(tmp_path):
    src = tmp_path / "clip.mov"
    src.write_bytes(b"original")
    out = variants.make_variant(src, tmp_path / "v", "ffmpeg", run=_runner())
    assert out is not None and out.suffix == ".mov" and out.parent == tmp_path / "v"
    other = variants.make_variant(src, tmp_path / "v", "ffmpeg", run=_runner())
    assert other != out  # two accounts never share a file name either


def test_make_variant_returns_none_and_leaves_nothing_when_ffmpeg_fails(tmp_path):
    src = tmp_path / "clip.mp4"
    src.write_bytes(b"original")
    assert variants.make_variant(src, tmp_path / "v", "ffmpeg", run=_runner(returncode=1)) is None
    assert list((tmp_path / "v").iterdir()) == []


def test_make_variant_returns_none_when_ffmpeg_is_missing_or_hangs(tmp_path):
    src = tmp_path / "clip.mp4"
    src.write_bytes(b"original")

    def missing(cmd, **kwargs):
        raise FileNotFoundError("ffmpeg")

    def hangs(cmd, **kwargs):
        raise subprocess.TimeoutExpired(cmd, 1)

    assert variants.make_variant(src, tmp_path / "v", "ffmpeg", run=missing) is None
    assert variants.make_variant(src, tmp_path / "v", "ffmpeg", run=hangs) is None


def test_sweep_stale_removes_only_old_files(tmp_path):
    old, fresh = tmp_path / "old.mp4", tmp_path / "fresh.mp4"
    old.write_bytes(b"x")
    fresh.write_bytes(b"x")
    os.utime(old, (1000, 1000))
    assert variants.sweep_stale(tmp_path, now_ts=1000 + variants.STALE_AFTER_SECONDS + 1) == 1
    assert not old.exists()
    assert fresh.exists()


# ---- publisher wiring ---------------------------------------------------------------
class _ReelsClient:
    def __init__(self, fail=False):
        self.urls = []
        self.fail = fail

    def create_video_container(self, ig, url, token, caption=None, thumb_offset=None,
                               cover_url=None):
        self.urls.append(url)
        if self.fail:
            raise RuntimeError("meta said no")
        return "CONT"

    def get_container_status(self, cid, token):
        return "FINISHED"

    def publish_container(self, ig, cid, token):
        return "MEDIA1"

    def get_content_publishing_limit(self, ig, token):
        return (0, 50, 86400)


def _enable(monkeypatch, config, made: list, *, fail_make=False):
    config.video_variants = True
    monkeypatch.setattr(publisher, "_find_ffmpeg", lambda: "ffmpeg")

    def fake_make(src, dest_dir, ffmpeg, **kw):
        if fail_make:
            return None
        dest_dir.mkdir(parents=True, exist_ok=True)
        out = dest_dir / f"var{len(made)}.mp4"
        out.write_bytes(b"varied")
        made.append((src, out))
        return out

    monkeypatch.setattr(publisher.variant_files, "make_variant", fake_make)


def _source_file(config, pub):
    src = config.asset_storage_dir / "assets" / f"{pub['post_id']}-0.jpg"
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_bytes(b"original video")
    return src


def test_each_send_gets_its_own_copy_and_it_is_deleted_afterwards(
    conn, config, make_publication, monkeypatch
):
    made = []
    _enable(monkeypatch, config, made)
    pub = make_publication(post_type="video", media_kind="video", public_url=None)
    src = _source_file(config, pub)
    client = _ReelsClient()

    out = publisher.publish_one(
        conn, pub, config, client, dry_run=False, asset_base_url="https://tunnel.test/"
    )

    assert out.result == "posted"
    assert client.urls == ["https://tunnel.test/variants/var0.mp4"]
    assert made[0][0] == src            # cut from the file that would have been sent
    assert not made[0][1].exists()      # and gone once the send is over
    assert src.exists()                 # the original is never touched


def test_variant_is_deleted_even_when_the_publish_fails(
    conn, config, make_publication, monkeypatch
):
    made = []
    _enable(monkeypatch, config, made)
    pub = make_publication(post_type="video", media_kind="video", public_url=None)
    _source_file(config, pub)

    out = publisher.publish_one(
        conn, pub, config, _ReelsClient(fail=True), dry_run=False,
        asset_base_url="https://tunnel.test",
    )

    assert out.result == "retry_scheduled"
    assert made and not made[0][1].exists()


def test_failed_variant_falls_back_to_the_original_and_still_posts(
    conn, config, make_publication, monkeypatch
):
    _enable(monkeypatch, config, [], fail_make=True)
    pub = make_publication(post_type="video", media_kind="video", public_url=None)
    _source_file(config, pub)
    client = _ReelsClient()

    out = publisher.publish_one(
        conn, pub, config, client, dry_run=False, asset_base_url="https://tunnel.test"
    )

    assert out.result == "posted"
    assert client.urls == [f"https://tunnel.test/assets/{pub['post_id']}-0.jpg"]


def test_external_public_url_is_varied_and_served_from_the_same_host(
    conn, config, make_publication, monkeypatch
):
    made = []
    _enable(monkeypatch, config, made)
    pub = make_publication(post_type="video", media_kind="video", public_url=None)
    src = _source_file(config, pub)
    conn.execute(
        "UPDATE assets SET public_url = ? WHERE id = (SELECT asset_id FROM post_assets "
        "WHERE post_id = ?)",
        (f"https://assets.test/assets/{pub['post_id']}-0.jpg", pub["post_id"]),
    )
    conn.commit()
    client = _ReelsClient()

    out = publisher.publish_one(conn, pub, config, client, dry_run=False, asset_base_url=None)

    assert out.result == "posted"
    assert client.urls == ["https://assets.test/variants/var0.mp4"]
    assert made[0][0] == src


def test_disabled_flag_images_and_dry_runs_never_make_a_variant(
    conn, config, make_publication, monkeypatch
):
    made = []
    _enable(monkeypatch, config, made)

    def boom(*a, **kw):
        raise AssertionError("no variant should be made here")

    monkeypatch.setattr(publisher.variant_files, "make_variant", boom)

    image = make_publication(public_url=None)  # a photo, not a video
    from worker.tests.conftest import FakeGraphClient

    assert publisher.publish_one(
        conn, image, config, FakeGraphClient(), dry_run=False,
        asset_base_url="https://tunnel.test",
    ).result == "posted"

    video = make_publication(post_type="video", media_kind="video", public_url=None)
    _source_file(config, video)
    assert publisher.publish_one(
        conn, video, config, _ReelsClient(), dry_run=True, asset_base_url="https://tunnel.test",
    ).result == "dry_run"

    config.video_variants = False
    video2 = make_publication(post_type="video", media_kind="video", public_url=None)
    _source_file(config, video2)
    assert publisher.publish_one(
        conn, video2, config, _ReelsClient(), dry_run=False,
        asset_base_url="https://tunnel.test",
    ).result == "posted"
