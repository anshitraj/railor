"""Worker entry point.

    python -m railor_worker.cli seed-sources      # register real providers + their sources (once)
    python -m railor_worker.cli crawl             # process every due source
    python -m railor_worker.cli crawl --limit 5
    python -m railor_worker.cli status            # registry health
    python -m railor_worker.cli extract <file>    # dry-run extraction on saved HTML
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

from . import db
from .conformance import run_all as run_conformance
from .extract import RuleExtractor, to_text
from .pipeline import run_due
from .seed_sources import bootstrap


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


def _seed_sources(_: argparse.Namespace) -> int:
    for line in bootstrap():
        print(line)
    return 0


def _conformance(_: argparse.Namespace) -> int:
    lines = run_conformance()
    if not lines:
        print("no real providers registered yet — run seed-sources first")
        return 0
    for line in lines:
        print(line)
    return 0


def _extract(args: argparse.Namespace) -> int:
    html = Path(args.path).read_text(encoding="utf-8")
    claims = RuleExtractor().extract(to_text(html))
    for claim in claims:
        print(f"{claim.kind:<16} {claim.key:<10} {claim.availability:<12} {claim.confidence:.2f}")
        print(f"    {claim.excerpt[:120]}")
    print(f"\n{len(claims)} candidate claims (none published — extraction proposes only)")
    return 0


def _print_report(report, sink=None) -> None:
    summary = report.summary()
    print(f"search queries: {', '.join(summary['search_queries']) or '—'}")
    print(f"pages fetched {summary['pages_fetched']}, skipped {summary['pages_skipped']}")
    for p in report.pages:
        print(f"  read    [{p.source_id}] {p.url[:100]} ({len(p.text)} chars)")
    for s in summary["skipped"]:
        print(f"  skipped {s['url'][:90]} — {s['reason']}")
    print(f"claims extracted {summary['claims_extracted']}, verified {summary['claims_verified']}, rejected {summary['claims_rejected']}")
    for v in report.verified:
        where = "official" if v.official else "third-party"
        print(f"  ✓ [{v.claim.kind}] {v.claim.provider_name}: {v.claim.statement}")
        print(f"      “{v.claim.quote[:160]}” — {v.page.url[:90]} ({where})")
    for claim, reason in report.rejected[:15]:
        print(f"  ✗ {claim.provider_name}: {reason}")
    if sink is not None and hasattr(sink, "records"):
        outcomes = [o for o, _, _ in sink.records]
        print(f"would record: {outcomes.count('change_event')} change events, {outcomes.count('candidate')} candidate claims, {outcomes.count('unattributed')} unattributed (dropped)")
    else:
        print(f"recorded: {report.change_events} change events for review, {report.candidates} provider-candidate claims")
    if report.error:
        print(f"error: {report.error}")


def _discover(args: argparse.Namespace) -> int:
    from .discovery import CorridorQuery, run_corridor, run_provider
    from .discovery.run import DryRun

    if args.dry_run:
        sink = DryRun()
    else:
        from .discovery.store import DbSink

        sink = DbSink()
    if args.provider:
        if args.dry_run:
            provider = {"id": None, "slug": args.provider, "name": args.name or args.provider, "website_url": args.website}
        else:
            from .discovery.store import provider_by_slug

            provider = provider_by_slug(args.provider)
            if not provider:
                print(f"no real provider with slug {args.provider}")
                return 1
        report = run_provider(provider, sink, max_pages=args.max_pages)
    else:
        if not (args.entity and args.to and args.currency):
            print("corridor discovery needs --entity, --to and --currency (or use --provider)")
            return 2
        query = CorridorQuery(args.entity.upper(), args.to.upper(), args.currency.upper(), args.asset.upper() if args.asset else None)
        report = run_corridor(query, sink, max_pages=args.max_pages)
    _print_report(report, sink if args.dry_run else None)
    return 1 if report.error else 0


def _discover_rails(args: argparse.Namespace) -> int:
    from .discovery.gemini import Gemini
    from .discovery.rails import RAIL_TARGETS, save_rail, verify_rail
    from .discovery.run import DEFAULT_UA

    gemini = Gemini()
    targets = [t for t in RAIL_TARGETS if not args.only or t.code in {c.upper() for c in args.only}]
    verified = 0
    for target in targets:
        result = verify_rail(target, gemini, user_agent=os.getenv("RAILOR_USER_AGENT", DEFAULT_UA))
        if not result.quote:
            print(f"✗ {target.code:<12} {target.name} ({target.country}) — {result.reason}")
            continue
        verified += 1
        where = "operator page" if result.official else "third-party page"
        outcome = "dry run" if args.dry_run else save_rail(result)
        print(f"✓ {target.code:<12} {target.name} ({target.country}) [{outcome}] — {where}: {result.page.url[:80]}")
        print(f"      “{result.quote[:200]}”")
    print(f"\n{verified}/{len(targets)} rails verified from a fetched page")
    return 0


def _discover_targets(args: argparse.Namespace) -> int:
    from .discovery import run_company
    from .discovery.run import DryRun
    from .discovery.targets import COMPANY_TARGETS

    targets = [t for t in COMPANY_TARGETS if not args.only or t[1] in args.only or t[0].lower() in {o.lower() for o in args.only}]
    for name, domain in targets:
        if args.dry_run:
            sink = DryRun()
        else:
            from .discovery.store import DbSink

            sink = DbSink()
        report = run_company(name, domain, sink, max_pages=args.max_pages)
        print(f"\n== {name} ({domain})")
        _print_report(report, sink if args.dry_run else None)
    return 0


def _discover_queue(args: argparse.Namespace) -> int:
    """Runs jobs queued from /admin/discovery. Schedule it (cron / Railway) like `crawl`."""
    from .discovery import CorridorQuery, run_company, run_corridor, run_provider
    from .discovery.store import DbSink, claim_next_job, fail_job, finish_job, provider_by_slug

    ran = 0
    while ran < args.limit:
        job = claim_next_job()
        if not job:
            break
        ran += 1
        q = job["query"] or {}
        try:
            sink = DbSink(job_id=job["id"])
            if job["kind"] == "company":
                report = run_company(str(q.get("name", "")), str(q.get("domain", "")), sink)
            elif job["kind"] == "provider":
                provider = provider_by_slug(str(q.get("provider", "")))
                if not provider:
                    fail_job(job["id"], f"no real provider with slug {q.get('provider')}")
                    continue
                report = run_provider(provider, sink)
            else:
                report = run_corridor(
                    CorridorQuery(str(q["entity_country"]), str(q["destination_country"]), str(q["destination_currency"]), q.get("source_asset") or None, q.get("customer_type") or "business"),
                    sink,
                )
            finish_job(job["id"], report)
            print(f"job {job['id']}: {report.change_events} change events, {report.candidates} candidate claims{f' — {report.error}' if report.error else ''}")
        except Exception as exc:  # a job failure is recorded, never swallowed silently
            fail_job(job["id"], f"{type(exc).__name__}: {exc}")
            print(f"job {job['id']} failed: {exc}")
    if not ran:
        print("no queued discovery jobs")
    return 0


def main() -> int:
    # Windows consoles default to cp1252; quotes and ✓/✗ marks must never crash a run.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="railor-worker")
    sub = parser.add_subparsers(dest="command", required=True)

    crawl = sub.add_parser("crawl", help="process every due source")
    crawl.add_argument("--limit", type=int, default=25)
    crawl.set_defaults(func=_crawl)

    status = sub.add_parser("status", help="show source registry health")
    status.set_defaults(func=_status)

    seed_sources = sub.add_parser(
        "seed-sources", help="register the real (non-demo) providers this worker crawls"
    )
    seed_sources.set_defaults(func=_seed_sources)

    conformance = sub.add_parser(
        "conformance", help="run the conformance test catalog against real providers"
    )
    conformance.set_defaults(func=_conformance)

    extract = sub.add_parser("extract", help="dry-run extraction against a saved HTML file")
    extract.add_argument("path")
    extract.set_defaults(func=_extract)

    discover = sub.add_parser("discover", help="web discovery with Google Search grounding (review queue only)")
    discover.add_argument("--entity", help="sending business country, ISO-2 (corridor mode)")
    discover.add_argument("--to", help="destination country, ISO-2")
    discover.add_argument("--currency", help="destination currency, ISO-4217")
    discover.add_argument("--asset", help="source asset or currency, e.g. USD or USDC")
    discover.add_argument("--provider", help="deepen one known provider by slug instead")
    discover.add_argument("--name", help="provider display name (dry-run --provider only)")
    discover.add_argument("--website", help="provider website (dry-run --provider only)")
    discover.add_argument("--max-pages", type=int, default=8)
    discover.add_argument("--dry-run", action="store_true", help="print what would be recorded; no database")
    discover.set_defaults(func=_discover)

    discover_rails = sub.add_parser("discover-rails", help="verify missing named payment rails from their operators' pages")
    discover_rails.add_argument("--only", nargs="*", help="rail codes, e.g. BLIK NPP_AU")
    discover_rails.add_argument("--dry-run", action="store_true")
    discover_rails.set_defaults(func=_discover_rails)

    discover_targets = sub.add_parser("discover-targets", help="research companies Railor doesn't list yet (→ provider candidates)")
    discover_targets.add_argument("--only", nargs="*", help="names or domains from discovery/targets.py")
    discover_targets.add_argument("--max-pages", type=int, default=6)
    discover_targets.add_argument("--dry-run", action="store_true")
    discover_targets.set_defaults(func=_discover_targets)

    discover_queue = sub.add_parser("discover-queue", help="run discovery jobs queued from the admin console")
    discover_queue.add_argument("--limit", type=int, default=3)
    discover_queue.set_defaults(func=_discover_queue)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
