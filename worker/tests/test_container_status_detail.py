"""A failed Instagram container used to log nothing but "status=ERROR" — Meta's own
container object carries the reason in a separate `status` field, right next to the
`status_code` enum get_container_status already reads, and nothing asked for it.

Covers both halves: GraphClient.get_container_status_detail reading that field (and
staying silent, never raising, when it can't), and _poll_until_finished folding the
result into the RuntimeError message that worker.publisher._mark_failure writes
straight to publications.last_error — which the dashboard renders on the Overview page
and the post editor's Scheduled sends panel.
"""

from __future__ import annotations

import pytest
import requests

from worker.graph_api import GraphClient
from worker.publisher import _poll_until_finished


class FakeResponse:
    def __init__(self, payload=None, *, status=200):
        self._payload = payload if payload is not None else {}
        self.status_code = status
        self.ok = 200 <= status < 300
        self.text = "" if self.ok else str(payload)
        self.headers = {}

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        return self.response


class RaisingSession:
    def get(self, url, params=None, timeout=None):
        raise requests.ConnectionError("boom")


def _client(response):
    session = FakeSession(response)
    return GraphClient("v25.0", session=session), session


# ---- GraphClient.get_container_status_detail -----------------------------------------

def test_reads_the_status_field_alongside_status_code():
    client, session = _client(
        FakeResponse({"status_code": "ERROR", "status": "Media contains a copyrighted song."})
    )
    assert client.get_container_status_detail("cont-1", "tok") == (
        "Media contains a copyrighted song."
    )
    _, params = session.calls[0]
    assert params["fields"] == "status,status_code"


def test_returns_none_when_status_field_is_absent():
    client, _ = _client(FakeResponse({"status_code": "ERROR"}))
    assert client.get_container_status_detail("cont-1", "tok") is None


def test_returns_none_rather_than_a_blank_string():
    client, _ = _client(FakeResponse({"status_code": "ERROR", "status": "   "}))
    assert client.get_container_status_detail("cont-1", "tok") is None


def test_a_failed_lookup_returns_none_instead_of_raising():
    # This runs while already reporting a failure — a second, unrelated error here must
    # never replace or hide the one actually worth surfacing.
    client = GraphClient("v25.0", session=RaisingSession())
    assert client.get_container_status_detail("cont-1", "tok") is None


def test_a_non_ok_response_returns_none_instead_of_raising():
    client, _ = _client(FakeResponse({"error": {"message": "nope"}}, status=400))
    assert client.get_container_status_detail("cont-1", "tok") is None


# ---- _poll_until_finished folds the detail into the raised message -------------------

class _Cfg:
    status_poll_interval = 0
    status_poll_max_tries = 3


def _noop_sleep(_seconds):
    pass


def test_poll_failure_names_the_reason_when_the_client_can_supply_one():
    class _Client:
        def get_container_status(self, cid, token):
            return "ERROR"

        def get_container_status_detail(self, cid, token):
            return "Media contains a copyrighted song."

    with pytest.raises(RuntimeError) as excinfo:
        _poll_until_finished(_Client(), "cont-1", "tok", _Cfg(), _noop_sleep)
    message = str(excinfo.value)
    assert "status=ERROR" in message
    assert "Media contains a copyrighted song." in message


def test_poll_failure_falls_back_cleanly_when_no_detail_is_available():
    class _Client:
        def get_container_status(self, cid, token):
            return "ERROR"

        def get_container_status_detail(self, cid, token):
            return None

    with pytest.raises(RuntimeError) as excinfo:
        _poll_until_finished(_Client(), "cont-1", "tok", _Cfg(), _noop_sleep)
    assert str(excinfo.value) == "container cont-1 status=ERROR"


def test_poll_failure_tolerates_a_client_with_no_detail_method_at_all():
    # The shape Threads' client is in: it reuses this same poll loop (via status_fn) but
    # has no equivalent lookup, so the old plain message must still come out unchanged.
    class _Client:
        def get_container_status(self, cid, token):
            return "EXPIRED"

    with pytest.raises(RuntimeError) as excinfo:
        _poll_until_finished(_Client(), "cont-1", "tok", _Cfg(), _noop_sleep)
    assert str(excinfo.value) == "container cont-1 status=EXPIRED"
