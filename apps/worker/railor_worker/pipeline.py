"""The ingestion pipeline.

    SOURCE REGISTRY → FETCH → RAW SNAPSHOT → CONTENT EXTRACTION →
    STRUCTURED EXTRACTION → NORMALIZATION → VALIDATION → DIFF →
    HUMAN REVIEW (when required) → PUBLISH

Nothing here writes to `provider_capabilities`. Extraction proposes; the review
console disposes. That boundary is the reason Railor can be trusted.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import db
from .config import get_settings
from .diff import diff_claims
from .extract import RuleExtractor, to_text
from .fetch import fetch

log = logging.getLogger("railor.worker")

SOURCE_CONFIDENCE = {
    "api": 1.0,
    "status_page": 0.98,
    "official_docs": 0.95,
    "help_center": 0.92,
    "official_announcement": 0.90,
    "pricing": 0.90,
    "terms": 0.88,
    "github": 0.85,
    "third_party": 0.60,
}


@dataclass
class SourceOutcome:
    source_id: str
    url: str
    status: str  # unchanged | updated | blocked | error
    changes: int = 0
    detail: str | None = None


def _store_snapshot(provider_slug: str, content_hash: str, body: str) -> str:
    """Raw bodies live in object storage; Postgres keeps the pointer and the text."""
    directory = Path(get_settings().snapshot_dir) / provider_slug
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{content_hash[:16]}.html"
    path.write_text(body, encoding="utf-8")
    return str(path)


def process_source(source: dict[str, Any]) -> SourceOutcome:
    result = fetch(source["url"], etag=source.get("etag"), last_modified=source.get("last_modified"))

    if result.error == "disallowed_by_robots":
        db.touch_source(
            source["id"],
            content_hash=None,
            etag=None,
            last_modified=None,
            interval_hours=source["crawl_frequency_hours"] * 4,
            error="disallowed_by_robots",
        )
        return SourceOutcome(source["id"], source["url"], "blocked", detail="robots.txt disallows")

    if result.error:
        db.touch_source(
            source["id"],
            content_hash=None,
            etag=None,
            last_modified=None,
            interval_hours=max(1, source["crawl_frequency_hours"] // 2),
            error=result.error,
        )
        return SourceOutcome(source["id"], source["url"], "error", detail=result.error)

    if result.unchanged or result.content_hash == source.get("content_hash"):
        db.touch_source(
            source["id"],
            content_hash=result.content_hash,
            etag=result.etag,
            last_modified=result.last_modified,
            interval_hours=source["crawl_frequency_hours"],
        )
        return SourceOutcome(source["id"], source["url"], "unchanged")

    assert result.body is not None and result.content_hash is not None
    text = to_text(result.body)
    storage_path = _store_snapshot(source["provider_slug"], result.content_hash, result.body)
    snapshot_id = db.record_snapshot(
        source["id"], result.status, result.content_hash, storage_path, text
    )

    claims = RuleExtractor().extract(text)
    published = db.existing_capability_values(source["provider_id"])

    # `existing_capability_values` is keyed by dimensions; the diff is keyed by
    # claim kind, so translate before comparing.
    published_by_claim: dict[str, str] = {}
    for key, availability in published.items():
        parts = key.split(":")
        product, entity, _customer, asset, network, dest_country, dest_currency, _method = parts
        if entity != "any":
            published_by_claim[f"entity_country:{entity}"] = availability
        if asset != "any":
            published_by_claim.setdefault(f"asset:{asset}", availability)
        if network != "any":
            published_by_claim.setdefault(f"network:{network}", availability)
        if dest_country != "any":
            published_by_claim.setdefault(f"destination:{dest_country}", availability)
        if dest_currency != "any":
            published_by_claim.setdefault(f"destination:{dest_currency}", availability)
        del product

    base_confidence = SOURCE_CONFIDENCE.get(source["source_type"], 0.6)
    changes = diff_claims(source["provider_name"], claims, published_by_claim)

    for change in changes:
        evidence_id = db.insert_evidence(
            source["provider_id"],
            source["id"],
            snapshot_id,
            url=source["url"],
            title=source["title"],
            source_type=source["source_type"],
            confidence=min(base_confidence, change.confidence),
            excerpt=change.summary,
            raw_hash=result.content_hash,
        )
        db.insert_change_event(
            source["provider_id"],
            kind=change.kind,
            field=change.field,
            previous_value=change.previous_value,
            current_value=change.current_value,
            summary=change.summary,
            confidence=min(base_confidence, change.confidence),
            source_id=source["id"],
            evidence_id=evidence_id,
            affects=change.affects,
            review_status=change.review_status,
        )

    db.touch_source(
        source["id"],
        content_hash=result.content_hash,
        etag=result.etag,
        last_modified=result.last_modified,
        interval_hours=source["crawl_frequency_hours"],
    )
    return SourceOutcome(source["id"], source["url"], "updated", changes=len(changes))


def run_due(limit: int = 25) -> list[SourceOutcome]:
    outcomes: list[SourceOutcome] = []
    for source in db.due_sources(limit):
        log.info("fetching %s", source["url"])
        outcomes.append(process_source(source))
    return outcomes
