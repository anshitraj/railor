"""Worker configuration.

The worker talks to a real PostgreSQL server. The web app's zero-setup default
(embedded PGlite) is in-process and cannot accept external connections, so
running the worker means pointing DATABASE_URL at Postgres — `pnpm db:up`
starts one on 5433.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[3] / ".env")


@dataclass(frozen=True)
class Settings:
    database_url: str
    snapshot_dir: Path
    user_agent: str
    request_timeout: float
    max_concurrency: int
    # Changes to these fields always require a human before they are published.
    review_required_fields: tuple[str, ...]

    @classmethod
    def load(cls) -> "Settings":
        url = os.getenv("DATABASE_URL")
        if not url:
            raise SystemExit(
                "DATABASE_URL is not set.\n"
                "The worker needs a real Postgres server:\n"
                "  pnpm db:up   # starts postgres on 5433 via docker compose\n"
                "  export DATABASE_URL=postgresql://railor:railor@localhost:5433/railor"
            )
        return cls(
            database_url=url,
            snapshot_dir=Path(os.getenv("SNAPSHOT_DIR", "./storage/snapshots")),
            user_agent=os.getenv(
                "RAILOR_USER_AGENT",
                "RailorBot/0.1 (+https://railor.dev/bot; infrastructure capability mapping)",
            ),
            request_timeout=float(os.getenv("RAILOR_TIMEOUT", "20")),
            max_concurrency=int(os.getenv("RAILOR_CONCURRENCY", "4")),
            review_required_fields=(
                "entity_country",
                "requirement",
                "fee",
                "limit",
                "product",
            ),
        )


_cached: Settings | None = None


def get_settings() -> Settings:
    """Loaded on first use so importing the package never fails on a missing env."""
    global _cached
    if _cached is None:
        _cached = Settings.load()
    return _cached
