"""Test bootstrap: put backend root on sys.path and isolate the dev DB.

Set DATABASE_URL to a throwaway file before app modules import it, so tests never
touch the real coachai.db. The file is removed at session end.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

_TEST_DB = os.path.join(os.path.dirname(__file__), "test_coachai.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB}")


def pytest_sessionfinish(session, exitstatus):
    for suffix in ("", "-wal", "-shm"):
        path = _TEST_DB + suffix
        if os.path.exists(path):
            os.remove(path)
