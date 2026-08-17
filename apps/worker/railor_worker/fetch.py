"""Polite fetching.

Priority order across the whole worker: official API → direct HTTP → Scrapy →
Playwright. Browser automation is a fallback, never the default. Robots rules,
site terms and rate limits are respected; protections such as CAPTCHAs are
never bypassed — a blocked source is recorded as blocked.
"""

from __future__ import annotations

import hashlib
import time
import urllib.robotparser as robotparser
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import urlparse

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from .config import get_settings

_last_request_at: dict[str, float] = {}
MIN_INTERVAL_SECONDS = 2.0


@dataclass
class FetchResult:
    status: int | None
    body: str | None
    content_hash: str | None
    etag: str | None
    last_modified: str | None
    unchanged: bool
    error: str | None = None


def content_hash(body: str) -> str:
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


@lru_cache(maxsize=256)
def _robots_for(origin: str) -> robotparser.RobotFileParser:
    parser = robotparser.RobotFileParser()
    parser.set_url(f"{origin}/robots.txt")
    try:
        parser.read()
    except Exception:  # An unreachable robots.txt is treated as "no rules stated".
        parser.parse([])
    return parser


def allowed(url: str) -> bool:
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    return _robots_for(origin).can_fetch(get_settings().user_agent, url)


def _throttle(host: str) -> None:
    last = _last_request_at.get(host)
    if last is not None:
        wait = MIN_INTERVAL_SECONDS - (time.monotonic() - last)
        if wait > 0:
            time.sleep(wait)
    _last_request_at[host] = time.monotonic()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=20))
def _get(url: str, headers: dict[str, str]) -> httpx.Response:
    settings = get_settings()
    return httpx.get(
        url,
        headers={"user-agent": settings.user_agent, **headers},
        timeout=settings.request_timeout,
        follow_redirects=True,
    )


def fetch(url: str, *, etag: str | None = None, last_modified: str | None = None) -> FetchResult:
    """Conditional GET. A 304 short-circuits the whole pipeline for that source."""
    if not allowed(url):
        return FetchResult(None, None, None, None, None, False, error="disallowed_by_robots")

    headers: dict[str, str] = {}
    if etag:
        headers["if-none-match"] = etag
    if last_modified:
        headers["if-modified-since"] = last_modified

    _throttle(urlparse(url).netloc)

    try:
        response = _get(url, headers)
    except Exception as exc:  # network, DNS, TLS, timeout
        return FetchResult(None, None, None, None, None, False, error=f"{type(exc).__name__}: {exc}")

    if response.status_code == 304:
        return FetchResult(304, None, None, etag, last_modified, True)

    if response.status_code >= 400:
        return FetchResult(
            response.status_code, None, None, None, None, False, error=f"http_{response.status_code}"
        )

    body = response.text
    return FetchResult(
        status=response.status_code,
        body=body,
        content_hash=content_hash(body),
        etag=response.headers.get("etag"),
        last_modified=response.headers.get("last-modified"),
        unchanged=False,
    )
