# RAILOR — MASTER BUILD PROMPT v2

> v1 defined *what* Railor is. v2 keeps all of that and adds the missing half: **why people will actually use it.**
> Everything new is derived from how the products developers genuinely enjoy (Stripe, OpenRouter, Plaid Link, Vercel, Linear) remove work from the user. Those rules live in §3 and §4 and they are binding on every screen in this document.

---

## 0. HOW TO USE THIS DOCUMENT

You are a senior founding engineer + product designer + data engineer + fintech infrastructure architect building **Railor**, a production-quality B2B financial infrastructure intelligence platform.

Rules of engagement:

1. Build working software, not mockups. Every screen listed here must render, with real data from the seeded database.
2. §3 (Ease Doctrine) and §58 (Trust Principle) override every other instruction when they conflict.
3. Where a capability requires an integration that does not exist yet, build the real interface plus a clearly named adapter boundary (`packages/adapters/*`) — never fake functionality behind a real-looking success state.
4. Ship in the order in §28.

Do **not** build: a generic SaaS dashboard, a crypto landing page, an AI chatbot wrapper, or another stablecoin payment gateway.

---

## 1. PRODUCT TRUTH

**RAILOR — Financial infrastructure, mapped.**

> Discover, compare and monitor the rails powering global money movement.
> Know which provider works, where it works, who it can onboard, what it costs, and when something changes.

The problem, stated once, precisely:

> Stablecoin and payment companies have fragmented information about providers, jurisdictions, KYB/KYC requirements, currencies, card programs, ramps, settlement rails, fees, limits, API support, licensing coverage and operational status. Founders waste days asking Discord which provider works for a country or use case, reading dozens of docs, sitting through sales calls, maintaining spreadsheets, and discovering incompatibilities only during implementation.

Railor is **a live capability graph, intelligence platform and future interoperability layer for global financial infrastructure.**

Railor is **not** an AI financial advisor, a wallet, a payment gateway, a ramp, a card issuer, a static directory, or a crypto analytics dashboard.

**Stage ladder (build V1, architect for all of it):**

```
1 Intelligence   Can this provider support what I'm building?
2 Monitoring     Tell me when a rail, country, requirement or capability changes.
3 Benchmarking   Which provider actually performs better?
4 Developer API  Give my application structured access.
5 Connections    Businesses connect their existing provider accounts.
6 Unified API    One interface over many providers.
7 Orchestration  Route by eligibility, compliance, cost, reliability, speed.
8 Agent layer    MCP server exposing verified infrastructure knowledge.
```

V1 = stages 1–4 fully working, 5–8 present as architecture, adapters and clearly-labelled roadmap surfaces. **No financial execution in V1.**

---

## 2. PROBLEMS → FEATURES (every feature traces to a row)

| # | Problem | Railor answer | Surface |
|---|---------|---------------|---------|
| A | Provider discovery is tribal knowledge | Natural-language search → structured corridor query | Public search, Corridor Explorer, `POST /v1/corridors/search` |
| B | Every provider describes capability differently | Normalized capability schema across 20+ dimensions | Capability graph, provider profiles, `GET /v1/capabilities` |
| C | KYB/KYC requirements overlap but differ | Org KYB profile → per-provider readiness diff | Readiness screen, `POST /v1/eligibility` |
| D | Information goes stale silently | Snapshots + diff engine + change events + alerts | Monitoring, change feed, `GET /v1/changes` |
| E | Providers advertise; reality differs | Observation tables designed now, benchmarks later | `observations`, `health_checks`, provider profile "Observed" tab (empty-state honest in V1) |

---

## 3. THE EASE DOCTRINE (NEW — BINDING)

Railor competes on trust *and* on effort. A correct product that takes 20 minutes to configure loses to a decent product that answers in 20 seconds. These twelve laws are derived from products that won on effort; each one has a concrete Railor obligation.

**Law 1 — Value before account.**
*Plaid's pre-Link explainer and partial-value patterns exist because trust gaps, not technical failure, cause drop-off.*
Railor obligation: the public search returns real interpreted filters, a real provider-count breakdown, and two real (partially blurred) provider results **before** any auth wall. Never show a login modal as the first response to a question.

**Law 2 — No empty state, ever.**
*Vercel removed the gap between signup and first artifact via git-native import and framework detection.*
Railor obligation: onboarding answers generate the dashboard. A user who finishes onboarding lands on a populated infrastructure map with 1–3 pre-built corridors, 1 pre-armed monitor, and a real change feed. There is no "create your first corridor" blank screen. If the user skipped everything, seed a default corridor from their email domain's country + the most common corridor in the dataset, marked *Suggested — edit this*.

**Law 3 — Click, don't type.**
*Linear asks "what kind of team are you?"; Notion asks "what will you use it for?" — one tap, and the answer routes the whole product.*
Railor obligation: **every required input in the product must be completable with a pointer alone.** Typing is always an accelerator, never a requirement. Any field that can offer options must offer: 4–8 large tiles/chips of the likeliest values, a searchable long tail, a "Not sure yet" escape, and an inferred default already selected where inference is defensible. Free text is allowed only where the domain is genuinely open (company name, note fields).

**Law 4 — One decision per view.**
Multi-field forms become sequenced questions with a progress indicator (`2 of 3`), an always-live Back, autosave after every answer, and Enter/→ to advance. A user must never face a screen with 9 empty inputs.

**Law 5 — Infer, then confirm.**
Never ask for what can be derived. Derive company jurisdiction from the work-email domain and IP, derive target markets from the first corridor searched, derive product interest from the query. Present derivations as **pre-selected, visibly labelled, one-click editable** — never silently applied.

**Law 6 — Paste is an input method.**
Anywhere structured data is wanted, accept a paste of the unstructured thing: a sentence, a provider URL, a docs link, a CSV of corridors, a KYB checklist from another provider. Parse it, render the parse as editable chips, ask for confirmation. This is the single highest-leverage ease feature in the product.

**Law 7 — Show the interpretation, always editable.**
*Railor's AI must be visible as structure, not as a personality.* Every natural-language input renders an interpretation panel (`Entity: India · Asset: USDC · Destination: UAE · Rail: bank payout · Customer: business`) where each token is a control. Correcting the machine takes one click and re-runs the query.

**Law 8 — Sensible default over configuration.**
*OpenRouter ships routing variants (`:nitro` fastest, `:floor` cheapest) and automatic provider fallback so the average user configures nothing.*
Railor obligation: Corridor Explorer opens with a working ranked result on a default preset. Presets: **Balanced** (default), **Cheapest**, **Fastest settlement**, **Easiest onboarding**, **Widest coverage**. Filters are a refinement, never a prerequisite.

**Law 9 — Test credentials on day zero; docs that know who you are.**
*Stripe reveals test secret keys as often as needed and live keys once; logged-in docs render with your own key and data.*
Railor obligation: a `rk_test_...` key is created automatically at org creation and shown in the developer portal and inside every documentation code sample when the user is signed in. `rk_live_...` is generated on demand, shown once, stored hashed. Every doc sample is runnable as-is, with the reader's own saved corridor substituted into the payload.

**Law 10 — Drop-in over novel.**
*OpenRouter won partly by being an exact drop-in for an SDK developers already had.*
Railor obligation: REST shapes follow Stripe conventions (`data`, `has_more`, cursor pagination, `object` discriminators, idempotency keys). SDK method names mirror the REST tree (`railor.corridors.search`, `railor.providers.retrieve`). One key works across every surface: REST, TS SDK, Python SDK, CLI, MCP.

**Law 11 — One-click distribution for agents.**
*Cursor installs MCP servers from a deeplink button; OAuth completes in the browser.*
Railor obligation: the MCP page ships **Add to Cursor / Add to Claude Code / Add to VS Code** buttons (deeplink + copy-paste JSON fallback), remote HTTP transport with OAuth, and a 30-second "ask your agent this question" starter prompt.

**Law 12 — Label the unfinished honestly.**
*Seasons' mega-menu marks unreleased modules `COMING SOON` in the navigation itself, and the product reads as more credible for it.*
Railor obligation: roadmap surfaces (Connections, Routing, Benchmarks) appear in navigation with a `Coming soon` chip and a real "notify me" action. Never a dead link, never a fake screen.

**Ease acceptance tests (must pass before build is complete):**

```
E1  A visitor gets a real, specific, partially-visible answer without an account.       ≤ 20s
E2  A new user reaches a populated dashboard using only clicks.                          ≤ 90s
E3  Every onboarding step is completable with zero keystrokes.                           100%
E4  A signed-in developer makes a successful API call by copying one snippet.            ≤ 60s
E5  A user corrects a misinterpreted query with one click, not a re-type.                1 click
E6  A user turns a search result into a monitored corridor.                              ≤ 2 clicks
E7  Any wizard survives a page reload without data loss.                                 always
E8  Any table row can be expanded to its "why" without leaving the page.                 1 click
```

---

## 4. INTERACTION PRIMITIVES (build these once, in `packages/ui`, use everywhere)

These components are how §3 gets enforced structurally instead of by discipline.

1. **`<ChoiceGrid>`** — large selectable tiles (2–4 cols, icon + label + one-line hint), single or multi select, keyboard-navigable, `Not sure yet` option, optional `Other →` that reveals search. Used by onboarding, filters, monitor builder.
2. **`<SmartPicker>`** — the universal "pick a thing" control for countries / currencies / assets / networks / providers. Contents: recents, inferred suggestion pinned to top with a `Detected` chip, flag/logo, ISO code, fuzzy search, multi-select as removable chips, paste-many support (`IN, AE, SG` or a pasted list). Never a bare `<select>`.
3. **`<InterpretationBar>`** — renders a structured query as editable chips with a confidence dot; clicking a chip opens the matching `SmartPicker` inline; changing any chip re-runs the query with an optimistic transition.
4. **`<PasteToStructure>`** — a dropzone/textarea accepting text, URLs, CSV or files; runs the parser; returns chips into an `InterpretationBar` for confirmation. Used in onboarding (paste your requirements), KYB profile (paste a provider's checklist), monitoring (paste a corridor list), admin (paste a docs URL).
5. **`<StepFlow>`** — the wizard shell: one question per view, `n of m` progress, Back, Skip (records an explicit assumption), autosave to server per step, resumable via URL, spring transition ≤ 300ms.
6. **`<EvidencePopover>`** — attaches to any claim: status, source type, source title + URL, retrieved at, last verified at, confidence, raw excerpt, `View change history`. Claims without evidence render as `Unknown` — never blank, never guessed.
7. **`<WhyPanel>`** — the eligibility explainer: verdict, plain-language reason, what *is* supported, what would change it, last verified, evidence list, historical change timeline.
8. **`<ResultRow>`** — rich expandable provider row: verdict pill, provider identity, key facts, freshness, and inline expansion into `WhyPanel` (no navigation).
9. **`<CodeSample>`** — language tabs (cURL / TypeScript / Python), copy button, live substitution of the signed-in user's test key and most recent corridor, `Run` where safely possible.
10. **`<StageBadge>`** — `Live` / `Beta` / `Coming soon` chip used in navigation, mega-menus and roadmap surfaces (Law 12).
11. **`<EmptyState>`** — requires three props: what this is, why it's empty, and the single action that fixes it. Generic "Nothing here yet" text is a build error.
12. **`<CommandPalette>`** — ⌘K/Ctrl-K over providers, countries, corridors, capabilities, changes, docs and actions ("monitor this corridor", "compare with…", "create test key").

---

## 5. VISUAL SYSTEM

Premium financial infrastructure: airy, bright, sophisticated. Take *quality* inspiration from the supplied Seasons screenshots and from campfire.ai's calm density — **copy neither**. Railor owns its own system.

Colors:

```
bg            #F8F9FD      surface        #FFFFFF     lavender surface  #F0EEFF
primary       #5B2EFF      deep purple    #3E17D8     violet            #8B6CFF
accent lime   #8DFF36      text           #17171B     text secondary    #707080
border        rgba(30,30,50,0.08)
```

Semantics: purple = primary action / selection / live route / key figure. Lime-green = operational, supported, verified. Amber = partial, outdated, missing requirement. Red = unsupported, degraded. Most of the UI stays neutral; purple is punctuation, not paint.

Typography: modern geometric sans (Geist / Inter / Plus Jakarta). Editorial marketing headings, tight tracking, purple emphasis on one word. Dashboard type is compact and tabular-numeral.

Form language: large rounded containers, hairline borders, extremely soft shadows, restrained glass, generous whitespace, small confident microcopy. Avoid: default shadcn look, gray card soup, dark-neon crypto clichés, glow blobs, everything-is-a-rectangle.

Brand metaphor: **rails, routes, corridors, nodes, moving value.** Hero artwork = an abstract 3D routing node with translucent rails converging and one illuminated path. No literal trains.

Marketing and dashboard must read as two surfaces of one brand: same palette and type, different density.

---

## 6. MOTION

Motion (Framer Motion) communicates infrastructure behaviour, not decoration. 150–300ms, spring for panels, `prefers-reduced-motion` fully honoured.

- **Hero:** rails travel toward the routing node; nodes pulse; the eligible route illuminates purple; ineligible routes desaturate.
- **Search:** sequential states — `Understanding request… · Checking 31 providers… · Matching entity eligibility… · Checking corridor availability… · Comparing capabilities…` — each state tied to a real pipeline stage. If results arrive first, the sequence completes immediately. **Never simulate latency.**
- **Cards:** 3px lift, shadow bloom, border opacity step, one-time counter animation.
- **Dashboard:** route lines re-animate on filter change; table sorts transition; charts animate on first load only; side panels spring; palette scales+fades.

---

## 7. INFORMATION ARCHITECTURE

```
Public        /  /product/*  /infrastructure  /developers/*  /resources/*  /company/*  /docs/*
Auth          /login  /join  /invite/:token
Onboarding    /welcome  (3 steps, resumable)
App           /app  /app/search  /app/corridors  /app/providers  /app/compare
              /app/monitoring  /app/evidence  /app/readiness  /app/developers  /app/settings/*
Admin         /admin/{providers,sources,crawlers,changes,evidence,audit}
```

Mega-menus (Seasons-grade, contextual visual panel on the right, `StageBadge` on every item):

```
Product        Search · Provider Intelligence · Corridor Explorer · Change Monitoring · Comparisons · Connections (soon)
Developers     API · Documentation · MCP · SDKs · CLI · Changelog
Resources      Provider Directory · Market Coverage · Research · Guides
Company        About · Careers · Contact · Trust
```

---

## 8. MARKETING SITE

Floating rounded navbar: `RAILOR · Product · Infrastructure · Developers · Resources · Company · Search rails · Sign in · Get started`.

Sections (all built, none filler):

1. **Hero** — headline `Know which financial rail actually works.` Sub: *Discover, compare and monitor stablecoin, banking, card and compliance infrastructure across markets — backed by verifiable sources.* Centrepiece = the Infrastructure Search field (rotating placeholders; not branded as "AI copilot") plus animated routing artwork.
2. **The real problem** — `Financial infrastructure shouldn't live in spreadsheets and Discord threads.` Animated stream of real questions converging into Railor.
3. **Capability graph** — `One normalized view of fragmented financial infrastructure.` Animated Provider → Countries → Entities → Assets → Networks → Products → Requirements → Limits.
4. **Evidence** — `Every answer should be verifiable.` A live capability card with source, verified-at, confidence, `View evidence →`.
5. **Corridor intelligence** — interactive corridor diagram (India → USDC → UAE → AED bank) with eligible providers.
6. **Change monitoring** — `Know before your integrations break.` A real change event rendered from seed data. CTA `Monitor my rails`.
7. **Developer infrastructure** — `<CodeSample>` with the routes search snippet and its real structured response; REST · TypeScript · Python · MCP · CLI · Webhooks strip with `StageBadge`s.
8. **Platform vision** — `DISCOVER → VERIFY → MONITOR → CONNECT → ROUTE`.
9. **CTA** — purple gradient panel, `Stop guessing which rail works.` → `Explore Railor`.

Footer: full sitemap, status, trust/security, docs, changelog, legal.

**No fabricated metrics.** Permitted counters are dataset facts only: `Providers mapped · Countries indexed · Sources monitored · Capabilities tracked · Changes detected (30d)` — each rendered from a live count.

---

## 9. PUBLIC SEARCH → VALUE-BEFORE-AUTH FLOW (Law 1)

Visitor types (or clicks a suggested chip): *"I have an Indian company and need USDC → AED business payouts."*

Immediately render `<InterpretationBar>`:

```
India-incorporated business · USDC · → AED bank payout · UAE          [edit any chip]
```

Then the real breakdown, computed against the live dataset:

```
31 providers checked
 6 potential providers
 3 appear compatible
 2 require additional KYB
 1 unavailable for Indian entities
```

Show two provider previews with verdict, one supporting fact and freshness; blur fees, limits, requirements and evidence. CTA: `View full comparison`.

Auth modal: `Continue with Google` · `Continue with GitHub` · divider · work email → magic link. Legal line: *By continuing, you agree to the Terms and Privacy Policy.*

After auth, return the user **exactly** to the query they typed, already run. The query and interpretation persist through auth, org creation and onboarding — losing it is a build error.

---

## 10. AUTHENTICATION

Supabase Auth (or equivalent): Google, GitHub, email magic link/OTP. No passwords in V1. Two-column layout: animated network artwork left, auth right. Polished mobile behaviour. Invite links resolve to the correct org after auth.

---

## 11. ORGANIZATION-FIRST MODEL

Tables: `users, organizations, organization_members, roles, invites`. Roles: `owner, admin, member, viewer`. **All product data belongs to the organization**, never the individual. Org creation is a single field with the name pre-filled from the email domain (Law 5) and a `Create` button; team invites are offered but skippable and re-offered later in context.

---

## 12. ONBOARDING — THREE QUESTIONS, ZERO KEYSTROKES REQUIRED

Built with `<StepFlow>`. Resumable at `/welcome?step=n`. Autosaved per answer. Every step has `Skip — I'll decide later` which records an explicit, visible assumption rather than a silent default.

**Step 0 (free, no question asked):** if the user arrived from a public search, its interpretation is already applied and shown as *We've used your search to pre-fill this. Change anything.*

**Step 1 — What are you building?**
`<ChoiceGrid>`, single-select, 3×3 tiles with icon + one-line hint:

```
Payments · Wallet · Neobank · Marketplace · Card program
Treasury · Stablecoin infrastructure · Remittances · Something else
```

Routing signal: sets default products, dashboard panels, and which capability dimensions are surfaced first.

**Step 2 — Where do you operate?**
Three `<SmartPicker>` rows, each pre-filled with an editable inference:

```
Company jurisdiction        [Detected: India ▾]          ← from email domain / IP, one click to change
Target customer countries   [ UAE ✕ ] [ Saudi Arabia ✕ ] [+ Add]
Primary settlement markets  [ AED ✕ ] [+ Add]
```

Each picker opens with the 6 likeliest values as chips (derived from the user's step-1 answer and dataset frequency), a search box, and recents. Multi-select is chips, not checkboxes-in-a-list. `Paste a list` accepts `IN, AE, SG` or a pasted spreadsheet column.

**Step 3 — Which infrastructure matters?**
`<ChoiceGrid>`, multi-select:

```
Stablecoin → fiat · Fiat → stablecoin · Cards · Bank payouts · Collections
Virtual accounts · KYC/KYB · Treasury · Wallet infrastructure
```

CTA: **`Build my infrastructure map`** → animated transition (rails converging into the dashboard layout) while the server materializes:

- 1–3 corridors from (jurisdiction × target markets × selected infrastructure)
- provider eligibility computed for each
- one monitor armed on the primary corridor
- the change feed filtered to the user's providers and countries

Result: the dashboard is populated on first paint (Law 2).

---

## 13. DASHBOARD — OPERATIONAL CONSOLE

Not marketing cards. Information density in the register of Stripe / Linear / Datadog, in Railor's bright identity. Collapsible compact sidebar: `Overview · Search · Corridors · Providers · Compare · Monitoring · Evidence · Readiness · Developers · Settings`.

Overview:

```
Good afternoon, Anshit
Here's what's changed across your infrastructure.

Providers tracked 34 | Active corridors 12 | Changes this week 7 | Coverage warnings 2
```

Metrics are integrated panels with sparkline + drill-through, not four floating number cards.

- **Infrastructure map** — corridors as live route paths (green compatible / amber partial / red unavailable); hovering a route reveals provider set; clicking opens the corridor.
- **Recent changes** — `Provider X added AED payouts · 2h ago` with evidence popovers inline.
- **Saved corridors** — `IN → AE · USDC → AED · Business · 3 compatible providers`.
- **Readiness strip** — `KYB profile 6/9 complete — 2 providers unblocked by adding one document →`.

---

## 14. GLOBAL SEARCH

⌘K / Ctrl-K everywhere. Searches providers, countries, currencies, assets, chains, corridors, capabilities, changes, docs and **actions**. Natural language converts to structured filters and *always* renders `<InterpretationBar>` for correction. Recent queries and saved corridors appear before typing begins (Law 3).

---

## 15. CORRIDOR EXPLORER — SIGNATURE SCREEN

Inputs as chips across the top (each a `SmartPicker`, each optional, each pre-filled from onboarding): entity country, customer type, source country, destination country, source asset, source network, destination currency, payment method, amount.

Opens with a working result on the **Balanced** preset (Law 8). Preset switcher: Balanced · Cheapest · Fastest settlement · Easiest onboarding · Widest coverage.

```
31 providers checked · 4 compatible · 2 need additional KYB · 1 unavailable
```

Results are `<ResultRow>`s, not an HTML table: Provider · Eligibility · Product · Fees · Limits · KYB · Source · Updated. Expanding a row reveals `<WhyPanel>` in place. Row actions: `Compare`, `Monitor`, `Open profile`, `Copy as API call`.

**`Copy as API call`** turns the current UI state into a runnable snippet with the user's test key — the bridge between the app and the API (Law 9/10).

---

## 16. "WHY UNAVAILABLE" — NON-NEGOTIABLE

Never render a bare `Unsupported`. Always:

```
Provider Y — UNAVAILABLE

Reason         Indian-incorporated businesses are currently not accepted for this product.
Also true      UAE recipient accounts are supported.
Would change   Entity in SG, AE or US · or the individual (non-business) product
Last verified  17 Aug 2026
Evidence       Provider eligibility documentation ↗   Confidence 0.94
History        12 Mar 2026 supported → 02 Aug 2026 unsupported
```

Same treatment for `partial`: state precisely what is missing and the one action that resolves it.

---

## 17. PROVIDER DIRECTORY & PROFILE

Directory: filterable by region, customer type, product, asset, currency, blockchain, API available, sandbox, KYC/KYB, card support. Results are substantive cards (coverage counts, assets, products, freshness), never a logo grid.

Profile sections: Overview · Coverage (interactive map) · Products · Entity eligibility · Customer eligibility · Assets & networks · Fiat currencies · Requirements (KYC/KYB) · Limits · Pricing (only when verified — **never invented**) · Developer support (REST, SDKs, sandbox, webhooks, docs) · Evidence · Change history · Observed performance (honest empty state in V1).

---

## 18. COMPARISON

2–4 providers, dynamically adapting columns, sticky first column, diff-highlight rows where providers disagree, `Only show differences` toggle. `Share comparison` produces a public read-only URL with a generated title and an evidence footer with verification timestamps.

---

## 19. READINESS — KYB/KYC FRICTION (Problem C, and the biggest manual-input surface)

One org-level profile of what the company already has. Answered with `<StepFlow>` + `<ChoiceGrid>` + `<PasteToStructure>`; a checklist item is a tap (`Have it` / `Don't have it` / `Not sure`), with optional document upload. Paste a provider's requirement email or checklist and Railor maps it into the normalized schema for confirmation (Law 6).

```
ACME LTD
Company registration ✓   Director identity ✓   UBO ✓
Business address ✓       Sanctions screening ✓  Source of funds ✓

Provider A   READY
Provider B   Missing: recent bank statement
Provider C   Missing: source of funds declaration · director selfie verification
```

Copy must state: *Railor normalizes published requirements. Providers remain responsible for their own KYC/KYB decisions.* Railor never claims to replace a regulated provider's obligations.

---

## 20. MONITORING

Watch providers, corridors, countries, assets, products. Created in ≤2 clicks from any result row (Law/E6). Alert types: coverage changed · requirement changed · pricing changed · limit changed · API changed · documentation changed · service degraded · product launched · product removed.

V1 delivery: email + in-dashboard feed. Slack / Discord / webhook appear with `Coming soon` + notify-me (Law 12). Digest options: instant · daily · weekly. Every alert links to the diff, the evidence, and the affected corridors.

---

## 21. EVIDENCE & CONFIDENCE

```ts
interface Evidence {
  sourceUrl: string
  sourceTitle: string
  sourceType: "official_docs" | "api" | "pricing" | "help_center" | "terms"
            | "status_page" | "github" | "official_announcement" | "manual_verified"
  retrievedAt: Date
  lastVerifiedAt: Date
  confidence: number      // 0–1
  rawExcerpt?: string
  rawHash: string
}
```

Base confidence: official API 1.00 · status page 0.98 · official docs 0.95 · help centre 0.92 · official announcement 0.90 · manually verified 0.90 · third-party lower. Decay confidence with age since `lastVerifiedAt`. Display bands: `Verified · High · Medium · Needs review · Potentially outdated`.

Evidence is append-only — **never silently overwritten**. Conflicting sources render as `Conflicting information detected` showing both, routed to internal review; the system never picks the more plausible-sounding claim automatically.

---

## 22. DATA ARCHITECTURE (PostgreSQL, properly normalized)

```
providers · provider_products · countries · currencies · assets · blockchains
capability_types · provider_capabilities · corridors · provider_corridors
customer_types · requirements · provider_requirements · fees · limits
source_documents · source_snapshots · evidence · change_events
observations · health_checks
organizations · organization_members · invites · saved_searches · saved_corridors
watchlists · alerts · api_keys · api_usage · audit_logs
org_kyb_profile · org_kyb_items · provider_connections (schema only in V1)
```

A capability row is dimensioned by: provider · product · entity jurisdiction · customer country · customer type · source asset · source network · destination currency · destination country · payment method · availability · effective date · evidence. This must answer:

> Can Provider X serve an Indian-incorporated business sending USDC on Base to an AED bank account for a UAE beneficiary?

JSONB is allowed for raw payloads only. Domain facts live in columns with constraints.

---

## 23. INGESTION & CHANGE ENGINE

```
/apps/worker (Python)  — Scrapy · Playwright · selectolax · httpx · Pydantic · Redis queue
```

Priority: official APIs → direct HTTP → Scrapy → Playwright → (Selenium never, unless unavoidable). Respect robots policies, site terms, rate limits, authentication boundaries and access controls. **Never bypass CAPTCHAs or protections.**

Source registry: `provider_id, url, source_type, crawl_frequency, parser, requires_js, enabled, last_checked, next_check, etag, last_modified, content_hash`.

Pipeline: `SOURCE REGISTRY → FETCH → RAW SNAPSHOT → CONTENT EXTRACTION → STRUCTURED EXTRACTION → NORMALIZATION → VALIDATION → DIFF → HUMAN REVIEW (when required) → PUBLISH`.

Diffing compares *normalized values*, not raw HTML, and emits `change_event {provider, field, previous_value, current_value, detected_at, source, confidence, review_status}`. Extraction output never overwrites published truth without validation; material changes (eligibility, requirements, pricing, limits) require human approval.

Ship: one example Scrapy spider, one example Playwright source, one example official-API source, snapshot storage to object storage, and scheduled jobs.

---

## 24. AI USAGE — INFRASTRUCTURE, NOT BRANDING

Permitted: natural language → structured filters; documentation extraction; requirement normalization (`Ultimate Beneficial Owner`/`UBO`/`Beneficial Owner` → one concept); change summarization; paste parsing; error-code explanation.

Forbidden: inventing capability, pricing, limits or coverage; upgrading an inference to `verified`; answering when the dataset says unknown. Every AI-derived value carries `derivation: "model"` plus the source it was derived from, and is visually distinct from verified data.

---

## 25. API, SDK, CLI, MCP

REST (`/v1`), Stripe-shaped, cursor-paginated, idempotent, rate-limited, versioned:

```
GET  /v1/providers                POST /v1/providers/search
GET  /v1/providers/{id}           POST /v1/eligibility
POST /v1/corridors/search         POST /v1/compare
GET  /v1/capabilities             GET  /v1/changes
GET|POST /v1/watchlists           POST /v1/keys        (provisioning keys, per-project, labelled, capped)
```

Every response carries `data`, `evidence`, `confidence`, `last_verified_at`. Claims without provenance are never returned.

```json
{
  "query": { "entity_country": "IN", "destination_country": "AE", "asset": "USDC",
             "destination_currency": "AED", "customer_type": "business" },
  "providers_checked": 31,
  "results": [{
    "provider": { "id": "provider_x", "name": "Provider X" },
    "eligibility": "supported",
    "confidence": 0.96,
    "last_verified_at": "2026-08-17T10:24:00Z",
    "evidence": [{ "type": "official_docs", "url": "...", "verified_at": "..." }]
  }]
}
```

SDKs mirror the REST tree:

```ts
const routes = await railor.corridors.search({
  entityCountry: "IN", destinationCountry: "AE",
  asset: "USDC", destinationCurrency: "AED", customerType: "business"
})
```

CLI: `railor login · railor corridors search --entity IN --to AE --asset USDC · railor watch add · railor keys create`.

MCP server (read-only in V1): `search_providers · check_eligibility · search_corridors · compare_providers · get_provider_capabilities · get_provider_changes · get_kyb_requirements · get_supported_currencies · get_supported_countries`. Every tool response includes `source`, `verified_at`, `confidence`. Remote HTTP transport + OAuth, plus deeplink install buttons and copy-paste config (Law 11). Do not compete with general assistants — build the thing they want to call.

Architect (do not implement) the future unified object layer: `customers · businesses · beneficiaries · wallets · quotes · payments · payouts · cards · accounts`, provider connections with encrypted credentials, and a routing engine scored on eligibility (mandatory gate) · health 25% · reliability 25% · cost 20% · speed 15% · limits 10% · preference 5%. **Never route through an ineligible provider.**

---

## 26. DEVELOPER PORTAL & DOCS

Portal: Overview · API Keys · Documentation · Usage · Webhooks · MCP · CLI.

- `rk_test_...` exists before the user asks for it; visible and re-revealable.
- `rk_live_...` shown once, hashed server-side, with scopes and optional spend/usage caps and labels.
- Usage view: requests, errors, latency, top endpoints, per-key attribution.

Docs at Stripe quality: Getting started · Provider intelligence · Eligibility · Corridors · Changes · API reference · SDKs · MCP · CLI · Webhooks. Language tabs (cURL / TypeScript / Python), copy buttons, and **key + data injection for signed-in readers** (Law 9). A "60-second start" page that ends in a real response.

---

## 27. ADMIN CONSOLE (internal, separate surface)

Provider management · source registry · crawler status and failures · change review queue (Approve / Reject / Edit with side-by-side diff, evidence and confidence) · evidence review · confidence correction · provider merge · capability editing · manual verification · full audit trail.

---

## 28. SECURITY, ACCESSIBILITY, PERFORMANCE

Security: RLS or equivalent org isolation, server-side authorization on every route (frontend role checks are never trusted), API keys hashed, secrets encrypted, secure cookies, CSRF where relevant, rate limiting, Zod/Pydantic validation at every boundary, DB constraints, audit logs.

Accessibility: semantic HTML, full keyboard paths (every `ChoiceGrid`, `SmartPicker` and wizard is arrow-key operable), visible focus, ARIA labels, contrast, reduced-motion, accessible dialogs and tooltips.

Performance: server components where appropriate, minimal JS on marketing, route-level loading states, skeletons over blanks, optimized images, lazy heavy visuals, virtualized long tables. Motion never delays data.

---

## 29. REPO & STACK

```
railor/
  apps/     web/ (Next.js)   api/   worker/ (Python)
  packages/ ui/ database/ types/ sdk/ adapters/ config/
  docs/ scripts/ tests/
```

Frontend: Next.js · TypeScript · Tailwind · shadcn primitives where useful · Motion · TanStack Query · TanStack Table · React Hook Form · Zod.
Backend: Next.js server/API + Python service for scraping, normalization, document processing, change detection.
Infra: PostgreSQL · Redis · job queue · object storage for snapshots · Supabase Auth.
Ship: migrations, seeds, `.env.example`, Docker Compose dev environment, README, tests (unit for normalization/diff/eligibility, integration for API, E2E for the demo flow and the ease tests E1–E8).

---

## 30. SEED DATA

Clearly fictional or explicitly labelled demo providers. **Never invent claims about real financial companies.** Include 15 providers, 20 countries, 8 currencies, 4 stablecoins, 6 networks, multiple products, requirements, evidence records with plausible sources, and historical change events so the change feed, evidence popovers and timelines are populated on first run.

---

## 31. COPY

Technical, confident, concise, infrastructure-oriented. Use: *Know which rail works. · Every capability. Every requirement. Every source. · Financial infrastructure changes. Railor keeps track. · Build against verified infrastructure data instead of spreadsheets.*
Ban: "revolutionizing finance", "welcome to the future", "AI-powered next-generation", "seamless blockchain ecosystem".

Empty states name the gap and the fix: *You're not monitoring any providers yet. Add one and Railor will notify you when its coverage, requirements or infrastructure changes.* → `Add provider`.
Error states never guess: *We couldn't verify this capability from a sufficiently reliable source.* + last known status, source, last verified.

---

## 32. MOBILE

Marketing must be excellent on mobile. Dashboard must work, desktop-first for operations: collapsible nav, stacked panels, tables → expandable lists, filter drawer, persistent search, horizontally scrollable comparison, intelligently simplified charts. Redesign, don't shrink.

---

## 33. THE TRUST PRINCIPLE (overrides everything)

> **It is better for Railor to say "unknown" than to confidently provide incorrect financial infrastructure information.**

---

## 34. DEMO FLOW (must work end to end)

1. Visitor searches *"Indian company sending USDC to a UAE supplier who receives AED"*.
2. Interpretation renders; pipeline states animate; public breakdown appears (31 evaluated / 4 potential matches); two blurred previews.
3. `View full comparison` → auth → org auto-named from domain → 3-step onboarding, all clickable, pre-filled from the query.
4. `Build my infrastructure map` → populated dashboard, corridor already created.
5. Corridor page: Provider A supported · Provider B additional KYB required · Provider C supported · Provider D unavailable (Indian entities unsupported).
6. Provider D expands to reason, evidence, last verified, historical change.
7. `Monitor` in one click → dashboard shows `1 monitored corridor · 4 providers · 0 warnings`.
8. `Copy as API call` → developer portal → test key already present → curl returns the same result, with evidence.
9. MCP page → `Add to Cursor` → an agent asks the same question and gets the same sourced answer.

---

## 35. BUILD ORDER

```
1  Repo + database + migrations         13 Comparison
2  Design system + interaction primitives (§4)  14 Saved corridors
3  Marketing site                       15 Monitoring + alerts
4  Auth                                 16 Change detection engine
5  Organizations                        17 Scraping workers + example spiders
6  Onboarding (§12)                     18 Internal review console
7  Capability schema                    19 Developer portal + keys
8  Seed data                            20 Public API + SDKs + CLI
9  Provider directory                   21 MCP server
10 Provider profiles                    22 Readiness (KYB profile)
11 Corridor explorer                    23 Tests (incl. E1–E8) + performance
12 Evidence system                      24 Final visual polish
```

---

## 36. FINAL PRODUCT TEST

Ship only when all are yes:

- Can a founder answer *"I run an Indian company, need USDC → AED business payout in UAE — which providers work, why, and what supports that answer?"* in under 60 seconds?
- Does Railor explain **why** a provider cannot work?
- Does every important answer carry a source and a last-verified time?
- Can the user monitor that answer for changes in two clicks?
- Can a developer get the identical structured answer from the API with a key they already have?
- Can an agent get it through MCP, with provenance?
- Do all eight ease tests (E1–E8) pass?
- Would a fintech team trust this enough to make a provider decision from it?

**Core principle:** don't optimize for "how do we add AI?" Optimize for **"how does Railor become the most trusted machine-readable source of truth for global financial infrastructure — and the least effortful way to reach it?"**
