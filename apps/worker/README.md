# Railor ingestion worker

Fetches provider sources, extracts candidate capability claims, normalizes them,
diffs them against what Railor currently publishes, and queues change events.

**It never writes `provider_capabilities`.** Extraction proposes; the admin
review console disposes. That boundary is what makes the published graph
trustworthy.

## Install

```bash
cd apps/worker
python -m venv .venv && . .venv/Scripts/activate     # Windows
# python -m venv .venv && source .venv/bin/activate  # macOS / Linux
pip install -e ".[crawl,dev]"
```

Optional extras: `browser` (Playwright), `queue` (Redis + Celery).

## Database

The worker connects over the network, so it needs a real Postgres — the web
app's embedded PGlite default is in-process only:

```bash
pnpm db:up
export DATABASE_URL=postgresql://railor:railor@localhost:5433/railor
pnpm db:migrate && pnpm db:seed
```

## Commands

```bash
python -m railor_worker.cli status              # registry health, failures, next check
python -m railor_worker.cli crawl --limit 10    # process due sources
python -m railor_worker.cli extract page.html   # dry-run extraction, publishes nothing
```

Multi-page documentation trees use Scrapy:

```bash
scrapy runspider railor_worker/spiders/docs_spider.py \
  -a start=https://demo.railor.dev/sources/northwind/coverage \
  -a provider=northwind-rails
```

## Fetching rules

1. Official API → 2. direct HTTP → 3. Scrapy → 4. Playwright (only when
   `requires_js` is set).

Robots policies are read and obeyed, requests are throttled per host,
conditional GETs (`ETag` / `If-Modified-Since`) avoid re-fetching unchanged
pages, and authentication boundaries and protections are never circumvented. A
source that blocks anonymous access is recorded as blocked so a human can decide
what to do — it is not worked around.

## Review policy

- Diffs compare **normalized values**, not raw HTML, so a marketing rewrite does
  not raise a coverage alert.
- A change to entity eligibility, requirements, fees or limits always waits for
  human review.
- An extraction with confidence below 0.7 can never overturn a published fact;
  it is filed as `documentation_changed` with an explicit "could not determine".
- Evidence is append-only. A new observation adds a record; it never edits one.

## Tests

```bash
pytest
```
