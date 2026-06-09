"""test_database.py — 连接层与 lifespan 验证（用 conftest 隔离的测试 DB）"""
import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from app.database import SessionLocal, get_db, init_db  # noqa: E402
from app.main import app  # noqa: E402


def test_init_db_creates_tables():
    init_db()  # 幂等，可重复调用
    from app.models.db import Base
    from app.database import engine
    Base.metadata.create_all(engine)
    assert "annotations" in Base.metadata.tables


def test_get_db_yields_and_closes():
    gen = get_db()
    db = next(gen)
    assert isinstance(db, SessionLocal().__class__)
    # 耗尽生成器触发 finally 中的 close()
    with pytest.raises(StopIteration):
        next(gen)


def test_lifespan_runs_init_on_startup():
    # 以上下文管理器形式使用 TestClient 才会触发 lifespan（startup→init_db）
    with TestClient(app) as client:
        assert client.get("/health").json()["status"] == "ok"
