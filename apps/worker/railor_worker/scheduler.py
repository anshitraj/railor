"""Run non-overlapping crawls on a persistent background worker, with graceful shutdown."""
from __future__ import annotations

import argparse
import logging
import signal
import subprocess
import sys
from threading import Event
from typing import Callable

from .config import get_settings
from .storage import validate_snapshot_storage

log = logging.getLogger("railor.scheduler")


def run_crawl(stop: Event, limit: int) -> int:
    # The existing CLI owns each crawl. No shell expansion and no credentials in arguments.
    child = subprocess.Popen([
        sys.executable, "-m", "railor_worker.cli", "crawl", "--limit", str(limit),
    ])
    try:
        while child.poll() is None:
            if stop.wait(1):
                child.terminate()
                try:
                    return child.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    child.kill()
                    return child.wait()
        return child.returncode
    finally:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=20)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


def run_scheduler(
    stop: Event, interval: int, limit: int,
    crawl: Callable[[Event, int], int] = run_crawl,
) -> None:
    if interval < 60 or limit < 1:
        raise ValueError("Interval must be at least 60 seconds and limit must be positive")
    while not stop.is_set():
        log.info("Starting crawl (limit=%s)", limit)
        try:
            code = crawl(stop, limit)
        except OSError:
            log.error("Could not start crawl process")
            code = 1
        if stop.is_set():
            break
        delay = interval if code == 0 else min(interval, 300)
        log.info("Crawl exited with code %s; next attempt in %s seconds", code, delay)
        if stop.wait(delay):
            break


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interval-seconds", type=int, default=21600)
    parser.add_argument("--limit", type=int, default=25)
    args = parser.parse_args()
    if args.interval_seconds < 60 or args.limit < 1:
        parser.error("interval must be at least 60 seconds and limit must be positive")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    settings = get_settings()
    validate_snapshot_storage(settings.snapshot_dir)
    stop = Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    log.info("Scheduler ready; one crawl at a time, interval=%ss", args.interval_seconds)
    run_scheduler(stop, args.interval_seconds, args.limit)
    log.info("Scheduler stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
