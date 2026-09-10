"""A container-creation call accepts image_url/video_url as long as it is syntactically a
URL — Meta only discovers a broken one (a stale or misrouted tunnel, a file missing from
the local store, a proxy answering with an HTML error page) minutes later, during
container processing, and reports it as an opaque status_code=ERROR often with no subcode
at all. This is exactly what a real deploy hit: Railway logs showed Meta refusing an
upload with "The image format is not supported" (code 36001, subcode 2207083) for a
container built from this app's own tunnel URL.

_verify_asset_url / _verify_plan_assets_reachable fetch just enough of an asset URL
(headers + a few bytes, never the whole file) to catch this BEFORE ever creating a
container, so the failure names the real problem (a 404, the wrong Content-Type, an empty
body) instead of a Meta error code with no context.

publish_one wires this in as an OPT-IN step (verify_url_fn defaults to None and is
skipped entirely): this function is unit-tested hundreds of times elsewhere in this
codebase against fake image/video URLs that were never meant to resolve, and a default of
requests.get would turn every one of those into a real, likely-failing network call.
worker/run.py is the one real caller that opts in.
"""

from __future__ import annotations

import pytest

from worker.publisher import _verify_asset_url, _verify_plan_assets_reachable, publish_one


class _FakeResponse:
    def __init__(self, *, status=200, content_type="image/jpeg", body=b"\xff\xd8\xff"):
        self.status_code = status
        self.ok = 200 <= status < 300
        self.headers = {"Content-Type": content_type} if content_type else {}
        self._body = body
        self.closed = False

    def iter_content(self, chunk_size=256):
        if self._body:
            yield self._body[:chunk_size]

    def close(self):
        self.closed = True


def _get_fn(response=None, exc=None):
    def get(url, stream=True, timeout=None):
        if exc:
            raise exc
        return response

    return get


# ---- _verify_asset_url ---------------------------------------------------------------

def test_a_real_looking_response_passes():
    problem = _verify_asset_url(
        "https://t.trycloudflare.com/x.jpg", "image", 15, _get_fn(_FakeResponse())
    )
    assert problem is None


def test_response_body_is_closed_either_way():
    resp = _FakeResponse()
    _verify_asset_url("https://t.example/x.jpg", "image", 15, _get_fn(resp))
    assert resp.closed


def test_a_network_failure_names_the_url():
    problem = _verify_asset_url(
        "https://dead.trycloudflare.com/x.jpg", "image", 15,
        _get_fn(exc=ConnectionError("refused")),
    )
    assert "dead.trycloudflare.com" in problem
    assert "refused" in problem


def test_a_404_is_reported_by_status():
    problem = _verify_asset_url(
        "https://t.example/missing.jpg", "image", 15,
        _get_fn(_FakeResponse(status=404, content_type=None, body=b"")),
    )
    assert "404" in problem


def test_an_html_error_page_is_caught_by_content_type():
    # The exact real-world shape: a 200 response (the tunnel/proxy answered) whose body is
    # an HTML error page, not the image — a bare status-code check would miss this
    # entirely, which is the whole reason Content-Type is checked too.
    problem = _verify_asset_url(
        "https://t.example/x.jpg", "image", 15,
        _get_fn(_FakeResponse(content_type="text/html", body=b"<html>oops</html>")),
    )
    assert "text/html" in problem
    assert "image/" in problem


def test_a_video_url_served_as_image_content_type_is_wrong_kind():
    problem = _verify_asset_url(
        "https://t.example/x.mp4", "video", 15,
        _get_fn(_FakeResponse(content_type="image/jpeg")),
    )
    assert problem is not None
    assert "video/" in problem


def test_an_empty_body_is_reported_even_with_a_correct_content_type():
    problem = _verify_asset_url(
        "https://t.example/x.jpg", "image", 15,
        _get_fn(_FakeResponse(content_type="image/jpeg", body=b"")),
    )
    assert "empty" in problem.lower()


def test_a_content_type_with_a_charset_suffix_still_matches():
    problem = _verify_asset_url(
        "https://t.example/x.jpg", "image", 15,
        _get_fn(_FakeResponse(content_type="image/jpeg; charset=binary")),
    )
    assert problem is None


# ---- _verify_plan_assets_reachable -----------------------------------------------------

def _asset(media_kind="image"):
    return {"media_kind": media_kind}


def test_reports_the_first_broken_url_and_stops():
    urls = ["https://t.example/ok.jpg", "https://t.example/broken.jpg", "https://t.example/never-checked.jpg"]
    assets = [_asset(), _asset(), _asset()]
    calls = []

    def get(url, stream=True, timeout=None):
        calls.append(url)
        return _FakeResponse(status=404) if "broken" in url else _FakeResponse()

    problem = _verify_plan_assets_reachable(urls, assets, 15, get)
    assert problem is not None
    assert "broken.jpg" in problem
    assert calls == urls[:2], "must stop at the first failure, not check every asset"


def test_all_clean_urls_report_no_problem():
    urls = ["https://t.example/a.jpg", "https://t.example/b.jpg"]
    assets = [_asset(), _asset()]
    assert _verify_plan_assets_reachable(urls, assets, 15, _get_fn(_FakeResponse())) is None


def test_pairs_each_url_with_its_own_assets_media_kind():
    # A video posted with an image URL (or the reverse) must be caught, not waved through
    # by a bare "did this respond" check.
    urls = ["https://t.example/reel.mp4"]
    assets = [_asset("video")]
    problem = _verify_plan_assets_reachable(
        urls, assets, 15, _get_fn(_FakeResponse(content_type="image/jpeg"))
    )
    assert problem is not None
    assert "video/" in problem


# ---- publish_one: opt-in wiring --------------------------------------------------------

def test_publish_one_skips_verification_by_default(conn, config, make_publication):
    from worker.tests.conftest import FakeGraphClient

    # verify_url_fn defaults to None — must never even attempt a network call, since this
    # exact call shape (fake tunnel URL, fake client) is how publish_one is exercised
    # throughout the rest of this test suite.
    pub = make_publication(public_url=None)
    out = publish_one(
        conn, pub, config, FakeGraphClient(),
        dry_run=False, asset_base_url="https://calm-river.trycloudflare.com",
    )
    assert out.result == "posted"


def test_publish_one_fails_retryably_when_the_asset_url_is_broken(conn, config, make_publication):
    from worker.tests.conftest import FakeGraphClient

    pub = make_publication(public_url=None)
    out = publish_one(
        conn, pub, config, FakeGraphClient(),
        dry_run=False, asset_base_url="https://calm-river.trycloudflare.com",
        verify_url_fn=_get_fn(_FakeResponse(status=404, content_type=None, body=b"")),
    )
    assert out.result == "retry_scheduled"
    assert "asset not reachable" in out.detail
    assert "404" in out.detail
    row = conn.execute(
        "SELECT status, next_retry_at FROM publications WHERE id=?", (pub["id"],)
    ).fetchone()
    # terminal=False: this is a delivery problem, not bad data — it belongs in the normal
    # retry queue (status back to 'scheduled' with a next_retry_at), not 'failed' forever.
    assert row["status"] == "scheduled"
    assert row["next_retry_at"] is not None


def test_publish_one_verification_passes_through_a_working_url(conn, config, make_publication):
    from worker.tests.conftest import FakeGraphClient

    pub = make_publication(public_url=None)
    client = FakeGraphClient()
    out = publish_one(
        conn, pub, config, client,
        dry_run=False, asset_base_url="https://calm-river.trycloudflare.com",
        verify_url_fn=_get_fn(_FakeResponse()),
    )
    assert out.result == "posted"


def test_publish_one_skips_verification_for_byte_upload_platforms(
    conn, config, make_publication, fake_discord_client
):
    # Discord uploads the local file directly (caps.uploads_media_bytes=True) and never
    # hands anyone a URL — a verify_url_fn that would fail every check must be ignored
    # entirely for this platform, never even called.
    pub = make_publication(platform="discord", public_url=None)
    rows = conn.execute(
        "SELECT a.storage_path FROM assets a JOIN post_assets pa ON pa.asset_id = a.id "
        "WHERE pa.post_id = ?",
        (pub["post_id"],),
    ).fetchall()
    for row in rows:
        path = config.asset_storage_dir / row["storage_path"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"bytes")

    calls = []

    def exploding_get(url, stream=True, timeout=None):
        calls.append(url)
        raise AssertionError("byte-upload platforms must never reach URL verification")

    out = publish_one(
        conn, pub, config, fake_discord_client,
        dry_run=False, asset_base_url=None, verify_url_fn=exploding_get,
    )
    assert calls == []
    assert out.result == "posted"


def test_publish_one_dry_run_never_calls_verify_url_fn(conn, config, make_publication):
    from worker.tests.conftest import FakeGraphClient

    pub = make_publication(public_url=None)
    calls = []

    def exploding_get(url, stream=True, timeout=None):
        calls.append(url)
        raise AssertionError("a dry run must never touch the network")

    out = publish_one(
        conn, pub, config, FakeGraphClient(),
        dry_run=True, asset_base_url=None, verify_url_fn=exploding_get,
    )
    assert out.result == "dry_run"
    assert calls == []
