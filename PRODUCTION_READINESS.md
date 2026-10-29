# Railor production verification — 29 October 2026

## Deployment scope

The website/API stays on Vercel, PostgreSQL stays on the existing Neon database,
and ingestion has moved to Google Cloud Run Jobs. Render was not deployed.
New beneficiaries and payments remain deliberately unavailable, including direct
UI/API access. Quote comparison, policies, decisions and routing previews remain
available. Official account-specific prices require authorized provider access.

## Verified

- Production JavaScript dependency audit: zero reported advisories after upgrading
  Next.js to 15.5.28, Nodemailer to 10.3.0, Zod to 4.6.7, and source-map-js to 1.2.2.
- Workspace unit/integration tests: 719 passing (SDK 11, core 463, connector 4,
  web 241). Worker tests with the production dependency lock: 55 passing.
- Type checking and the optimized production build pass.
- Two production-build browser harnesses pass 13 scenarios with no page errors
  or horizontal mobile overflow. These cover local TLS email delivery, sign-in,
  onboarding, policy activation, comparison, explicit decisions, access requests,
  routing save/reload, permissions and unavailable payment/recipient entry points.
- Production migration `0025_web_fact_checks` was applied after a private backup.
  No migrations remained afterward. The backup was restored on isolated local
  PostgreSQL and verified to contain 105 providers and 283 source records.
- The GCP worker image was built in Cloud Build and deployed by digest under a
  non-root user with dependencies frozen by `uv.lock`.
- A deployed smoke crawl processed five changed sources, saved private raw
  snapshots, and queued four review events. It did not publish capabilities.
- Cloud Scheduler is enabled every six hours, using an identity scoped to this job.
- Separate build, ingestion and scheduler identities are used. The worker's
  PostgreSQL login cannot update capabilities or read application users.
- Cloud Monitoring policies cover failed jobs and eight hours without completion,
  with email delivery configured for the authorized `webcoinlabs@gmail.com` address.
- Worker robots requests now use the same private-address, redirect, timeout and
  body-size guards as source fetches. Network connections pin the validated IP
  while preserving TLS identity to prevent DNS rebinding. Concurrent jobs share
  a PostgreSQL lock.
- Paid web-verification checks reserve an atomic database allowance shared across
  web instances, and the web runtime retains background work with Next.js `after()`.

## Operational limits and follow-up checks

- Production hosting does not provide provider partnerships, bank account access,
  KYC/KYB approval or missing live quote permissions. Published estimates remain
  labelled and incomplete costs do not rank as complete executable quotes.
- Google-grounded discovery commands are separate from the deterministic ingestion
  job. They are not automatically scheduled by this deployment.
- GCP billing is enabled on the existing credit billing account. Remaining credit,
  expiry and product eligibility have not been verified; budget alerts do not cap spending.
- The existing Vercel `railor-web` project is connected. Production origin settings
  use `https://www.railor.xyz`; cron authentication, shared verification limits
  and the disabled live-payment setting are configured in that project.
- A code audit and passing tests are not a guarantee that every production failure
  is impossible. The deployed web revision, real sign-in delivery, production health
  and scheduled execution state must be checked for each release.
- A local browser run reported one intermittent React hydration mismatch. Two
  subsequent full Agent acceptance runs passed without it; its cause is not yet
  established. The harness now records the affected page path if it recurs.

Deployment and recovery commands are in [GCP_SETUP.md](GCP_SETUP.md). Private logs,
backup files, deployment receipts and browser reports are under gitignored `.railor/`.
