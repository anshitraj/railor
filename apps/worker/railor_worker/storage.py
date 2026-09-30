"""Private source snapshots; use ADC for GCS and local storage for development."""
import os
import re
from pathlib import Path


def store_snapshot(provider_slug: str, content_hash: str, body: str, directory: Path) -> str:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,119}", provider_slug):
        raise ValueError("Invalid provider slug")
    if not re.fullmatch(r"[a-f0-9]{64}", content_hash):
        raise ValueError("Invalid content hash")
    name = f"sources/{provider_slug}/{content_hash}.html"
    bucket_name = os.getenv("GCS_SNAPSHOT_BUCKET", "").strip()
    if bucket_name:
        from google.cloud import storage
        from google.api_core.exceptions import PreconditionFailed
        blob = storage.Client().bucket(bucket_name).blob(name)
        try:
            blob.upload_from_string(body, content_type="text/html; charset=utf-8", if_generation_match=0, timeout=30)
        except PreconditionFailed:
            pass  # Content-addressed object already exists; never overwrite it.
        return f"gs://{bucket_name}/{name}"
    if os.getenv("RAILOR_ENV") == "production":
        raise RuntimeError("GCS_SNAPSHOT_BUCKET is required in production")
    path = directory / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return str(path)
