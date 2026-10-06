import pytest

from railor_worker.storage import store_snapshot


@pytest.fixture(autouse=True)
def production_storage(monkeypatch):
    monkeypatch.setenv("RAILOR_ENV", "production")
    monkeypatch.delenv("GCS_SNAPSHOT_BUCKET", raising=False)
    monkeypatch.delenv("RAILWAY_VOLUME_MOUNT_PATH", raising=False)


def test_production_rejects_ephemeral_storage(tmp_path):
    with pytest.raises(RuntimeError, match="mounted Railway volume"):
        store_snapshot("wise", "a" * 64, "source", tmp_path)


def test_production_uses_mounted_volume(tmp_path, monkeypatch):
    monkeypatch.setenv("RAILWAY_VOLUME_MOUNT_PATH", str(tmp_path))
    result = store_snapshot("wise", "a" * 64, "source", tmp_path / "snapshots")
    assert (tmp_path / "snapshots" / "sources" / "wise" / ("a" * 64 + ".html")).read_text() == "source"
    assert result.startswith(str(tmp_path))


def test_production_rejects_storage_outside_volume(tmp_path, monkeypatch):
    volume = tmp_path / "volume"
    volume.mkdir()
    monkeypatch.setenv("RAILWAY_VOLUME_MOUNT_PATH", str(volume))
    with pytest.raises(RuntimeError, match="mounted Railway volume"):
        store_snapshot("wise", "a" * 64, "source", tmp_path / "other")


def test_production_rejects_missing_volume(tmp_path, monkeypatch):
    missing = tmp_path / "missing"
    monkeypatch.setenv("RAILWAY_VOLUME_MOUNT_PATH", str(missing))
    with pytest.raises(RuntimeError, match="mounted Railway volume"):
        store_snapshot("wise", "a" * 64, "source", missing / "snapshots")
