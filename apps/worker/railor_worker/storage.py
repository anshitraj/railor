"""Private source snapshots in GCS, a persistent disk, or development storage."""
import os
import re
from pathlib import Path


def validate_snapshot_storage(directory: Path) -> None:
    """Fail before crawling if production snapshots would be ephemeral."""
    if os.getenv("RAILOR_ENV") != "production" or os.getenv("GCS_SNAPSHOT_BUCKET", "").strip():
        return
    mount = (os.getenv("SNAPSHOT_VOLUME_MOUNT_PATH", "").strip()
             or os.getenv("RAILWAY_VOLUME_MOUNT_PATH", "").strip())
    if (not mount or not Path(mount).is_absolute() or not Path(mount).is_dir()
            or not directory.resolve().is_relative_to(Path(mount).resolve())):
        raise RuntimeError(
            "Production snapshots require GCS_SNAPSHOT_BUCKET or storage inside a mounted persistent disk"
        )


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
    validate_snapshot_storage(directory)
    path = directory / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return str(path)
