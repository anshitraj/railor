"""One bounded, observable ingestion execution for Cloud Run Jobs."""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import signal
from collections import Counter
from threading import Event

from .config import get_settings
from .db import crawl_lock
from .pipeline import run_due
from .storage import store_snapshot, validate_snapshot_storage

log = logging.getLogger("railor.job")


def run_job(limit: int, stop: Event) -> int:
    if limit < 1 or limit > 500:
        raise ValueError("limit must be between 1 and 500")
    settings = get_settings()
    validate_snapshot_storage(settings.snapshot_dir)
    with crawl_lock() as acquired:
        if not acquired:
            print(json.dumps({"severity": "INFO", "event": "crawl_skipped", "reason": "already_running"}), flush=True)
            return 0
        # Fail before changing the source registry if durable storage is unavailable.
        body = "Railor ingestion storage readiness v1"
        store_snapshot("railor-health-check", hashlib.sha256(body.encode()).hexdigest(), body, settings.snapshot_dir)
        outcomes = run_due(limit, should_stop=stop.is_set)
        counts = Counter(outcome.status for outcome in outcomes)
        failed = counts["error"]
        print(json.dumps({
            "severity": "ERROR" if failed or stop.is_set() else "INFO",
            "event": "crawl_completed", "processed": len(outcomes),
            "outcomes": dict(counts), "changes_queued": sum(o.changes for o in outcomes),
            "interrupted": stop.is_set(),
        }), flush=True)
        # A failed or interrupted execution is visible to Cloud Run and monitoring.
        return 1 if failed or stop.is_set() else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    if not 1 <= args.limit <= 500:
        parser.error("limit must be between 1 and 500")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    stop = Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    try:
        return run_job(args.limit, stop)
    except Exception as exc:
        print(json.dumps({"severity": "ERROR", "event": "crawl_failed", "error_type": type(exc).__name__}), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
