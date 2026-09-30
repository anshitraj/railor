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

## Web discovery (Google Search grounding)

```bash
pip install -e ".[discovery]"          # google-genai
python -m railor_worker.cli discover --entity IN --to AE --currency AED --asset USD --dry-run
python -m railor_worker.cli discover --provider wise            # deepen a listed provider
python -m railor_worker.cli discover-targets --only adyen.com   # research an unlisted company
python -m railor_worker.cli discover-rails --dry-run            # verify missing named rails
python -m railor_worker.cli discover-queue                      # run jobs queued in /admin/discovery
```

How a fact gets in — and why none can be invented:

1. **Search.** Gemini (`RAILOR_DISCOVERY_MODEL`, default `gemini-2.5-flash`) answers with Google
   Search grounding. Only its *citations* are kept; an answer without grounding metadata is
   rejected outright.
2. **Fetch.** Every cited page is resolved (Google's redirect links) and fetched by the worker
   itself — robots.txt obeyed, per-host throttling, every hop checked against private
   addresses (`netguard.py`), bodies size-capped. Social/user-generated pages are not evidence.
3. **Extract.** A second, ungrounded pass structures claims from that page text; each must
   carry one sentence copied verbatim from a source.
4. **Verify.** A claim survives only if its quote is on the fetched page (normalized for case,
   quote style and whitespace; edited quotes never pass) *and* the quote actually states the
   claim (numbers and most content words must appear in it).
5. **Record.** Verified claims about listed providers become evidence + **pending** change
   events in the review queue. Unknown companies become **provider candidates** in
   `/admin/discovery`; an operator approves one (it must have at least one quote from the
   company's own site) and its official pages join the regular crawl. Nothing is published
   by the worker.

`discover-rails` records a rail only when a fetched page (preferably the operator's or central
bank's) contains a whole sentence naming it and saying what it is; that sentence and its URL
are stored on the rail (`named_rails.source_url`, `source_quote`, `verified_at`).

The worker reads the repo-root `.env`. **Its `DATABASE_URL` is whatever that file says** — point
it at the database you mean to write to, and use `--dry-run` to see results without writing.
