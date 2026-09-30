"""Outbound URL guard for everything the worker fetches.

URLs reach the worker from source registries and — with web discovery — from
search results, so they are untrusted. Every hop (redirects included) must be
http(s) and resolve only to public addresses, and bodies are size-capped.
Mirrors packages/core/src/net-guard.ts on the TypeScript side.
"""

from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import httpx

MAX_REDIRECTS = 5


class BlockedURL(Exception):
    """The URL (or a redirect hop) points somewhere the worker must not go."""


def _is_private_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
        or (isinstance(ip, ipaddress.IPv4Address) and ip in ipaddress.ip_network("100.64.0.0/10"))
    )


def is_private_host(host: str) -> bool:
    h = host.strip("[]").lower().rstrip(".")
    if h in ("localhost",) or h.endswith((".localhost", ".local", ".internal")):
        return True
    return _is_private_ip(h)


def assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise BlockedURL(f"not an http(s) URL: {url[:120]}")
    if parsed.username or parsed.password:
        raise BlockedURL("URLs with credentials are not fetched")
    host = parsed.hostname
    if is_private_host(host):
        raise BlockedURL(f"private address: {host}")
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise BlockedURL(f"unresolvable host {host}: {exc}") from exc
    if not infos or any(_is_private_ip(info[4][0]) for info in infos):
        raise BlockedURL(f"{host} resolves to a private address")


@dataclass
class GuardedResponse:
    url: str
    status: int
    headers: httpx.Headers
    body: bytes

    @property
    def text(self) -> str:
        encoding = "utf-8"
        content_type = self.headers.get("content-type", "")
        if "charset=" in content_type:
            encoding = content_type.split("charset=", 1)[1].split(";")[0].strip() or "utf-8"
        return self.body.decode(encoding, errors="replace")


def guarded_get(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout: float = 20.0,
    max_bytes: int = 2_000_000,
    follow: bool = True,
) -> GuardedResponse:
    """GET with every hop checked; redirects followed manually (at most MAX_REDIRECTS)."""
    current = url
    with httpx.Client(timeout=timeout, follow_redirects=False) as client:
        for _ in range(MAX_REDIRECTS + 1):
            assert_public_url(current)
            with client.stream("GET", current, headers=headers or {}) as response:
                if follow and response.status_code in (301, 302, 303, 307, 308) and response.headers.get("location"):
                    current = urljoin(current, response.headers["location"])
                    continue
                chunks: list[bytes] = []
                size = 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > max_bytes:
                        raise BlockedURL(f"response larger than {max_bytes} bytes")
                    chunks.append(chunk)
                return GuardedResponse(current, response.status_code, response.headers, b"".join(chunks))
    raise BlockedURL("too many redirects")


GROUNDING_REDIRECTORS = frozenset({"vertexaisearch.cloud.google.com"})


def resolve_redirect(url: str, *, timeout: float = 15.0, redirectors: frozenset[str] = GROUNDING_REDIRECTORS) -> str:
    """The real page behind a redirector link (Google grounding citations), without fetching that page."""
    current = url
    with httpx.Client(timeout=timeout, follow_redirects=False) as client:
        for _ in range(MAX_REDIRECTS):
            if (urlparse(current).hostname or "") not in redirectors:
                assert_public_url(current)
                return current
            response = client.get(current)
            location = response.headers.get("location")
            if response.status_code not in (301, 302, 303, 307, 308) or not location:
                raise BlockedURL(f"redirector answered HTTP {response.status_code} without a location")
            current = urljoin(current, location)
    raise BlockedURL("too many redirects")
