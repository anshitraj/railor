"""Railor's own check of what the model says: fetch the page, find the quote."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import urlparse

from ..extract import to_text
from ..fetch import _throttle, allowed, content_hash
from ..netguard import BlockedURL, guarded_get, resolve_redirect

_QUOTES = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", " ": " "})


def normalize(text: str) -> str:
    """Case, quote style, dash style and whitespace are presentation, not content."""
    text = unicodedata.normalize("NFKC", text).translate(_QUOTES).lower()
    return re.sub(r"\s+", " ", text).strip()


def quote_on_page(quote: str, page_text: str) -> bool:
    """Exact (normalized) containment of one contiguous quote. Edited quotes (ellipses) never pass."""
    q = normalize(quote).strip(" \"'")
    if len(q) < 25 or "..." in q or "…" in quote:
        return False
    return q in normalize(page_text)


_STOP = frozenset(
    "a an the and or of to in on for with by from at as is are be can its it this that these those via our your their "
    "not no yes do does using use allows allow lets let offer offers supports support provide provides".split()
)


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+(?:\.[0-9]+)?", normalize(text)) if w not in _STOP and len(w) > 1}


def quote_supports(statement: str, quote: str, provider_name: str = "") -> bool:
    """
    A cheap, deterministic entailment guard: every number in the statement must
    appear in the quote, and most of the statement's content words must too.
    Catches a real quote pasted under an unrelated claim ("No, OFX works well
    for businesses" offered as proof of "there is no limit").
    """
    numbers = set(re.findall(r"\d+(?:[.,]\d+)?", statement))
    if any(n not in quote for n in numbers):
        return False
    words = _words(statement) - _words(provider_name)
    if not words:
        return True
    return len(words & _words(quote)) / len(words) >= 0.5


def registrable_domain(url_or_host: str) -> str:
    host = urlparse(url_or_host).hostname if "://" in url_or_host else url_or_host
    host = (host or "").lower().strip(".")
    return host[4:] if host.startswith("www.") else host


@dataclass
class FetchedPage:
    source_id: int
    url: str
    title: str
    html: str
    text: str
    status: int
    content_hash: str


@dataclass
class SkippedPage:
    url: str
    reason: str


# Pages whose content is user-generated or a mirror of someone else's claim — kept out of evidence.
NOT_EVIDENCE = ("reddit.com", "quora.com", "facebook.com", "x.com", "twitter.com", "linkedin.com", "youtube.com", "instagram.com", "medium.com")


def fetch_cited_pages(citations, *, user_agent: str, max_pages: int = 8, text_limit: int = 14_000) -> tuple[list[FetchedPage], list[SkippedPage]]:
    pages: list[FetchedPage] = []
    skipped: list[SkippedPage] = []
    seen: set[str] = set()
    for citation in citations:
        if len(pages) >= max_pages:
            break
        try:
            url = resolve_redirect(citation.uri)
        except BlockedURL as exc:
            skipped.append(SkippedPage(citation.uri[:120], f"unresolvable citation: {exc}"))
            continue
        if url in seen:
            continue
        seen.add(url)
        domain = registrable_domain(url)
        if any(domain == d or domain.endswith("." + d) for d in NOT_EVIDENCE):
            skipped.append(SkippedPage(url, "user-generated or social content is not evidence"))
            continue
        if not allowed(url):
            skipped.append(SkippedPage(url, "disallowed by robots.txt"))
            continue
        _throttle(urlparse(url).netloc)
        try:
            response = guarded_get(url, headers={"user-agent": user_agent, "accept": "text/html,application/xhtml+xml"}, timeout=20)
        except Exception as exc:  # blocked, network, TLS, too large
            skipped.append(SkippedPage(url, f"{type(exc).__name__}: {str(exc)[:120]}"))
            continue
        content_type = response.headers.get("content-type", "")
        if response.status >= 400 or "html" not in content_type:
            skipped.append(SkippedPage(url, f"HTTP {response.status} {content_type.split(';')[0]}"))
            continue
        html = response.text
        text = to_text(html)
        if len(text) < 200:
            skipped.append(SkippedPage(url, "no readable text (likely rendered by JavaScript)"))
            continue
        pages.append(FetchedPage(len(pages) + 1, response.url, citation.title, html, text[:text_limit], response.status, content_hash(html)))
    return pages, skipped
