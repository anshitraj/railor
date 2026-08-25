"""
Executes the conformance test catalog and records results in
conformance_runs. A row in conformance_tests says nothing about the world —
schema.ts's own comment on that table is explicit about this — only a run
does, and until this module existed nothing ever ran one.

Most test kinds need the provider's own authenticated API: sandbox login,
quote endpoints, webhook signing. Railor holds no provider credentials —
provider_connections is Stage 5, explicitly "no credentials... in V1" per
its own schema comment — so those kinds resolve honestly to
`access_required` rather than being skipped or faked pass/fail.

The two kinds answerable from public information alone actually run for
real: docs_parity (is the documented source still there and readable) and
status_endpoint (is the provider's status page up), each a live HTTP check
against the URL on file for that provider.

    python -m railor_worker.cli conformance
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from . import db
from .fetch import allowed

# Every kind that needs the provider's own authenticated API. Railor has no
# provider credentials yet, so these are always `access_required` today —
# revisit once provider_connections actually stores something (Stage 5).
REQUIRES_CREDENTIALS = {
    "authentication",
    "quote_api",
    "quote_schema",
    "idempotency",
    "beneficiary_validation",
    "asset_network_availability",
    "response_schema",
}

NO_CREDENTIALS_DETAIL = "needs the provider's own API credentials — provider_connections holds none in V1"


def _fetch(url: str) -> tuple[str, str, int | None]:
    if not allowed(url):
        return "access_required", "robots.txt disallows fetching this source", None
    start = time.monotonic()
    try:
        response = httpx.get(url, timeout=15, follow_redirects=True)
    except httpx.HTTPError as exc:
        return "fail", f"{type(exc).__name__}: {exc}", int((time.monotonic() - start) * 1000)
    latency = int((time.monotonic() - start) * 1000)
    if response.status_code >= 400:
        return "fail", f"HTTP {response.status_code}", latency
    if len(response.text) < 200:
        return "warning", f"HTTP {response.status_code} but only {len(response.text)} bytes back", latency
    return "pass", f"HTTP {response.status_code}, {len(response.text)} bytes", latency


def _run_one(kind: str, provider: dict[str, Any]) -> tuple[str, str, int | None]:
    if kind in REQUIRES_CREDENTIALS:
        return "access_required", NO_CREDENTIALS_DETAIL, None
    if kind == "docs_parity":
        url = provider.get("docs_url")
        return ("not_tested", "no docs_url on record", None) if not url else _fetch(url)
    if kind == "status_endpoint":
        url = provider.get("status_page_url")
        return ("not_tested", "no status_page_url on record", None) if not url else _fetch(url)
    return "not_tested", "no runner implemented for this kind yet", None


def run_all() -> list[str]:
    log: list[str] = []
    with db.connection() as conn:
        providers = conn.execute(
            "select id, slug, docs_url, status_page_url from providers where is_demo = false"
        ).fetchall()

        for provider in providers:
            tests = conn.execute(
                "select id, kind from conformance_tests where provider_id = %s and enabled",
                (provider["id"],),
            ).fetchall()
            for test in tests:
                status, detail, latency = _run_one(test["kind"], provider)
                conn.execute(
                    "insert into conformance_runs (test_id, status, detail, latency_ms) values (%s, %s, %s, %s)",
                    (test["id"], status, detail, latency),
                )
                log.append(f"{provider['slug']:<10} {test['kind']:<26} {status:<15} {detail}")
        conn.commit()
    return log
