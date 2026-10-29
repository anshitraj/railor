from unittest.mock import Mock
from threading import Event
import subprocess

import pytest

from railor_worker.scheduler import run_crawl, run_scheduler


@pytest.mark.parametrize("code, delay", [(0, 21600), (1, 300)])
def test_waits_after_completed_crawl_and_backs_off_on_failure(code, delay):
    stop = Mock(spec=Event)
    stop.is_set.return_value = False
    stop.wait.return_value = True
    crawl = Mock(return_value=code)
    run_scheduler(stop, 21600, 25, crawl)
    crawl.assert_called_once_with(stop, 25)
    stop.wait.assert_called_once_with(delay)


def test_shutdown_does_not_start_a_new_crawl():
    stop = Event()
    stop.set()
    crawl = Mock()
    run_scheduler(stop, 21600, 25, crawl)
    crawl.assert_not_called()


def test_shutdown_terminates_and_reaps_the_child(monkeypatch):
    stop = Event()
    stop.set()
    child = Mock()
    child.poll.side_effect = [None, 0]
    child.wait.return_value = -15
    launch = Mock(return_value=child)
    monkeypatch.setattr(subprocess, "Popen", launch)
    assert run_crawl(stop, 12) == -15
    child.terminate.assert_called_once()
    child.wait.assert_called_once_with(timeout=20)
    assert launch.call_args.args[0][-2:] == ["--limit", "12"]


def test_shutdown_kills_a_child_that_ignores_termination(monkeypatch):
    stop = Event()
    stop.set()
    child = Mock()
    child.poll.side_effect = [None, 0]
    child.wait.side_effect = [subprocess.TimeoutExpired("crawl", 20), -9]
    monkeypatch.setattr(subprocess, "Popen", Mock(return_value=child))
    assert run_crawl(stop, 25) == -9
    child.kill.assert_called_once()


@pytest.mark.parametrize("interval, limit", [(0, 25), (59, 25), (21600, 0)])
def test_invalid_limits_never_launch_a_job(interval, limit):
    crawl = Mock()
    with pytest.raises(ValueError):
        run_scheduler(Event(), interval, limit, crawl)
    crawl.assert_not_called()
