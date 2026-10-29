from unittest.mock import Mock

import pytest

pytest.importorskip("google.cloud.storage")
from google.api_core.exceptions import Forbidden, PreconditionFailed
from google.cloud import storage

from railor_worker.storage import store_snapshot


def test_cloud_snapshots_are_private_content_addressed_and_create_only(monkeypatch, tmp_path):
    monkeypatch.setenv("RAILOR_ENV", "production")
    monkeypatch.setenv("GCS_SNAPSHOT_BUCKET", "private-railor-snapshots")
    client = Mock()
    monkeypatch.setattr(storage, "Client", lambda: client)
    result = store_snapshot("wise", "a" * 64, "source text", tmp_path)
    client.bucket.assert_called_once_with("private-railor-snapshots")
    client.bucket.return_value.blob.assert_called_once_with("sources/wise/" + "a" * 64 + ".html")
    client.bucket.return_value.blob.return_value.upload_from_string.assert_called_once_with(
        "source text", content_type="text/html; charset=utf-8", if_generation_match=0, timeout=30,
    )
    assert result == "gs://private-railor-snapshots/sources/wise/" + "a" * 64 + ".html"
    assert not list(tmp_path.iterdir())


def test_duplicate_cloud_object_does_not_overwrite_or_fall_back_to_disk(monkeypatch, tmp_path):
    monkeypatch.setenv("GCS_SNAPSHOT_BUCKET", "private-railor-snapshots")
    client = Mock()
    client.bucket.return_value.blob.return_value.upload_from_string.side_effect = PreconditionFailed("already exists")
    monkeypatch.setattr(storage, "Client", lambda: client)
    assert store_snapshot("wise", "a" * 64, "source", tmp_path).startswith("gs://")
    assert not list(tmp_path.iterdir())


def test_cloud_permission_error_is_not_hidden_by_ephemeral_storage(monkeypatch, tmp_path):
    monkeypatch.setenv("GCS_SNAPSHOT_BUCKET", "private-railor-snapshots")
    client = Mock()
    client.bucket.return_value.blob.return_value.upload_from_string.side_effect = Forbidden("denied")
    monkeypatch.setattr(storage, "Client", lambda: client)
    with pytest.raises(Forbidden):
        store_snapshot("wise", "a" * 64, "source", tmp_path)
    assert not list(tmp_path.iterdir())
