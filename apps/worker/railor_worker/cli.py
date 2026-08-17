"""Worker entry point.

    python -m railor_worker.cli crawl            # process every due source
    python -m railor_worker.cli crawl --limit 5
    python -m railor_worker.cli status           # registry health
    python -m railor_worker.cli extract <file>   # dry-run extraction on saved HTML
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from . import db
from .extract import RuleExtractor, to_text
from .pipeline import run_due


def _crawl(args: argparse.Namespace) -> int:
    outcomes = run_due(limit=args.limit)
    if not outcomes:
        print("no sources are due")
        return 0

    changed = sum(o.changes for o in outcomes)
    for outcome in outcomes:
        detail = f" ({outcome.detail})" if outcome.detail else ""
        print(f"{outcome.status:<9} {outcome.url}{detail} changes={outcome.changes}")
    print(f"\n{len(outcomes)} sources processed, {changed} change events queued")
    return 0


def _status(_: argparse.Namespace) -> int:
    with db.connection() as conn:
        rows = conn.execute(
            """
            select p.name as provider, d.url, d.source_type, d.enabled,
                   d.last_checked_at, d.next_check_at, d.failure_count, d.last_error
              from source_documents d
              join providers p on p.id = d.provider_id
             order by d.next_check_at nulls first
             limit 50
            """
        ).fetchall()

    for row in rows:
        state = "disabled" if not row["enabled"] else f"fails={row['failure_count']}"
        print(f"{row['provider']:<24} {row['source_type']:<22} {state:<12} {row['url']}")
        if row["last_error"]:
            print(f"{'':<24} last error: {row['last_error']}")
    return 0


def _extract(args: argparse.Namespace) -> int:
    html = Path(args.path).read_text(encoding="utf-8")
    claims = RuleExtractor().extract(to_text(html))
    for claim in claims:
        print(f"{claim.kind:<16} {claim.key:<10} {claim.availability:<12} {claim.confidence:.2f}")
        print(f"    {claim.excerpt[:120]}")
    print(f"\n{len(claims)} candidate claims (none published — extraction proposes only)")
    return 0


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="railor-worker")
    sub = parser.add_subparsers(dest="command", required=True)

    crawl = sub.add_parser("crawl", help="process every due source")
    crawl.add_argument("--limit", type=int, default=25)
    crawl.set_defaults(func=_crawl)

    status = sub.add_parser("status", help="show source registry health")
    status.set_defaults(func=_status)

    extract = sub.add_parser("extract", help="dry-run extraction against a saved HTML file")
    extract.add_argument("path")
    extract.set_defaults(func=_extract)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
