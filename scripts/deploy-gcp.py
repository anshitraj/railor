"""Deploy Railor ingestion with keyless service identities and private storage.

Default is a local plan. --apply provisions and builds; --execute runs a smoke
crawl before the schedule is enabled. Secrets are passed through stdin only.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
from urllib.parse import quote, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
REDACTIONS: list[str] = []


def clean(value: str) -> str:
    for secret in REDACTIONS:
        value = value.replace(secret, "[REDACTED]")
    return value


def gc(*args: str, optional: bool = False, stdin: str | None = None):
    executable = shutil.which("gcloud.cmd") or shutil.which("gcloud")
    if not executable:
        raise RuntimeError("Install the Google Cloud CLI and sign in first")
    result = subprocess.run(
        [executable, *args, "--project", PROJECT, "--quiet", "--format=json"],
        input=stdin, text=True, capture_output=True, encoding="utf-8", errors="replace",
    )
    if result.returncode:
        if optional and any(term in result.stderr.lower() for term in ("not_found", "not found", "cannot find", "does not exist", "404")):
            return None
        raise RuntimeError(clean(result.stderr[-3500:]))
    return json.loads(result.stdout) if result.stdout.strip() else {}


def ensure_account(name: str, display: str) -> str:
    email = f"{name}@{PROJECT}.iam.gserviceaccount.com"
    if gc("iam", "service-accounts", "describe", email, optional=True) is None:
        gc("iam", "service-accounts", "create", name, "--display-name", display)
    return email


def ensure_bucket(name: str, location: str):
    uri = f"gs://{name}"
    if gc("storage", "buckets", "describe", uri, optional=True) is None:
        gc("storage", "buckets", "create", uri, "--location", location,
           "--uniform-bucket-level-access", "--public-access-prevention")
    policy = gc("storage", "buckets", "get-iam-policy", uri)
    if any(m in ("allUsers", "allAuthenticatedUsers") for b in policy.get("bindings", []) for m in b.get("members", [])):
        raise RuntimeError(f"Bucket {name} has public bindings; deployment stopped")


def bucket_role(bucket: str, account: str, role: str):
    gc("storage", "buckets", "add-iam-policy-binding", f"gs://{bucket}",
       "--member", f"serviceAccount:{account}", "--role", role)


def provision_database_url(env_file: Path) -> str:
    """Create a separate limited login; never alter the web app's database login."""
    import psycopg
    from psycopg import sql
    from dotenv import dotenv_values

    original = os.getenv("DATABASE_URL", "").strip() or (dotenv_values(env_file).get("DATABASE_URL") or "").strip()
    if not original:
        raise RuntimeError("DATABASE_URL is missing from the environment and the supplied env file")
    REDACTIONS.append(original)
    role = "railor_ingestion"
    password = secrets.token_urlsafe(48)
    REDACTIONS.append(password)
    with psycopg.connect(original, connect_timeout=15) as conn:
        if conn.execute("select 1 from pg_roles where rolname = %s", (role,)).fetchone():
            raise RuntimeError("railor_ingestion login already exists but no worker secret exists; recover its existing credential rather than rotating it implicitly")
        conn.execute(sql.SQL("create role {} login password {} nosuperuser nocreatedb nocreaterole noinherit").format(sql.Identifier(role), sql.Literal(password)))
        database = conn.execute("select current_database()").fetchone()[0]
        conn.execute(sql.SQL("grant connect on database {} to {}").format(sql.Identifier(database), sql.Identifier(role)))
        conn.execute(sql.SQL("grant usage on schema public to {}").format(sql.Identifier(role)))
        conn.execute(sql.SQL("grant select on public.providers, public.provider_capabilities, public.source_documents to {}").format(sql.Identifier(role)))
        conn.execute(sql.SQL("grant select, insert on public.source_snapshots, public.evidence, public.change_events to {}").format(sql.Identifier(role)))
        conn.execute(sql.SQL("grant update (last_checked_at, next_check_at, content_hash, etag, last_modified, failure_count, last_error) on public.source_documents to {}").format(sql.Identifier(role)))
        parts = urlsplit(original)
        old_username = parts.username or ""
        username = role + ("." + old_username.split(".", 1)[1] if ".pooler.supabase.com" in (parts.hostname or "") and "." in old_username else "")
        host = parts.hostname or ""
        if ":" in host:
            host = f"[{host}]"
        netloc = f"{quote(username, safe='')}:{quote(password, safe='')}@{host}" + (f":{parts.port}" if parts.port else "")
        worker_url = urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
        REDACTIONS.append(worker_url)
        # Authentication sees the new role after this transaction commits.
    with psycopg.connect(worker_url, connect_timeout=15) as check:
        allowed = check.execute("select has_table_privilege(current_user, 'public.source_snapshots', 'INSERT'), has_table_privilege(current_user, 'public.provider_capabilities', 'UPDATE'), has_table_privilege(current_user, 'public.users', 'SELECT')").fetchone()
        if allowed != (True, False, False):
            raise RuntimeError("Worker database permission checks failed")
    return worker_url


def deploy(args):
    print(f"Deploying Railor ingestion to {PROJECT}/{args.region}", flush=True)
    billing = gc("billing", "projects", "describe", PROJECT)
    if not billing.get("billingEnabled"):
        raise RuntimeError("GCP billing is not enabled on this project")
    gc("services", "enable", "run.googleapis.com", "cloudscheduler.googleapis.com",
       "artifactregistry.googleapis.com", "cloudbuild.googleapis.com", "secretmanager.googleapis.com",
       "storage.googleapis.com", "monitoring.googleapis.com")
    worker = ensure_account("railor-ingestion", "Railor ingestion only")
    scheduler = ensure_account("railor-scheduler", "Invoke Railor ingestion only")
    builder = ensure_account("railor-build", "Build Railor worker images only")
    snapshots = f"{PROJECT}-railor-snapshots"
    build_sources = f"{PROJECT}-railor-builds"
    ensure_bucket(snapshots, args.region)
    ensure_bucket(build_sources, args.build_region)
    bucket_role(snapshots, worker, "roles/storage.objectCreator")
    bucket_role(snapshots, worker, "roles/storage.objectViewer")
    bucket_role(build_sources, builder, "roles/storage.objectViewer")
    if gc("artifacts", "repositories", "describe", "railor", "--location", args.region, optional=True) is None:
        gc("artifacts", "repositories", "create", "railor", "--location", args.region,
           "--repository-format=docker", "--description=Railor production worker images")
    gc("artifacts", "repositories", "add-iam-policy-binding", "railor", "--location", args.region,
       "--member", f"serviceAccount:{builder}", "--role", "roles/artifactregistry.writer")
    gc("projects", "add-iam-policy-binding", PROJECT, "--member", f"serviceAccount:{builder}",
       "--role", "roles/logging.logWriter", "--condition=None")
    secret = "railor-worker-database-url"
    if gc("secrets", "describe", secret, optional=True) is None:
        gc("secrets", "create", secret, "--replication-policy=automatic")
    versions = gc("secrets", "versions", "list", secret, "--filter=state:ENABLED", "--sort-by=~createTime", "--limit=1")
    if not versions:
        print("Provisioning a restricted worker database login", flush=True)
        worker_url = provision_database_url(args.database_env_file)
        version = gc("secrets", "versions", "add", secret, "--data-file=-", stdin=worker_url)
        version_number = version["name"].rsplit("/", 1)[-1]
    else:
        version_number = versions[0]["name"].rsplit("/", 1)[-1]
    gc("secrets", "add-iam-policy-binding", secret, "--member", f"serviceAccount:{worker}",
       "--role", "roles/secretmanager.secretAccessor")
    if args.image:
        pinned = args.image
        build = {"id": "reused-pinned-image"}
    else:
        tag = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
        image = f"{args.region}-docker.pkg.dev/{PROJECT}/railor/ingestion:{tag}"
        print("Building the locked, non-root worker image in Cloud Build", flush=True)
        build = gc("builds", "submit", str(ROOT / "apps/worker"), "--config", str(ROOT / "deploy/gcp/cloudbuild.yaml"),
                   "--substitutions", f"_IMAGE={image}", "--region", args.build_region,
                   "--service-account", f"projects/{PROJECT}/serviceAccounts/{builder}",
                   "--gcs-source-staging-dir", f"gs://{build_sources}/source")
        if build.get("status") != "SUCCESS":
            raise RuntimeError("Cloud Build did not succeed")
        digest = build["results"]["images"][0]["digest"]
        pinned = image.rsplit(":", 1)[0] + "@" + digest
        build_report = ROOT / ".railor/gcp-build.json"
        build_report.parent.mkdir(exist_ok=True)
        build_report.write_text(json.dumps({"build_id": build["id"], "image": pinned}, indent=2) + "\n", encoding="utf-8")
    job_exists = gc("run", "jobs", "describe", "railor-ingestion", "--region", args.region, optional=True) is not None
    gc("run", "jobs", "update" if job_exists else "create", "railor-ingestion", "--region", args.region,
       "--image", pinned, "--service-account", worker,
       "--tasks=1", "--parallelism=1", "--cpu=1", "--memory=512Mi", "--task-timeout=2700s", "--max-retries=1",
       "--command=python", "--args=-m,railor_worker.jobs,--limit,100",
       "--set-env-vars", f"RAILOR_ENV=production,GCS_SNAPSHOT_BUCKET={snapshots},GOOGLE_CLOUD_PROJECT={PROJECT},RAILOR_TIMEOUT=15",
       "--set-secrets", f"DATABASE_URL={secret}:{version_number}")
    gc("run", "jobs", "add-iam-policy-binding", "railor-ingestion", "--region", args.region,
       "--member", f"serviceAccount:{scheduler}", "--role", "roles/run.invoker")
    if args.execute:
        print("Running the deployed worker smoke crawl (five due sources)", flush=True)
        gc("run", "jobs", "execute", "railor-ingestion", "--region", args.region,
           "--args=-m,railor_worker.jobs,--limit,5", "--wait")
    scheduler_exists = gc("scheduler", "jobs", "describe", "railor-ingestion", "--location", args.scheduler_region, optional=True) is not None
    if args.execute:
        gc("scheduler", "jobs", "update" if scheduler_exists else "create", "http", "railor-ingestion",
           "--location", args.scheduler_region, "--schedule=0 */6 * * *", "--time-zone=UTC",
           "--uri", f"https://run.googleapis.com/v2/projects/{PROJECT}/locations/{args.region}/jobs/railor-ingestion:run",
           "--http-method=POST", "--oauth-service-account-email", scheduler,
           "--update-headers=Content-Type=application/json" if scheduler_exists else "--headers=Content-Type=application/json",
           "--message-body={}", "--attempt-deadline=60s", "--max-retry-attempts=0")
        if scheduler_exists:
            gc("scheduler", "jobs", "resume", "railor-ingestion", "--location", args.scheduler_region)
    elif scheduler_exists:
        gc("scheduler", "jobs", "pause", "railor-ingestion", "--location", args.scheduler_region)
    report = {"project": PROJECT, "region": args.region, "job": "railor-ingestion", "image": pinned,
              "snapshot_bucket": snapshots, "database_secret_version": version_number,
              "build_id": build["id"], "schedule": "0 */6 * * * UTC", "schedule_enabled": args.execute}
    report_path = ROOT / ".railor/gcp-deployment.json"
    report_path.parent.mkdir(exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


def main():
    global PROJECT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--region", default="us-east5")
    parser.add_argument("--build-region", default="us-east1")
    parser.add_argument("--scheduler-region", default="us-east1")
    parser.add_argument("--database-env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--image", help="Reuse an already built Railor image pinned by sha256 digest")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", args.project):
        parser.error("Supply a valid GCP project ID")
    if any(not re.fullmatch(r"[a-z]+-[a-z]+\d", region) for region in (args.region, args.build_region, args.scheduler_region)):
        parser.error("Supply valid GCP regions")
    PROJECT = args.project
    if args.image and not re.fullmatch(re.escape(f"{args.region}-docker.pkg.dev/{PROJECT}/railor/ingestion@sha256:") + r"[a-f0-9]{64}", args.image):
        parser.error("--image must be a sha256-pinned image from this project's Railor repository")
    if not args.apply:
        print(json.dumps({"project": PROJECT, "job_region": args.region, "build_region": args.build_region,
                          "scheduler_region": args.scheduler_region, "compute": "1 CPU / 512 MiB only during executions",
                          "source_limit": 100, "task_timeout_seconds": 2700, "task_retries": 1,
                          "schedule": "0 */6 * * * UTC", "storage": "private GCS",
                          "database": "existing PostgreSQL with a separate restricted login",
                          "service_accounts": ["railor-ingestion", "railor-scheduler", "railor-build"],
                          "mutations": False}, indent=2))
        return 0
    try:
        deploy(args)
        return 0
    except Exception as exc:
        # Database driver diagnostics may include credentials; never emit them.
        message = clean(str(exc)) if isinstance(exc, RuntimeError) else type(exc).__name__
        print(f"Deployment stopped: {message}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
