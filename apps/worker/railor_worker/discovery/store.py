"""Persistence for discovery: review-queue writes only. Nothing here publishes a capability."""

from __future__ import annotations

import hashlib
from typing import Any

import psycopg

from ..config import get_settings
from ..db import connection
from ..storage import store_snapshot
from .run import KIND_TO_CHANGE, DiscoveryReport, VerifiedClaim
from .verify import registrable_domain


def _hash(*parts: str) -> str:
    return hashlib.sha256("␟".join(parts).encode("utf-8")).hexdigest()


class DbSink:
    """Verified claims → evidence + pending change events (known providers) or provider candidates."""

    def __init__(self, job_id: str | None = None) -> None:
        self.job_id = job_id
        self._docs: dict[tuple[str, str], tuple[str, str]] = {}

    def known_providers(self) -> list[dict[str, Any]]:
        with connection() as conn:
            return conn.execute("select id, slug, name, website_url from providers where not is_demo").fetchall()

    def _source_and_snapshot(self, conn: psycopg.Connection, provider: dict, verified: VerifiedClaim) -> tuple[str, str]:
        page = verified.page
        key = (provider["id"], page.url)
        if key in self._docs:
            return self._docs[key]
        source_type = ("pricing" if verified.claim.kind == "pricing" else "official_docs") if verified.official else "third_party"
        doc = conn.execute(
            """
            insert into source_documents (provider_id, url, title, source_type, enabled, crawl_frequency_hours, next_check_at)
            values (%s, %s, %s, %s, %s, %s, now() + interval '1 day')
            on conflict (provider_id, url) do update set title = excluded.title
            returning id
            """,
            # Official pages join the regular crawl (monitored for changes); third-party pages are evidence only.
            (provider["id"], page.url, (page.title or page.url)[:300], source_type, verified.official, 72),
        ).fetchone()
        path = store_snapshot(provider["slug"], page.content_hash, page.html, get_settings().snapshot_dir)
        snap = conn.execute(
            """
            insert into source_snapshots (source_document_id, http_status, content_hash, storage_path, extracted_text)
            values (%s, %s, %s, %s, %s) returning id
            """,
            (doc["id"], page.status, page.content_hash, path, page.text[:20000]),
        ).fetchone()
        self._docs[key] = (doc["id"], snap["id"])
        return self._docs[key]

    def record(self, report: DiscoveryReport, verified: VerifiedClaim, provider: dict | None) -> str:
        claim = verified.claim
        if provider is None:
            return self._candidate(report, verified) if claim.provider_website else "unattributed"
        with connection() as conn:
            source_id, snapshot_id = self._source_and_snapshot(conn, provider, verified)
            raw_hash = _hash(verified.page.url, claim.quote)
            existing = conn.execute("select id from evidence where provider_id = %s and raw_hash = %s", (provider["id"], raw_hash)).fetchone()
            if existing:
                conn.commit()
                return "duplicate"
            evidence = conn.execute(
                """
                insert into evidence
                  (provider_id, source_document_id, snapshot_id, source_url, source_title, source_type,
                   verification_type, retrieved_at, last_verified_at, confidence, raw_excerpt, raw_hash)
                values (%s, %s, %s, %s, %s, %s, %s, now(), now(), %s, %s, %s) returning id
                """,
                (
                    provider["id"], source_id, snapshot_id, verified.page.url, (verified.page.title or verified.page.url)[:300],
                    ("pricing" if claim.kind == "pricing" else "official_docs") if verified.official else "third_party",
                    # A third-party page is Railor's observation of a claim, not the provider's own statement.
                    "provider_reported" if verified.official else "railor_observed",
                    0.7 if verified.official else 0.45, claim.quote[:2000], raw_hash,
                ),
            ).fetchone()
            affects = {k: v for k, v in {
                "entity_country": claim.entity_country, "destination_country": claim.destination_country,
                "destination_currency": claim.destination_currency, "source_asset": claim.source_asset,
            }.items() if v}
            conn.execute(
                """
                insert into change_events
                  (provider_id, kind, field, previous_value, current_value, summary, source_document_id,
                   evidence_id, confidence, review_status, affects)
                values (%s, %s, %s, null, %s, %s, %s, %s, %s, 'pending', %s)
                """,
                (
                    provider["id"], KIND_TO_CHANGE[claim.kind], claim.kind, claim.statement[:1000],
                    f"Web discovery ({'official page' if verified.official else 'third-party page'}): {claim.statement}"[:500],
                    source_id, evidence["id"], 0.7 if verified.official else 0.45, psycopg.types.json.Json(affects),
                ),
            )
            conn.commit()
        return "change_event"

    def _candidate(self, report: DiscoveryReport, verified: VerifiedClaim) -> str:
        claim = verified.claim
        domain = registrable_domain(claim.provider_website or "")
        if not domain or "." not in domain:
            return "unattributed"
        item = {
            "url": verified.page.url, "title": verified.page.title, "quote": claim.quote, "statement": claim.statement,
            "kind": claim.kind, "official": verified.official, "hash": _hash(verified.page.url, claim.quote),
        }
        with connection() as conn:
            row = conn.execute("select id, evidence from provider_candidates where domain = %s", (domain,)).fetchone()
            if row:
                evidence = row["evidence"] or []
                if all(e.get("hash") != item["hash"] for e in evidence):
                    evidence = (evidence + [item])[-40:]
                conn.execute(
                    "update provider_candidates set evidence = %s, last_seen_at = now() where id = %s",
                    (psycopg.types.json.Json(evidence), row["id"]),
                )
            else:
                conn.execute(
                    """
                    insert into provider_candidates (name, domain, website_url, evidence, corridor, job_id)
                    values (%s, %s, %s, %s, %s, %s)
                    """,
                    (claim.provider_name[:120], domain, f"https://{domain}", psycopg.types.json.Json([item]), psycopg.types.json.Json(report.query), self.job_id),
                )
            conn.commit()
        return "candidate"


def claim_next_job() -> dict[str, Any] | None:
    """Oldest queued job, claimed so two workers never run the same one."""
    with connection() as conn:
        row = conn.execute(
            """
            update discovery_jobs set status = 'running', started_at = now()
             where id = (select id from discovery_jobs where status = 'queued' order by created_at for update skip locked limit 1)
            returning *
            """
        ).fetchone()
        conn.commit()
        return row


def finish_job(job_id: str, report: DiscoveryReport) -> None:
    with connection() as conn:
        conn.execute(
            "update discovery_jobs set status = %s, finished_at = now(), summary = %s, error = %s where id = %s",
            ("failed" if report.error else "done", psycopg.types.json.Json(report.summary()), report.error, job_id),
        )
        conn.commit()


def fail_job(job_id: str, message: str) -> None:
    with connection() as conn:
        conn.execute("update discovery_jobs set status = 'failed', finished_at = now(), error = %s where id = %s", (message[:1000], job_id))
        conn.commit()


def provider_by_slug(slug: str) -> dict[str, Any] | None:
    with connection() as conn:
        return conn.execute("select id, slug, name, website_url from providers where slug = %s and not is_demo", (slug,)).fetchone()


__all__ = ["DbSink", "claim_next_job", "finish_job", "fail_job", "provider_by_slug"]
