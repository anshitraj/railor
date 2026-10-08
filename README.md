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

> **Hosted databases are never migrated implicitly.** With the embedded database (or a local Postgres in development) `pnpm dev` applies pending migrations on start. Against any other `DATABASE_URL` — Neon, production — the app checks instead and refuses to serve until you migrate deliberately: back up, `pnpm db:migrate -- --dry-run` to see what is pending, then `pnpm db:migrate -- --confirm-remote`. `RAILOR_AUTO_MIGRATE=true|false` overrides the rule.

Set `DATABASE_URL` to use a real server instead:

```bash
pnpm db:up        # postgres + redis via docker compose (postgres on :5433)
export DATABASE_URL=postgresql://railor:railor@localhost:5433/railor
pnpm db:migrate && pnpm db:seed
```

Sign-in uses magic links. In development (`AUTH_EMAIL_TRANSPORT=console`, the default) the link is printed to the server log **and** shown in the UI, so you can sign in immediately.

For production email delivery through Resend SMTP, see [EMAIL_SIGNIN_SETUP.md](EMAIL_SIGNIN_SETUP.md).

---

## The 60-second demo

1. Open the homepage and click *“Indian company sending USDC to a UAE supplier who receives AED”*.
2. Railor renders the interpreted query as editable chips, then the real breakdown: 15 providers checked, 2 compatible, 3 needing additional KYB, 10 unavailable.
3. Two provider results are fully visible before any sign-up; the rest is withheld, not faked.
4. *View full comparison* → sign in → the workspace is named from your email domain, and your question is carried through.
5. Five guided onboarding questions with business, freelancer and personal choices, country/currency cards, saved progress and an answer review. Inferred countries are labelled **Detected** and remain editable.
6. *Open my workspace* → suggested corridors and a monitor reflect the selected customer type and markets. Price comparisons start with the saved account profile; coverage verdicts remain evidence-based.
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
| Marketing site + public search | Live | Real results before authentication; every verdict, count and evidence card on the page is computed live |
| Auth, organizations, onboarding | Live | Magic link; org data, never user data |
| Team invites + roles | Live | Email-bound invite links, role changes, leave/remove, workspace switcher |
| Dashboard, Corridor Explorer | Live | Ranking presets, in-place explanations, suggested corridor saved + monitored in one click |
| Provider directory + profiles | Live | Coverage, requirements, limits, evidence, history |
| Comparison + shareable link | Live | Public read-only URL |
| Monitoring + change feed | Live | Per-monitor digest (instant/daily/weekly), email toggle, change-type filters; email needs SMTP |
| Evidence explorer | Live | Every source record with confidence decayed to today, band + source-type filters |
| Decisions, policies, approvals, Agent | Beta | Click-first intent builder and policy editor; simulation before activation; independent approval |
| KYB readiness | Live | Normalized requirements, paste-to-structure |
| REST `/v1` | Beta | corridors/search, eligibility, providers (+`/{id}`), compare, capabilities (cursor-paginated), changes (+`since`), watchlists, decisions, policies, payments (+ submit/cancel, `Idempotency-Key`), beneficiaries, routes, webhook_endpoints |
| SDKs | Beta | `packages/sdk` (TypeScript, zero deps, retries + auto-pagination) and `packages/sdk-python` — same method tree |
| CLI | Beta | `pnpm cli <command>` — mirrors `/v1` 1:1, incl. `providers get`, `compare`, `capabilities list` |
| MCP server | Beta | 9 read-only tools, every response sourced |
| Operations console (`/admin`) | Live | Overview, payments ops (platform kill switch, manual resolution of unknown outcomes, reconcile), organizations (live approval with mandatory limits), providers (live approval against counted sandbox evidence), review queue, country research, usage + demand, audit log, founding access — every action audited |
| Status, Terms, Privacy | Live | `/status` is measured per request; legal pages describe what the code actually stores |
| Ingestion worker | Live | Proposes changes; never publishes directly |
| Web discovery | Beta | Worker + `/admin/discovery`: Gemini with Google Search grounding finds pages, the worker fetches them itself, and a claim survives only if its quote is verbatim on the page and states the claim. Verified facts go to the review queue; new companies become provider candidates; named rails are verified against operator pages. Nothing is published without review |
| Provider connections | Beta | Wise, Airwallex, Bridge, Circle (payouts) plus quote/test adapters for Nium, MoonPay, Paxos, Coinbase; sandbox and production slots, credentials encrypted at rest, live connection test, per-connection webhook URL |
| Price check | Beta | Swap-style live quote card at `/app/prices` (with your connected accounts' exact quotes and a send hand-off) and public `/prices` (no account), re-quoted every 20s with a mid-market FX ticker; also `POST /v1/prices`. Every number labelled — your connected account's live quote (exact), Wise's live public quote, published schedules (PayZoll, Skydo), and optional dated market estimates from Wise's comparison feed. Public quotes are shared for 15–60s server-side and rate-limited per visitor |
| Provider logos | Live | Each provider's own declared icon, fetched from its website once (SSRF-guarded), cached and served from Railor's origin; monogram fallback |
| Payments + beneficiaries | Beta | Policy-checked, routed, idempotent payouts through the workspace's own provider accounts. Test mode runs end to end against provider sandboxes or Railor's deterministic simulator; live mode sits behind five gates. Bridge and Circle payout adapters are built from their public docs and need sandbox validation before live approval |
| Routing / orchestration | Beta | Eligibility + policy as hard gates, weighted scoring (health, reliability, cost, speed, limits, preference) with presets and an honest confidence figure, fallback only on a definitive rejection, route preview |
| Outbound webhooks | Beta | `payment.*` events signed with `Railor-Signature`, retried with backoff for 24h |
| Observed benchmarks | Not built | Schema exists; UI says so, with a working “Notify me” |

Nothing in the product fakes a capability. Surfaces that do not exist yet are labelled `Coming soon` in navigation instead of being mocked.

---

## Data model

`providers`, `provider_products`, `provider_capabilities`, `requirements`, `provider_requirements`, `fees`, `limits`, `evidence`, `source_documents`, `source_snapshots`, `change_events`, `observations`, `health_checks`, `organizations`, `organization_members`, `saved_corridors`, `watchlists`, `alerts`, `org_kyb_items`, `api_keys`, `api_usage`, `audit_logs`, `shared_comparisons`, `provider_connections`.

Money movement (migration `0018`): `beneficiaries` (+ `beneficiary_provider_refs`), `payments`, `payment_attempts` (one row per provider call, written with its idempotency key *before* the call), `payment_events` (append-only timeline), `org_payment_settings`, `platform_settings`, `webhook_endpoints`, `webhook_deliveries`, `provider_webhook_events`.

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

## Money movement

Funds only ever move inside the provider accounts a workspace connects; Railor never holds them.

1. **Beneficiary** — validated (IBAN mod-97, ABA checksum, address formats), encrypted, deduplicated.
2. **Create** — the payment is evaluated against the active policy and a route plan is recorded. Nothing is sent. `requires_approval` waits for an independent approver.
3. **Submit** — providers are tried in route order. Each attempt row is stored with its idempotency key before the provider call. A definitive, retryable rejection falls back to the next provider; an ambiguous outcome (timeout, 5xx) becomes `unknown` and is never sent elsewhere.
4. **Settle** — provider webhooks (signature-verified) and `POST /api/internal/payments-reconcile` move payments to `completed` / `failed` / `returned`; `unknown` is resolved by asking the provider, replaying the same idempotency key.

Payout adapters: **Wise** (quote → recipient → transfer with `customerTransactionId` → fund from balance; sandbox `api.wise-sandbox.com`), **Airwallex** (token login, inline-beneficiary transfer with `request_id`, lookup by `request_id`), **Bridge**, **Circle**. All are `docs_verified` — request shapes from each provider's API reference (every host/path probed to answer a clean `401` without credentials, except Airwallex, whose edge blocks anonymous probes), not yet exercised with a real account.

| Rail | Beneficiary methods Railor will route to it |
| --- | --- |
| Wise | US bank (ABA), IBAN, UK sort code, CLABE, Indian bank (IFSC) |
| Airwallex | US bank (ABA), IBAN, UK sort code, Indian bank (IFSC) |
| Bridge | US bank (ACH), IBAN (SEPA), UK (Faster Payments), CLABE (SPEI), Pix, wallet address |
| Circle | US bank (wire, USD), wallet address |

A rail is never offered for a beneficiary whose method it cannot pay, and Circle refuses to deliver a currency other than the one it is funded in. Wallet-address beneficiaries can be saved, but paying one through the policy engine is **coming soon** (a payment intent names a fiat destination currency). Reconciliation also re-checks payments completed in the last three days, because a bank can still return a settled payment, and closes out a payment stranded in `submitting` by an interrupted request.

Test mode uses a provider's sandbox when connected, else Railor's simulator, whose outcome is chosen by the amount's cents (`.13` insufficient funds → fallback, `.66` compliance rejection, `.55` awaiting funds, `.77` returned, `.99` unknown then resolved). Live mode needs `RAILOR_LIVE_PAYMENTS=enabled`, a workspace approved with limits, a provider approved for live, a production connection and an owner/admin — and the platform kill switch off. See `/docs/payments`.

---

## Tests

```bash
pnpm test                           # every package: engine, payments (routing, lifecycle, fallback, live gates, webhooks), web, SDK
python apps/web/e2e/product_workflows.py   # browser flows on a disposable database, incl. an approved test payment settling
python apps/web/e2e/ui_audit.py     # whole-app audit: clicks every control as visitor/owner/reviewer/operator on a disposable database
cd apps/worker && pytest            # normalization + diff rules
```

The engine tests assert the properties that matter: a verdict never ships without a reason, supported providers always carry evidence, an eligible provider always outranks an ineligible one regardless of preset, and a low-confidence extraction never overturns a published fact.

---

## Railor Agent beta

`/app/agent` is a conversational entry point to the existing, read-only `searchPreview` service used by `/v1/search`. It uses deterministic extraction, not a general-purpose LLM or an autonomous payment agent. For example:

> Send $100k USDC on Base from our Singapore company to a Mexican supplier receiving MXN through SPEI. Reliability matters more than price.

The Agent shows the interpreted request, compares it against the selected active company policy, and explains provider results using the returned reason codes. Missing amount, funding, network or country fields remain reviewable; inferred receiving values require confirmation. Short follow-ups can supply missing fields or change the ranking preference. Without observed provider health, reliability ranking produces no supported winner rather than treating route evidence as uptime.

Search and explanation do not persist financial decisions or create payments. **Record decision** is an explicit, role-checked action that re-evaluates current policy/evidence through the existing Decision Engine. Provider-connection and execution-beta modals store scoped work-email access requests through `/api/notify`; they do not connect accounts or execute transfers.

Browser acceptance: `python apps/web/e2e/agent_acceptance.py`. It builds a private production server behind local HTTPS, uses a disposable PGlite database with clearly synthetic route fixtures and a local SMTP inbox, tests a brand-new signup through policy activation and decision recording, and asserts zero payments. `--no-build` reuses the isolated `.next-polish` build. Screenshots and the browser report are written under `.railor/agent-acceptance`. No live provider credentials or external messages are used.

Before deploying this beta, apply `0022_feature_access_requests` to the confirmed production database after a backup, set a canonical HTTPS `APP_ORIGIN`, and configure real SMTP/OAuth for sign-in. Console email transport is deliberately unavailable in production. Provider partner/OAuth access and customer-specific live quote verification remain separate integration work; execution stays private beta.

---

## Environment

### Railor-managed price intelligence

`/prices` and `/app/prices` compare provider-owned published features without asking visitors for API keys. Claims have source links and a review date; missing evidence is marked **Not confirmed**, not unsupported. The PayZoll fee estimate uses its published USD slabs ($10 below $1,000; 1% from $1,000) and is partial because its page excludes possible partner/banking charges.

Airwallex credentials remain server-only. Set `AIRWALLEX_SANDBOX_CLIENT_ID` / `AIRWALLEX_SANDBOX_API_KEY` (the existing lowercase `airwallex_sandbox_client_id` / `airwallex_sandbox_scoped_api` aliases also work). The default environment is sandbox. Price checks show a separate **Sandbox · test data** FX observation; it is never ranked, selectable or executable. Production deployments hide sandbox observations unless explicitly enabled for a private demo with `RAILOR_SHOW_SANDBOX_QUOTES=true`. Identical requests share a short-lived cache, and an atomic database budget caps uncached calls at 60 per minute per provider/environment across instances, including server-rendered pages.

For production reference FX quotes, explicitly set `AIRWALLEX_PLATFORM_ENVIRONMENT=production` and separate `AIRWALLEX_PLATFORM_CLIENT_ID` / `AIRWALLEX_PLATFORM_API_KEY` credentials after confirming provider approval for your platform use case. These are labelled indicative, Railor-account observations with incomplete payout costs, not customer-specific quotes. Search may request them for evidence-supported, policy-eligible fiat routes; they cannot satisfy customer-connected/live-quote rules or win complete-cost rankings. Execution and decision recording retain their existing customer-scoped authority checks. Customer connections remain optional for negotiated account pricing and separately approved execution. No credential is exposed in a browser environment variable.

Xflow and dLocal Payouts v3 also have read-only quote adapters. A customer with an authorized account can connect Xflow's `sk_test_`/`sk_live_` secret (and an optional connected-user account ID for a platform) or dLocal Payouts v3 OAuth client ID/secret under **Settings → Connections**. The connection test verifies authentication; route-specific quote permission is checked only when a quote is requested. Xflow's documented payout FX quote covers INR settlement and is indicative, without a complete transfer-fee breakdown. dLocal's amount-specific Quote API requires separate activation from dLocal and documents USD-funded local-currency payouts; its quote includes a principal and may debit fees/taxes on top, so Railor does not rank it as a fixed-send-budget price. Neither adapter submits payouts.

For Railor-owned public quote observations, use the server-only `XFLOW_PLATFORM_*` or `DLOCAL_PLATFORM_*` variables in `.env.example`. Set each `*_PLATFORM_PUBLIC_QUOTES=true` only after the provider permits public display of your account's pricing. Production hides sandbox observations by default. These observations appear in a separate, unranked panel and never expose credentials or executable quote IDs. [Xflow quote API](https://docs.xflowpay.com/exports/latest/api) · [dLocal Payouts v3 OAuth](https://docs.dlocal.com/reference/security-payouts-v3) · [dLocal Quote API](https://docs.dlocal.com/reference/create-quote-payouts-v3).

Copy `.env.example` to `.env`. Every variable has a working local default; the file documents what each one unlocks (`DATABASE_URL`, `AUTH_SECRET`, SMTP, OAuth client IDs, `CREDENTIALS_ENCRYPTION_KEY` for connections/beneficiaries/webhooks, `CRON_SECRET` for the scheduler hooks, `RAILOR_LIVE_PAYMENTS`, `RAILOR_AUTO_MIGRATE`, `ANTHROPIC_API_KEY` for the optional model-assisted interpreter, `SNAPSHOT_DIR`).

Without `ANTHROPIC_API_KEY`, query interpretation runs entirely on the deterministic rule engine — fully functional, and the only mode in which output can never be mistaken for a model's guess.

---

## Demo data

The seeded providers are **fictional** and flagged `is_demo`. Evidence URLs point at `demo.railor.dev`. Nothing in this repository describes a real financial company, and no real provider's documentation is reproduced.
