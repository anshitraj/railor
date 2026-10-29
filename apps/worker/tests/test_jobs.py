from contextlib import contextmanager
from threading import Event
from types import SimpleNamespace

import pytest

from railor_worker import jobs, pipeline
from railor_worker.pipeline import SourceOutcome


@pytest.fixture
def job_deps(monkeypatch, tmp_path):
    monkeypatch.setattr(jobs, "get_settings", lambda: SimpleNamespace(snapshot_dir=tmp_path))
    monkeypatch.setattr(jobs, "validate_snapshot_storage", lambda _: None)
    monkeypatch.setattr(jobs, "store_snapshot", lambda *args: "gs://private/check")
    events = []

    @contextmanager
    def lock():
        events.append("acquired")
        try:
            yield True
        finally:
            events.append("released")

    monkeypatch.setattr(jobs, "crawl_lock", lock)
    return events


def test_job_reports_outcomes_and_releases_lock(job_deps, monkeypatch, capsys):
    monkeypatch.setattr(jobs, "run_due", lambda *a, **k: [SourceOutcome("1", "https://example.com", "updated", changes=2)])
    assert jobs.run_job(10, Event()) == 0
    assert job_deps == ["acquired", "released"]
    assert '"changes_queued": 2' in capsys.readouterr().out


def test_overlapping_job_never_fetches_or_writes_storage(job_deps, monkeypatch, capsys):
    @contextmanager
    def locked():
        yield False

    monkeypatch.setattr(jobs, "crawl_lock", locked)
    monkeypatch.setattr(jobs, "run_due", lambda *a, **k: pytest.fail("overlapping crawl"))
    monkeypatch.setattr(jobs, "store_snapshot", lambda *a: pytest.fail("overlapping storage write"))
    assert jobs.run_job(10, Event()) == 0
    assert '"reason": "already_running"' in capsys.readouterr().out


def test_storage_failure_stops_before_sources_are_changed(job_deps, monkeypatch):
    def unavailable(*args):
        raise PermissionError("private storage denied")

    monkeypatch.setattr(jobs, "store_snapshot", unavailable)
    monkeypatch.setattr(jobs, "run_due", lambda *a, **k: pytest.fail("must not crawl"))
    with pytest.raises(PermissionError):
        jobs.run_job(10, Event())
    assert job_deps == ["acquired", "released"]


def test_source_errors_fail_the_cloud_execution(job_deps, monkeypatch):
    monkeypatch.setattr(jobs, "run_due", lambda *a, **k: [SourceOutcome("1", "https://example.com", "error")])
    assert jobs.run_job(10, Event()) == 1


def test_termination_is_a_failed_execution(job_deps, monkeypatch):
    stop = Event()
    stop.set()
    monkeypatch.setattr(jobs, "run_due", lambda *a, **k: [])
    assert jobs.run_job(10, stop) == 1


@pytest.mark.parametrize("limit", [0, -1, 501])
def test_job_limit_is_bounded(limit):
    with pytest.raises(ValueError):
        jobs.run_job(limit, Event())


def test_broken_source_does_not_starve_later_sources(monkeypatch):
    monkeypatch.setattr(pipeline.db, "due_sources", lambda _: [{"id": "1", "url": "https://one.example"}, {"id": "2", "url": "https://two.example"}])

    def process(source):
        if source["id"] == "1":
            raise ValueError("must not leak private exception text")
        return SourceOutcome("2", source["url"], "unchanged")

    monkeypatch.setattr(pipeline, "process_source", process)
    outcomes = pipeline.run_due(2)
    assert [o.status for o in outcomes] == ["error", "unchanged"]
    assert outcomes[0].detail == "pipeline_error: ValueError"


def test_termination_does_not_start_another_source(monkeypatch):
    monkeypatch.setattr(pipeline.db, "due_sources", lambda _: [{"id": "1", "url": "https://one.example"}])
    monkeypatch.setattr(pipeline, "process_source", lambda _: pytest.fail("stopped"))
    assert pipeline.run_due(2, should_stop=lambda: True) == []
