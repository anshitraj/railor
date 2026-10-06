from pathlib import Path

from railor_worker.config import _load_development_env


def test_container_path_without_env_does_not_require_checkout_depth(monkeypatch):
    monkeypatch.setattr(Path, "is_file", lambda _: False)
    _load_development_env(Path(Path.cwd().anchor) / "app" / "railor_worker" / "config.py")


def test_loads_checkout_env_without_overriding_injected_values(tmp_path, monkeypatch):
    monkeypatch.setenv("RAILOR_CONFIG_TEST_EXISTING", "injected")
    monkeypatch.delenv("RAILOR_CONFIG_TEST_LOCAL", raising=False)
    (tmp_path / ".env").write_text("RAILOR_CONFIG_TEST_EXISTING=file\nRAILOR_CONFIG_TEST_LOCAL=loaded\n")
    _load_development_env(tmp_path / "apps" / "worker" / "railor_worker" / "config.py")
    import os
    assert os.environ["RAILOR_CONFIG_TEST_EXISTING"] == "injected"
    assert os.environ["RAILOR_CONFIG_TEST_LOCAL"] == "loaded"
    monkeypatch.delenv("RAILOR_CONFIG_TEST_LOCAL")
