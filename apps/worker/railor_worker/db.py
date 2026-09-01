"""Thin database layer.

The worker writes snapshots, evidence and change events; it never overwrites a
published capability directly. Promotion happens in the review console after a
human approves the change.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row

from .config import get_settings


@contextmanager
def connection() -> Iterator[psycopg.Connection]:
    with psycopg.connect(get_settings().database_url, row_factory=dict_row) as conn:
        yield conn


def due_sources(limit: int = 50) -> list[dict[str, Any]]:
    """Sources whose next_check has passed, oldest first."""
    with connection() as conn:
        return conn.execute(
            """
            select d.*, p.slug as provider_slug, p.name as provider_name
            from source_documents d
            join providers p on p.id = d.provider_id
            where d.enabled
              and (d.next_check_at is null or d.next_check_at <= now())
            order by d.next_check_at nulls first
            limit %s
            """,
            (limit,),
        ).fetchall()


def record_snapshot(
    source_id: str,
    http_status: int | None,
    content_hash: str,
    storage_path: str | None,
    extracted_text: str | None,
) -> str:
    with connection() as conn:
        row = conn.execute(
            """
            insert into source_snapshots
              (source_document_id, http_status, content_hash, storage_path, extracted_text)
            values (%s, %s, %s, %s, %s)
            returning id
            """,
            (source_id, http_status, content_hash, storage_path, extracted_text),
        ).fetchone()
        conn.commit()
        return row["id"]


def touch_source(
    source_id: str,
    *,
    content_hash: str | None,
    etag: str | None,
    last_modified: str | None,
    interval_hours: int,
    error: str | None = None,
) -> None:
    with connection() as conn:
        conn.execute(
            """
            update source_documents
               set last_checked_at = now(),
                   next_check_at = now() + (%s * interval '1 hour'),
                   content_hash = coalesce(%s, content_hash),
                   etag = coalesce(%s, etag),
                   last_modified = coalesce(%s, last_modified),
                   failure_count = case when %s::text is null then 0 else failure_count + 1 end,
                   last_error = %s::text
             where id = %s
            """,
            (interval_hours, content_hash, etag, last_modified, error, error, source_id),
        )
        conn.commit()


def previous_snapshot(source_id: str) -> dict[str, Any] | None:
    with connection() as conn:
        return conn.execute(
            """
            select * from source_snapshots
             where source_document_id = %s
             order by fetched_at desc
             offset 1 limit 1
            """,
            (source_id,),
        ).fetchone()


def insert_evidence(
    provider_id: str,
    source_id: str,
    snapshot_id: str,
    *,
    url: str,
    title: str,
    source_type: str,
    confidence: float,
    excerpt: str,
    raw_hash: str,
) -> str:
    """Evidence is append-only: a new observation never edits an old record."""
    with connection() as conn:
        row = conn.execute(
            """
            insert into evidence
              (provider_id, source_document_id, snapshot_id, source_url, source_title,
               source_type, verification_type, retrieved_at, last_verified_at, confidence, raw_excerpt, raw_hash)
            values (%s, %s, %s, %s, %s, %s, 'provider_reported', now(), now(), %s, %s, %s)
            returning id
            """,
            (
                provider_id,
                source_id,
                snapshot_id,
                url,
                title,
                source_type,
                confidence,
                excerpt[:2000],
                raw_hash,
            ),
        ).fetchone()
        conn.commit()
        return row["id"]


def insert_change_event(
    provider_id: str,
    *,
    kind: str,
    field: str,
    previous_value: str | None,
    current_value: str | None,
    summary: str,
    confidence: float,
    source_id: str | None,
    evidence_id: str | None,
    affects: dict[str, str],
    review_status: str,
) -> None:
    with connection() as conn:
        conn.execute(
            """
            insert into change_events
              (provider_id, kind, field, previous_value, current_value, summary,
               source_document_id, evidence_id, confidence, review_status, affects)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                provider_id,
                kind,
                field,
                previous_value,
                current_value,
                summary,
                source_id,
                evidence_id,
                confidence,
                review_status,
                psycopg.types.json.Json(affects),
            ),
        )
        conn.commit()


def existing_capability_values(provider_id: str) -> dict[str, str]:
    """Currently published capability facts, keyed the same way the diff keys them."""
    with connection() as conn:
        rows = conn.execute(
            """
            select product, entity_country, customer_type, source_asset, source_network,
                   destination_country, destination_currency, payment_method, availability
              from provider_capabilities
             where provider_id = %s
            """,
            (provider_id,),
        ).fetchall()

    values: dict[str, str] = {}
    for row in rows:
        key = ":".join(
            str(row[column] or "any")
            for column in (
                "product",
                "entity_country",
                "customer_type",
                "source_asset",
                "source_network",
                "destination_country",
                "destination_currency",
                "payment_method",
            )
        )
        values[key] = row["availability"]
    return values
