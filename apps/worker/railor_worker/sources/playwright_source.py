"""Playwright fallback for sources that genuinely require JavaScript.

This path is deliberately last. It is slower, heavier and more brittle than an
HTTP fetch, so it runs only when `source_documents.requires_js` is true. It
renders and reads; it never logs in, never solves a challenge, and never
bypasses a protection. A source that refuses anonymous rendering is recorded as
blocked so a human can decide what to do.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..config import get_settings
from ..fetch import allowed, content_hash


@dataclass
class RenderResult:
    html: str | None
    content_hash: str | None
    error: str | None = None


def render(url: str, *, wait_for: str | None = None, timeout_ms: int = 20_000) -> RenderResult:
    if not allowed(url):
        return RenderResult(None, None, error="disallowed_by_robots")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return RenderResult(
            None,
            None,
            error="playwright_not_installed (pip install 'railor-worker[browser]' && playwright install chromium)",
        )

    settings = get_settings()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(user_agent=settings.user_agent)
            page = context.new_page()
            page.goto(url, timeout=timeout_ms, wait_until="networkidle")

            if wait_for:
                page.wait_for_selector(wait_for, timeout=timeout_ms)

            # A challenge page is a blocked source, not a source to work around.
            title = (page.title() or "").lower()
            if "just a moment" in title or "attention required" in title:
                return RenderResult(None, None, error="challenge_page_encountered")

            html = page.content()
            return RenderResult(html, content_hash(html))
        except Exception as exc:
            return RenderResult(None, None, error=f"{type(exc).__name__}: {exc}")
        finally:
            browser.close()
