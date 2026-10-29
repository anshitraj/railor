from types import SimpleNamespace

import pytest

from railor_worker import fetch as fetch_module
from railor_worker.netguard import BlockedURL


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    fetch_module._robots_for.cache_clear()
    monkeypatch.setattr(fetch_module, "get_settings", lambda: SimpleNamespace(user_agent="RailorBot", request_timeout=20))
    yield
    fetch_module._robots_for.cache_clear()


def test_robots_uses_guarded_bounded_fetch(monkeypatch):
    calls = []

    def guarded(url, **kwargs):
        calls.append((url, kwargs))
        return SimpleNamespace(status=200, text="User-agent: *\nDisallow: /private")

    monkeypatch.setattr(fetch_module, "guarded_get", guarded)
    assert not fetch_module.allowed("https://example.com/private/page")
    assert fetch_module.allowed("https://example.com/public")
    assert len(calls) == 1
    assert calls[0][0] == "https://example.com/robots.txt"
    assert calls[0][1]["max_bytes"] == 512_000
    assert calls[0][1]["timeout"] == 20


@pytest.mark.parametrize("status", [401, 403, 429, 500, 503])
def test_robots_denial_or_failure_never_opens_access(monkeypatch, status):
    monkeypatch.setattr(fetch_module, "guarded_get", lambda *a, **k: SimpleNamespace(status=status, text=""))
    assert not fetch_module.allowed("https://example.com/source")


def test_absent_robots_file_has_no_rules(monkeypatch):
    monkeypatch.setattr(fetch_module, "guarded_get", lambda *a, **k: SimpleNamespace(status=404, text=""))
    assert fetch_module.allowed("https://example.com/source")


def test_blocked_robots_redirect_is_not_followed_by_an_unguarded_request(monkeypatch):
    def blocked(*args, **kwargs):
        raise BlockedURL("private redirect")

    monkeypatch.setattr(fetch_module, "guarded_get", blocked)
    assert not fetch_module.allowed("https://example.com/source")
