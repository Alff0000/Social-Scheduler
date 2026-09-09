"""A failed Instagram container used to log nothing but "status=ERROR" — and the first
fix for that (reading the container's `status` field as if it were a human sentence) was
itself wrong: Meta's own IG Container reference says `status` is "an error subcode" when
status_code is ERROR — a NUMBER (e.g. 2207009) referencing Meta's published error-codes
table, not free text. A real failure proved it: `status` came back as the literal string
"ERROR", mirroring status_code with no subcode at all, and the old fix dutifully logged
the useless "status=ERROR (ERROR)".

Covers GraphClient.get_container_status_detail correctly reading that field as a subcode
(translating known ones via _CONTAINER_ERROR_MESSAGES, naming unknown ones by number
rather than staying silent, and recognising the no-subcode-given case instead of echoing
status_code back), and _poll_until_finished folding the result into the RuntimeError
message that worker.publisher._mark_failure writes straight to publications.last_error —
which the dashboard renders on the Overview page and the post editor's Scheduled sends
panel.
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

def test_translates_a_known_subcode_to_its_documented_message():
    client, session = _client(FakeResponse({"status_code": "ERROR", "status": "2207009"}))
    detail = client.get_container_status_detail("cont-1", "tok")
    assert detail == "error subcode 2207009: The image's aspect ratio is not supported."
    _, params = session.calls[0]
    assert params["fields"] == "status,status_code"


def test_names_an_unrecognised_subcode_by_number_rather_than_staying_silent():
    client, _ = _client(FakeResponse({"status_code": "ERROR", "status": "9999999"}))
    assert client.get_container_status_detail("cont-1", "tok") == "error subcode 9999999"


def test_no_subcode_given_returns_none_instead_of_echoing_status_code():
    # The real case this fix exists for: Meta returned no subcode at all, and `status`
    # just repeats status_code. There is nothing new to say, so say nothing rather than
    # producing the useless "status=ERROR (ERROR)".
    client, _ = _client(FakeResponse({"status_code": "ERROR", "status": "ERROR"}))
    assert client.get_container_status_detail("cont-1", "tok") is None


def test_returns_none_when_status_field_is_absent():
    client, _ = _client(FakeResponse({"status_code": "ERROR"}))
    assert client.get_container_status_detail("cont-1", "tok") is None


def test_non_numeric_status_is_still_shown_verbatim():
    # Not the documented shape, but real text Meta sent — surfaced rather than discarded
    # on a format assumption that might be wrong or might change.
    client, _ = _client(FakeResponse({"status_code": "ERROR", "status": "container_expired_early"}))
    assert client.get_container_status_detail("cont-1", "tok") == "container_expired_early"


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
            return "error subcode 2207009: The image's aspect ratio is not supported."

    with pytest.raises(RuntimeError) as excinfo:
        _poll_until_finished(_Client(), "cont-1", "tok", _Cfg(), _noop_sleep)
    message = str(excinfo.value)
    assert "status=ERROR" in message
    assert "2207009" in message
    assert "aspect ratio" in message


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
