# Production deployment

The Next.js website, authentication, server actions and API routes run on Vercel.
The Python source-ingestion worker runs separately on Railway and connects to the
same Neon PostgreSQL database. Railway does not host a duplicate Next.js API.

## Railway worker

- GitHub repository: `anshitraj/railor`, branch `main`.
- Service root: `/apps/worker`.
- Infrastructure configuration: `apps/worker/.railway/railway.ts`.
- Build: the worker's `Dockerfile` (Python 3.12, crawl and discovery dependencies).
- Start: `python -m railor_worker.cli crawl`.
- Schedule: every six hours, at 00:00, 06:00, 12:00 and 18:00 UTC.
- Attach a private persistent volume at `/data` for source snapshots.
- Set `SNAPSHOT_DIR=/data/snapshots`, `RAILOR_ENV=production`, and
  `RAILOR_CONCURRENCY=2`.
- Set `DATABASE_URL` using the existing Neon connection string. Gemini discovery
  additionally needs `GEMINI_API_KEY`; keep both in Railway variables.

From `apps/worker`, use `railway config plan` to review infrastructure changes
and `railway config apply --yes` to apply them. The configuration preserves
secret values already set in Railway; it does not contain credentials.

Railway supplies `RAILWAY_VOLUME_MOUNT_PATH`. Production snapshot writes require
either GCS or a directory inside that mounted volume, so redeploys cannot silently
lose source files. Enable volume backups in Railway if retaining raw source
snapshots is required beyond the lifetime of the volume.

This is a scheduled job, with no public HTTP endpoint. A successful execution
exits; inspect execution logs and the next scheduled run rather than expecting
an always-running web server. Crawl results propose changes for admin review.
They do not automatically publish provider capabilities.

The crawl schedule does not process Gemini discovery jobs. To process queued
research, run `python -m railor_worker.cli discover-queue` as a separately
configured scheduled job with the same database and durable snapshot setup.

## Database and Vercel

Check database migrations from the repository root:

```sh
pnpm db:migrate -- --dry-run
```

For pending migrations, back up the target database first, then deliberately run
`pnpm db:migrate -- --confirm-remote`. Do not run the demo seed on production.
Vercel needs the same database connection, its canonical HTTPS origin, SMTP
settings and authentication/encryption secrets from `.env.example`.

The authenticated `/api/health/ready` endpoint checks production configuration,
database connectivity and migrations. Call it with the existing `CRON_SECRET`
as a bearer token; a running Railway crawler does not establish Vercel readiness.
