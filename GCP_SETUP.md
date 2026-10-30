# Railor production deployment

## Architecture

- Vercel serves the existing Next.js website, authentication and `/v1` API.
- The existing PostgreSQL database remains the source of truth.
- `railor-ingestion` runs on Cloud Run Jobs in `us-east5`, near the database in US East (Ohio).
- Cloud Scheduler in `us-east1` invokes the job at `0 */6 * * *` UTC.
- Raw source snapshots are create-only objects in a private Cloud Storage bucket.
- Secret Manager supplies the job with a dedicated, restricted PostgreSQL login.

The GCP project is `gen-lang-client-0617032862`. Existing unrelated resources in
that project are not part of this deployment. No Render service or always-on VM
is needed for Railor ingestion.

## Deploy

Use Python with `psycopg` and `python-dotenv`, the Google Cloud CLI signed into
the correct account, and access to the existing PostgreSQL administration URL.
The worker's installation supplies these Python dependencies.

Inspect the resource plan first:

```powershell
python scripts/deploy-gcp.py --project gen-lang-client-0617032862
```

Build, deploy and run a five-source smoke crawl before enabling the schedule:

```powershell
python scripts/deploy-gcp.py --project gen-lang-client-0617032862 --apply --execute
```

The script uploads only `apps/worker`; `.gcloudignore` excludes environment files,
local storage and virtual environments. Cloud Build uses a separate build identity
and the frozen `uv.lock`. The image runs as an unprivileged user and is deployed
by digest. Docker Desktop is not required on the deployment machine.

The first deployment creates the `railor_ingestion` PostgreSQL login. It can read
the source registry and published capabilities, update crawl state, and insert
snapshots, evidence and review events. It cannot change published capabilities,
read application users or access payment tables. The web app's database credential
is not changed. The new credential is sent directly to Secret Manager through
stdin, never a command argument, log, Git file or chat.

Subsequent deployments reuse the existing enabled secret version. To rotate it,
coordinate a new database credential and Secret Manager version deliberately.
The script will stop rather than silently rotate an existing orphaned login.

If infrastructure setup stops after a successful image build, resume with the
digest saved in `.railor/gcp-build.json`:

```powershell
python scripts/deploy-gcp.py --project gen-lang-client-0617032862 --apply --execute --image <PINNED_RAILOR_IMAGE>
```

`--apply` without `--execute` deploys infrastructure without a smoke crawl or
enabling a new schedule. An existing schedule is paused in this mode.

## Runtime and access

The default job has one task, parallelism one, one CPU, 512 MiB memory, a 45-minute
timeout and one retry. A transaction-scoped PostgreSQL advisory lock prevents
separate executions from crawling concurrently, including scheduler duplicates.
Source errors do not starve later sources, and failed/interrupted executions exit
nonzero. A durable storage readiness write runs before source state is changed.

Only the ingestion service account can read its database secret. Its storage
roles apply only to the Railor snapshot bucket. The scheduler can invoke only
the Railor job. The build identity can write only the Railor image repository,
read only the Railor build-source bucket, and write build logs. No service-account
key file is created. Buckets enforce uniform access and public-access prevention.

The job does not publish provider capabilities or enable payments. Its output is
reviewed in `/admin/review`. Google Search/Gemini discovery commands are separate
from this deterministic crawler and are not scheduled by this deployment.

## Verify

```powershell
gcloud run jobs describe railor-ingestion --region=us-east5 --project=gen-lang-client-0617032862
gcloud scheduler jobs describe railor-ingestion --location=us-east1 --project=gen-lang-client-0617032862
gcloud run jobs executions list --job=railor-ingestion --region=us-east5 --project=gen-lang-client-0617032862
gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="railor-ingestion" AND jsonPayload.event="crawl_completed"' --project=gen-lang-client-0617032862 --limit=5
```

Look for a completed execution, source counts in `crawl_completed`, private raw
objects under `sources/`, and linked database snapshots/review events. A passed
container startup alone is not evidence of a successful crawl.

Local verification:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
uv run --project apps/worker --frozen --extra dev --extra gcs --extra discovery --extra crawl python -m pytest apps/worker/tests -q
```

Browser acceptance after the build:

```powershell
python apps/web/e2e/agent_acceptance.py
python apps/web/e2e/production_release.py
```

Both harnesses isolate their database and local server. The Agent harness uses a
local TLS SMTP inbox and does not send external messages. To reuse a verified
build, pass `--no-build` and set `RAILOR_E2E_DIST_DIR` to its output directory.

Use a disposable database for browser tests and build checks. Production databases
are never seeded or migrated as a side effect of starting the worker or web app.
Before a production migration, back up the database, inspect `pnpm db:migrate --
--dry-run`, then explicitly apply with `--confirm-remote` and verify no migrations
remain. Backups belong outside Git in `.railor/production-backups/` or managed,
private backup storage.

## Monitoring

Failure alerts are authorized for `webcoinlabs@gmail.com`:

```powershell
python scripts/monitor-gcp.py --project gen-lang-client-0617032862 --email webcoinlabs@gmail.com
```

Two policies monitor failed executions and the absence of completed executions
for eight hours. They affect only `railor-ingestion`. If the channel reports
`UNVERIFIED`, complete Google's email verification before relying on delivery.

Cloud Run, Scheduler, Storage, Artifact Registry, builds and logs can incur costs.
Billing is enabled on the existing credit billing account; this does not verify
the remaining promotional balance, expiry or credit eligibility. Set budget
alerts and review billing regularly. A budget alert does not stop resource usage.

## Web deployment checks

Set Vercel Production `DATABASE_URL`, `APP_ORIGIN` (the canonical HTTPS origin),
`AUTH_EMAIL_TRANSPORT=smtp`, `AUTH_FROM`, SMTP/Resend credentials, Google OAuth
credentials, `CREDENTIALS_ENCRYPTION_KEY`, and `CRON_SECRET` as appropriate.
The ingestion-only GCP container receives none of the web/OAuth/provider secrets.

Check `/api/health/live`, authenticated `/api/health/ready`, `/status`, sign-in
delivery, Google OAuth redirect URLs, and the daily Vercel cron hooks after a web
release. New payments and beneficiaries are deliberately paused. Official live
provider quotes require the appropriate authorized production provider access;
published fees and reference rates retain their labels.

Google-grounded price checks use Next.js `after()` to retain background work and
an atomic PostgreSQL UTC-day budget shared across instances. The cap defaults to
200 checks/day, and API/billing/quota errors pause work. Verification failures
never become supported claims or expose provider diagnostics in the product.

Attach both `railor.xyz` and `www.railor.xyz` to the production project without a
project-wide cross-host redirect. Middleware redirects web pages and OAuth starts
to `APP_ORIGIN`, while `/v1` and other API endpoints stay on the caller's host.
A blanket apex-to-www redirect causes fetch clients to drop `Authorization` and
makes valid API keys appear missing. Verify both API hosts with an invalid audit
key: each should return `invalid_api_key`, not `missing_api_key`.

## Pause and rollback

Pause recurring ingestion without deleting data:

```powershell
gcloud scheduler jobs pause railor-ingestion --location=us-east1 --project=gen-lang-client-0617032862
```

For an image rollback, update the Cloud Run Job to a previously verified digest
from Artifact Registry, keep the matching secret version, run a bounded smoke
crawl, and resume the schedule. Do not restore or reset the production database
to roll back a worker image. Never restore the deleted Railway volume by
inventing raw source snapshots; historical files require an actual surviving backup.
