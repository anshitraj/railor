# Railor integration handoff

The local product can research a corridor, preserve citation-bound new-market leads for review, evaluate a payment under an active policy, require an independent approval, revalidate a decision, dispatch a customer-hosted **read-only quote or sandbox simulation**, and run **payments** end to end in test mode (provider sandboxes or Railor's simulator). Live payouts are built but switched off: they require the deployment switch, per-workspace and per-provider approval by a Railor operator, a production connection, and the validation steps below.

## Required before a production rollout

1. Apply the checked-in database migrations (through `0021_discovery_companies_and_rail_sources`) to a backed-up staging database, verify tenant scoping and audit retention with representative data, then promote through the normal deployment process. The app no longer migrates a hosted database on start: against Neon/production it checks and refuses to serve with pending migrations. Run `pnpm db:migrate -- --dry-run` to list what is pending, then `pnpm db:migrate -- --confirm-remote` after the backup. Local tests use disposable databases; they do not migrate the live database.
2. Configure the auth, database, encryption, mail, and approved research provider settings in `.env.example` through a secret manager. For fresh market discovery, supply `TAVILY_API_KEY` and `GEMINI_API_KEY`; Parallel is an optional budgeted fallback. Without them, Railor must not present fresh web findings as verified capabilities.
3. Configure `CRON_SECRET` and schedule, each with a Bearer token: `POST /api/internal/payments-reconcile` (every minute — without it, open payments only advance while someone has the payment open or through provider webhooks), `POST /api/internal/webhook-deliveries` (every minute), `POST /api/internal/decision-monitor` (frequently enough for your decision-validity requirements) and `POST /api/internal/usage-rollup` (daily). Alert on failures, on payments stuck in `unknown`, and monitor runtime, database and external-provider availability.
4. Install a Connector in the app, then run `pnpm --filter @railor/connector start` on a customer-controlled host with `RAILOR_CLOUD_ORIGIN`, `RAILOR_CONNECTOR_ID`, and `RAILOR_CONNECTOR_TOKEN`. Use HTTPS outside localhost. Set a durable, private `RAILOR_CONNECTOR_JOURNAL` directory; its started markers and receipts are essential to not replaying an ambiguous job. Keep the token out of logs and rotate it by revoking and re-registering the installation.
5. For Connector quotes, also set `RAILOR_VAULT_PATH` and `RAILOR_VAULT_KEY` (32 random bytes encoded as 64 hex characters). The `--seal-vault` mode creates an AES-GCM encrypted vault from JSON provided on stdin and refuses to overwrite an existing vault. Store the key separately. Restrict vault and journal filesystem access on the runtime host. The Connector protocol uses its local vault; do not send those provider credentials to the Railor cloud.
6. Validate each intended provider in its sandbox and then production account: credential permissions, exact quote request and successful response shapes, rate limits, expiry, currency precision, quote/fee semantics, error behavior, and whether the account is eligible for the corridor. Circle, Bridge, and MoonPay have code paths for quotes, but public documentation and fake-key probes cannot establish a successful authenticated response. Other providers may require new adapter code. Disable or exclude unvalidated adapters rather than advertising an executable price.
7. **Before any live payout**, per provider: connect its sandbox in Settings → Connections, register the shown webhook URL (and, for Bridge, paste the webhook public key), and run real sandbox payouts through every method you intend to offer, including a rejection and a timeout/replay. Confirm the adapter's request and status mapping against what the provider actually returned — the Wise, Airwallex, Bridge and Circle payout adapters are marked `docs_verified`, built from public documentation and never exercised against an authenticated account. Wise specifics: its old sandbox host now returns 410 (use `api.wise-sandbox.com`); funding is SCA-protected for many UK/EEA profiles (Railor cancels the transfer and rejects with `wise_sca_required`); corridors whose dynamic transfer requirements add fields (e.g. a purpose for INR) surface Wise's validation message. Airwallex specifics: its FX quote excludes the transfer fee (shown as cost-incomplete), and the default transfer reason `professional_business_services` can be overridden per connection. Only then approve the provider in `/admin/providers` (the page counts completed sandbox payouts as evidence and requires a written note), approve each workspace in `/admin/organizations` with per-payment and daily limits, and set `RAILOR_LIVE_PAYMENTS=enabled`. The kill switch in `/admin/payments` stops all new submissions immediately.
8. Complete operational security and release checks: backups/restore drill, webhook/scheduler alerting, key and `CREDENTIALS_ENCRYPTION_KEY` rotation plan (it encrypts credentials, beneficiary details and webhook secrets), abuse/rate-limit review, independent authorization review, accessibility and cross-browser QA, and staged load tests.

## Local verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `python apps/web/e2e/product_workflows.py` (requires Playwright and Chromium; owns only a disposable PGlite database and a private development server)

The browser flow covers policy creation and activation, enforce-mode decision, self-approval rejection, independent approval, Agent drafting, a test payment that needs approval being approved, sent and settled, connections, the operator console, workflow pages, and mobile overflow. It does not prove external-provider integration or production infrastructure.

## Added in the completion pass

- Team invitations (`/invite/:token`, Settings → Team). Invite links are bound to the invited address. Without `SMTP_URL` the link is shown to the inviter to share manually.
- `feature_interest` table (migration 0017) backing “Notify me” on Coming-soon surfaces; counts appear in the admin console.
- `GET /v1/providers/{id}`, `POST /v1/compare`, `GET /v1/capabilities` plus matching TypeScript SDK (`packages/sdk`), Python SDK and CLI commands. Publish `@railor/sdk` with `pnpm --filter @railor/sdk build` then `npm publish` from `packages/sdk` when ready; the docs currently say “install from source”.
- Public `/status`, `/legal/terms`, `/legal/privacy`. The legal pages describe the product's actual behaviour and must be reviewed by counsel before commercial launch.
- `python apps/web/e2e/product_workflows.py` now also covers the suggested corridor, invites, notify-me, status, legal pages and the 404 page.


## Added in the money-movement pass

- Migration `0018_money_movement`: beneficiaries, payments, payment attempts and events, org payment settings, platform settings, webhook endpoints and deliveries, provider webhook events; provider connections gain an environment (sandbox/production).
- Payments engine in `packages/core/src/payments` (routing scorer, service, Bridge/Circle payout adapters, Railor sandbox rail, outbound webhooks) with tests in `packages/core/src/__tests__/payments.test.ts`.
- App: Payments (list, 3-step composer, detail with timeline), Beneficiaries, Routing (weights, preferences, route tester), Connections (sandbox + production), Developers → Webhooks.
- `/v1/payments`, `/v1/payments/{id}/submit|cancel`, `/v1/beneficiaries`, `/v1/routes`, `/v1/webhook_endpoints`; SDKs and CLI (`payments list|get|submit`, `routes`) mirror them.
- Inbound provider webhooks at `/api/webhooks/providers/{slug}/{connectionId}` (signature-verified, rate-limited, deduplicated).
- Operations console at `/admin` (operators only: `users.is_admin`), every action written to the audit log.

## Added in the provider-access pass

- **Wise and Airwallex** connections (quotes + payouts) alongside Bridge and Circle; `in_bank` (IFSC) beneficiaries via migration `0019`.
- **Price check** (`/app/prices`, `POST /v1/prices`, SDKs, `railor prices`): exact / live public / published / market-estimate rows, ranked by what arrives. Published schedules for PayZoll and Skydo live in `packages/core/src/pricing.ts` with the date they were read — re-check them periodically. Market estimates come from Wise's public comparison feed and are dated consumer prices.
- **PayZoll registry record**: `pnpm --filter @railor/database payzoll` (insert-only; run it against the live database only deliberately, like any seed).
- **Provider logos** at `/api/logos/{slug}`: fetched from each provider's own site through the SSRF guard (`packages/core/src/net-guard.ts`), cached in memory and by the CDN. Set `RAILOR_REMOTE_LOGOS=off` where outbound fetches aren't wanted.

## Added in the discovery, speed and security pass

- **Web discovery** (apps/worker `railor_worker/discovery`, google-genai with Google Search grounding): corridor, provider and unlisted-company research plus named-rail verification. Claims are kept only when their quote is verbatim on a page the worker fetched and actually states the claim; results go to the review queue and `/admin/discovery` (queue runs, approve candidates — audited). Migrations `0020_web_discovery` and `0021_discovery_companies_and_rail_sources`. Schedule `python -m railor_worker.cli discover-queue` every few minutes alongside `crawl`.
- **Speed**: a per-process stale-while-revalidate cache for the provider graph (9 queries), summaries, reference data and platform counts (`RAILOR_READ_CACHE_MS`, default 120s; invalidated by operator approvals). Measured on production builds: most pages 2–5× faster server response.
- **Security**: Next.js upgraded to 15.5.26 (critical image-optimization RCE advisory), image optimization disabled (unused), nodemailer 10, drizzle-orm 0.45.3, postcss/sharp overrides — `pnpm audit --prod` reports no known vulnerabilities. HSTS in production; all scheduler hooks use the constant-time `cronGuard`; provider-credential payloads are bounded; the worker's crawler now refuses private-network redirects.
- `RAILOR_ALLOW_EMBEDDED_DB=true` lets a production build run against a throwaway PGlite directory for local benchmarking/testing; without it production still refuses to start without `DATABASE_URL`.
