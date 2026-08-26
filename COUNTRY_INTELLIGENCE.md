# Country Intelligence

A database of static/semi-static country-level payment-infrastructure facts
— central bank and regulators, local payment rails, IBAN/SWIFT usage, bank
account and routing-code formats, KYC/KYB/AML requirements, crypto and
stablecoin regulatory status, cross-border restrictions, supported payout
currencies — that Railor's own APIs and frontend read cheaply from Postgres,
instead of re-deriving it from scratch on every request.

It is **not** the live routing/eligibility engine (`providerCapabilities`,
`namedRails`, `receivingEndpoints`). Those answer "which provider can move
this money"; this answers "what does this country's infrastructure look
like." Live figures — FX rates, provider fees, stablecoin liquidity, current
quotes, settlement availability — never come from here and never will;
they belong to live provider APIs.

## Architecture

```
Tavily (search)                 -- finds authoritative source URLs
   |
Tavily (extract)                -- fetches real content from those URLs
   |                                (Firecrawl as an optional fallback for
   |                                 URLs Tavily's extract couldn't retrieve)
Gemini (structured extraction)  -- extracts ONLY what the sources say
   |
Zod validation                  -- schema + citation-hallucination check
   |
Postgres (upsert)                -- country_profiles / country_sources /
   |                                 country_fact_sources / country_research_runs
GET /api/countries/:code        -- reads Postgres only, never the above
```

**Why Tavily/Gemini are never on the user request path**: those calls
cost real money and take real time (multiple searches, one long
extraction). Running them per-request would make every country lookup slow,
expensive, and dependent on third-party APIs' uptime. Instead, research
is a deliberate, bounded, offline step — `pnpm research-country <ISO2>` or an
authenticated admin refresh — that writes a normalized result to Postgres.
Every other read (the public API, the app, MCP, anything built on this
later) is a plain database query.

## Where the code lives

| Concern | Location |
|---|---|
| Schema (4 new tables, 5 new enums) | `packages/database/src/schema.ts` |
| Zod extraction schema + enums | `packages/types/src/country.ts` |
| Tavily client | `packages/core/src/country-research/tavily.ts` |
| Research-query generation | `packages/core/src/country-research/queries.ts` |
| URL dedup | `packages/core/src/country-research/dedupe.ts` |
| Source-quality classification | `packages/core/src/country-research/source-quality.ts` |
| Gemini structured extraction | `packages/core/src/country-research/extract.ts` |
| Firecrawl fallback content fetcher | `packages/core/src/country-research/firecrawl.ts` |
| Ingestion orchestrator | `packages/core/src/country-research/ingest.ts` |
| CLI entry point | `packages/core/src/country-research/cli.ts` |
| Cost-safety config | `packages/core/src/country-research/config.ts` |
| DB-only read models | `packages/core/src/repository.ts` (`loadCountry*` functions) |
| Public read API | `apps/web/app/api/countries/[code]/route.ts` |
| Admin-triggered refresh (HTTP) | `apps/web/app/api/admin/countries/[code]/refresh/route.ts` |
| Admin-triggered refresh (UI action) | `apps/web/app/admin/actions.ts` (`refreshCountryResearch`) |
| Admin panel | `apps/web/components/admin/country-research-panel.tsx` |

`researchCountry()` in `ingest.ts` is the single entry point all three
triggers (CLI, admin route, admin server action) call — one place owns the
freshness guard, the cost limits, and the run-tracking, so none of the three
callers can accidentally bypass them.

## Database

- **`country_profiles`** — one row per researched country, keyed on `iso2`
  (FK to the existing `countries.code`). Flat, typed columns — no giant text
  blob. Has no `status` column; current status is always the latest
  `country_research_runs` row for that country.
- **`country_sources`** — one row per distinct URL used per country, with
  `category` (research topic), `source_type` (document genre),
  `authority_level` (trust ranking), and a content hash. The unique
  `(country_iso2, url)` index is what makes URL dedup and idempotent
  upserts work.
- **`country_fact_sources`** — links one specific fact (e.g.
  `kyc_requirements`, `instant_payment_system`) to the source(s) that
  established it. This is what makes provenance real at the *field* level,
  not just "here are some sources for this country somewhere" — and what
  lets two facts on the same country cite different, even conflicting,
  sources. Rewritten wholesale (delete + reinsert) on every research run.
- **`country_research_runs`** — one row per pipeline execution, updated at
  each phase transition (`pending → searching → extracting → validating →
  completed/failed/partial`), with query/source counts, model used, a JSON
  usage-metadata bag, and — on failure — which phase failed and why.

All four tables are purely additive (see
`packages/database/drizzle/0003_fancy_donald_blake.sql`); nothing existing
was altered.

## Provenance model

Every extracted fact is requested from the model as
`{ value, sourceUrls[] }`. At ingestion:

1. Any `sourceUrls` entry that wasn't actually among the source content fed
   to the model that run is **dropped** — a citation-level hallucination
   check, separate from the fact-level one below.
2. The remaining links become `country_fact_sources` rows, joined to
   `country_sources` for the URL, title, and authority level.
3. `value` becomes the flat column on `country_profiles`.

A field with no supporting evidence in the sources comes back `null` (or
`[]` for a list) — the extraction prompt explicitly forbids guessing, and
the schema makes "unknown" a first-class, always-present value rather than
an omitted key.

## Source quality

`classifySourceAuthority()` (`source-quality.ts`) maps a source's domain to
one of `official_regulator > government > official_network >
official_provider > international_organization > reputable_secondary >
unknown`, via curated domain allowlists per country (central banks, `.gov`
domains, known international bodies, known payment networks) — never a
heuristic guess upward. Discovered sources are ranked by this before the
`maxSourceDocs` cap is applied, so a random blog never displaces an official
regulator's page, and conflicting facts from different sources are kept
distinguishable rather than silently resolved to whichever "sounds more
plausible."

## Cost safety

All limits are env-configurable (`.env.example`), with sane defaults:

| Var | Default | Guards |
|---|---|---|
| `COUNTRY_RESEARCH_MAX_QUERIES` | 9 | queries generated per country |
| `COUNTRY_RESEARCH_MAX_RESULTS_PER_QUERY` | 5 | Tavily results per query |
| `COUNTRY_RESEARCH_MAX_SOURCE_DOCS` | 20 | sources actually extracted + sent to the LLM |
| `COUNTRY_RESEARCH_MAX_CHARS_TO_LLM` | 60000 | total source-content characters in the extraction prompt |
| `COUNTRY_RESEARCH_MIN_RECHECK_HOURS` | 20 | how soon a country can be re-researched without `forceRefresh` |

Plus: bounded retries with exponential backoff on Tavily calls (never
infinite), request timeouts on Tavily, Gemini, and Firecrawl calls, bounded
concurrency on searches, and a v1 scope lock — `researchCountry()` refuses
any country code outside `US, IN, GB, SG, AE` outright.

**Before any paid call is made**, `researchCountry()` checks
`country_research_runs` for that country: a run already in progress
refuses a concurrent one; a `completed`/`partial` run younger than
`COUNTRY_RESEARCH_MIN_RECHECK_HOURS` refuses unless `forceRefresh: true` is
passed explicitly. This is the only way to force a re-run inside the
recheck window — there's no separate scheduler.

## Configuration

```
TAVILY_API_KEY=
FIRECRAWL_API_KEY=
COUNTRY_RESEARCH_LLM_MODEL=gemini-3.1-pro-preview
```

Extraction reuses the `GEMINI_API_KEY` Railor's query-interpreter (`llm.ts`)
already uses — no separate LLM key — but deliberately **not** `llm.ts`'s
`RAILOR_LLM_MODEL`: that path is small, frequent (every public search
request) and latency-sensitive, favoring Flash; extraction is rare (five
countries, at most every `COUNTRY_RESEARCH_MIN_RECHECK_HOURS`), reads a much
larger prompt, and quality matters more than speed, favoring Pro. Sharing
one model knob would force the wrong tradeoff on one of the two.

`TAVILY_API_KEY` and `GEMINI_API_KEY` are hard requirements: empty means
`pnpm research-country` and the admin refresh route both fail fast with a
clear, correctly-phased error instead of silently doing nothing or crashing
obscurely. `FIRECRAWL_API_KEY` is optional — unset just means that one
fallback step is skipped; the pipeline still runs on Tavily alone. All keys
are backend-only — read from `process.env` in `packages/core` and Next.js
server routes only, never `NEXT_PUBLIC_`, never sent to the browser.

## Researching a country

```bash
pnpm research-country IN
pnpm research-country US
pnpm research-country GB
pnpm research-country SG
pnpm research-country AE
```

(`npm run research-country -- IN` works identically — same underlying
script — but `pnpm` is what the rest of this repo's scripts use.)

Only these five country codes are accepted in v1. Output reports each
pipeline phase as it's confirmed to have succeeded, and on failure names
the exact phase and reason:

```
Researching IN
✓ Country identified
✓ Searching for authoritative sources
✓ Retrieving content and extracting structured data
✓ Validating extracted data

Updated: 9 queries, 14 sources discovered, 11 sources used.

IN intelligence updated successfully.
```

Add `--force` to bypass the recheck-window guard and re-research a country
regardless of when it was last researched.

## Force-refreshing from the admin console

`/admin` (existing operations console, gated on `users.is_admin`) has a
"Country intelligence" panel with a Refresh button per country. The same
action is available over HTTP for scripting/automation:

```
POST /api/admin/countries/IN/refresh
Cookie: railor_session=...   (an admin session)
Content-Type: application/json

{ "forceRefresh": false }
```

Requires an authenticated session with `is_admin = true` — a signed-out or
non-admin caller gets 401/403 and the pipeline never runs. Also rate-limited
(reuses the existing in-process burst limiter) and every refresh — success
or failure — is written to `audit_logs`.

## Reading stored intelligence

```
GET /api/countries/IN
```

Reads `country_profiles`/`country_sources`/`country_fact_sources` only —
never Tavily, Gemini, or Firecrawl. Three distinct outcomes:

- **200** — the full profile, its sources, and its fact-level provenance.
- **404 `unknown_country`** — the code isn't in Railor's `countries` table at all.
- **404 `not_yet_researched`** — the country is known but has no research yet. Never a fabricated all-null profile.

## Firecrawl

Implemented as an **optional fallback**, not a primary content source:
`ingest.ts` calls `tavilyExtract()` first for every chosen source URL; only
the URLs Tavily's own extract couldn't retrieve are retried through
`firecrawlExtract()` (`firecrawl.ts`), and only if `FIRECRAWL_API_KEY` is
set. A URL that fails both falls back to its Tavily search snippet, same as
before Firecrawl existed — nothing in the pipeline hard-depends on it. This
is the seam `tavilySearch()`/`tavilyExtract()` being two independent,
plainly-typed functions was designed to make possible: Firecrawl is one more
implementation of the same "fetch content for these URLs" shape, slotted
into one pipeline stage.

## Tests

`packages/core/src/__tests__/country-*.test.ts` (mocked Tavily/Gemini, a
throwaway PGlite database for the DB-touching ones) plus
`apps/web/app/api/admin/countries/[code]/refresh/route.test.ts` (mocked
session/pipeline, proves the refresh route's auth gate). Run with `pnpm
test` from the repo root. No real API credits are spent by the test suite.
