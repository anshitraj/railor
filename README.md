# Railor

**Financial infrastructure, mapped.**
Discover, compare and monitor the stablecoin, banking, card and compliance rails powering global money movement — backed by verifiable sources.

Railor answers one question well: *which providers can serve this corridor, why, and what supports that answer?* Every verdict carries a reason, a source, a verification time and a confidence score that decays with age.

> It is better for Railor to say “unknown” than to confidently provide incorrect financial infrastructure information.

---

## Quick start

```bash
pnpm install
pnpm db:migrate   # applies migrations to an embedded Postgres in .railor/pglite
pnpm db:seed      # 15 fictional providers, 558 capability rows, 12 change events
pnpm dev          # http://localhost:3000
```

No Docker, no database server and no accounts are required for that path — the default database is an embedded Postgres (PGlite) stored under `.railor/`.

> **PGlite is single-process.** Don't run `db:migrate` / `db:seed` / `db:reset` while `pnpm dev` is also running against the embedded database — two processes opening the same `.railor/pglite` directory at once will abort the WASM runtime in both. Stop the dev server first, or set `DATABASE_URL` (below) so both talk to a real Postgres that can actually arbitrate concurrent access. The test suite (`pnpm --filter @railor/core test`) is unaffected — it seeds its own throwaway PGlite directory per run and never touches `.railor/pglite`.

Set `DATABASE_URL` to use a real server instead:

```bash
pnpm db:up        # postgres + redis via docker compose (postgres on :5433)
export DATABASE_URL=postgresql://railor:railor@localhost:5433/railor
pnpm db:migrate && pnpm db:seed
```

Sign-in uses magic links. In development (`AUTH_EMAIL_TRANSPORT=console`, the default) the link is printed to the server log **and** shown in the UI, so you can sign in immediately.

---

## The 60-second demo

1. Open the homepage and click *“Indian company sending USDC to a UAE supplier who receives AED”*.
2. Railor renders the interpreted query as editable chips, then the real breakdown: 15 providers checked, 2 compatible, 3 needing additional KYB, 10 unavailable.
3. Two provider results are fully visible before any sign-up; the rest is withheld, not faked.
4. *View full comparison* → sign in → the workspace is named from your email domain, and your question is carried through.
5. Three onboarding questions, all answerable with clicks. Country is pre-selected as **Detected**.
6. *Build my infrastructure map* → the dashboard is already populated: a corridor, its provider verdicts, an armed monitor and a change feed filtered to your markets.
7. Open any result row for the reason, what is nonetheless true, what would change it, the evidence and the change history.
8. *Copy as API call* in the Corridor Explorer → the developer portal already holds a `rail_test_…` key → the same answer over HTTP.

---

## Repository

```
railor/
  apps/
    web/         Next.js 15 app — marketing, workspace, /v1 API, MCP server, admin console
    cli/         Node CLI — one command per /v1 endpoint, `--json` on every read
    worker/      Python ingestion — fetch, extract, normalize, diff, review queue
  packages/
    core/        Interpreter, eligibility engine, ranking, repositories
    database/    Drizzle schema, migrations, demo seed
    types/       Shared domain vocabulary + Zod schemas
    ui/          Design system and the interaction primitives
```

### Stack

Next.js 15 · React 19 · TypeScript · Tailwind v4 · Motion · Drizzle ORM · PostgreSQL (PGlite in dev) · Python 3.11 (httpx, selectolax, Scrapy, Playwright) · Vitest · pytest

---

## What is built

| Surface | State | Notes |
| --- | --- | --- |
| Marketing site + public search | Live | Real results before authentication |
| Auth, organizations, onboarding | Live | Magic link; org data, never user data |
| Dashboard, Corridor Explorer | Live | Ranking presets, in-place explanations |
| Provider directory + profiles | Live | Coverage, requirements, limits, evidence, history |
| Comparison + shareable link | Live | Public read-only URL |
| Monitoring + change feed | Live | Dashboard delivery; email needs SMTP |
| KYB readiness | Live | Normalized requirements, paste-to-structure |
| REST `/v1` | Beta | corridors/search, eligibility, providers, changes (+`since`), watchlists |
| CLI | Beta | `pnpm cli <command>` — mirrors `/v1` 1:1, no invented syntax |
| MCP server | Beta | 9 read-only tools, every response sourced |
| Admin console | Live | Change review queue, source registry |
| Ingestion worker | Live | Proposes changes; never publishes directly |
| Observed benchmarks, connections, routing | Not built | Schema and adapters exist; UI says so |

Nothing in the product fakes a capability. Surfaces that do not exist yet are labelled `Coming soon` in navigation instead of being mocked.

---

## Data model

`providers`, `provider_products`, `provider_capabilities`, `requirements`, `provider_requirements`, `fees`, `limits`, `evidence`, `source_documents`, `source_snapshots`, `change_events`, `observations`, `health_checks`, `organizations`, `organization_members`, `saved_corridors`, `watchlists`, `alerts`, `org_kyb_items`, `api_keys`, `api_usage`, `audit_logs`, `shared_comparisons`, `provider_connections`.

A capability row is dimensioned by provider, product, entity jurisdiction, customer country and type, source asset and network, destination country and currency, and payment method. `NULL` on a dimension means *any*. That is what lets Railor answer:

> Can Provider X serve an Indian-incorporated business sending USDC on Base to an AED bank account for a UAE beneficiary?

---

## Ingestion

```
SOURCE REGISTRY → FETCH → RAW SNAPSHOT → CONTENT EXTRACTION → STRUCTURED EXTRACTION
→ NORMALIZATION → VALIDATION → DIFF → HUMAN REVIEW (when required) → PUBLISH
```

```bash
cd apps/worker
pip install -e ".[crawl,dev]"
python -m railor_worker.cli status
python -m railor_worker.cli crawl --limit 5
```

The worker needs a real Postgres (`DATABASE_URL`), respects robots policies, throttles per host, prefers official APIs over HTML and HTML over browser rendering, and never bypasses a protection. It writes snapshots, evidence and `change_events` — it never writes `provider_capabilities`. Publication happens in the admin review queue.

---

## CLI

```bash
pnpm cli login rail_test_your_key_here     # or: export RAILOR_API_KEY=…
pnpm cli corridors search --entity IN --to AE --asset USDC --currency AED
pnpm cli watch add --type provider --target meridian-pay
pnpm cli changes list --since 7d --json
```

One command per `/v1` endpoint — no syntax that isn't backed by a real route. `railor watch add --type corridor` targets a corridor you've already saved (its id); there's no separate ad-hoc-corridor endpoint, so the CLI doesn't pretend one exists. `railor keys create` doesn't exist either: key creation is security-sensitive and stays in the dashboard, gated to org owners/admins. See [`apps/cli`](apps/cli) or `pnpm cli --help`.

---

## Tests

```bash
pnpm --filter @railor/core test     # interpreter + eligibility engine against the seeded dataset
cd apps/worker && pytest            # normalization + diff rules
```

The engine tests assert the properties that matter: a verdict never ships without a reason, supported providers always carry evidence, an eligible provider always outranks an ineligible one regardless of preset, and a low-confidence extraction never overturns a published fact.

---

## Environment

Copy `.env.example` to `.env`. Every variable has a working local default; the file documents what each one unlocks (`DATABASE_URL`, `AUTH_SECRET`, SMTP, OAuth client IDs, `ANTHROPIC_API_KEY` for the optional model-assisted interpreter, `SNAPSHOT_DIR`).

Without `ANTHROPIC_API_KEY`, query interpretation runs entirely on the deterministic rule engine — fully functional, and the only mode in which output can never be mistaken for a model's guess.

---

## Demo data

The seeded providers are **fictional** and flagged `is_demo`. Evidence URLs point at `demo.railor.dev`. Nothing in this repository describes a real financial company, and no real provider's documentation is reproduced.
