"""
test_persistence.py — DB 持久化层测试（repository + /data 端点）

用内存 SQLite（StaticPool 保证跨请求同一连接）+ 依赖覆盖，隔离每个测试的数据库。
"""
from datetime import date

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app import repository as repo  # noqa: E402
from app.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.db import Base  # noqa: E402


@pytest.fixture
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    yield TestClient(app)
    app.dependency_overrides.clear()


# ── repository 单元 ──────────────────────────────────────────────────────────
class TestHealthMetricRepo:
    def test_upsert_inserts_then_updates(self, db_session):
        repo.upsert_health_metric(db_session, date(2026, 6, 1), hrv_ms=60, rhr_bpm=54)
        repo.upsert_health_metric(db_session, date(2026, 6, 1), hrv_ms=62, rhr_bpm=53)
        rows = repo.list_health_metrics(db_session, date(2026, 6, 1), date(2026, 6, 1))
        assert len(rows) == 1 and rows[0].hrv_ms == 62   # 同日更新而非新增

    def test_recent_hrv_ordered_and_limited(self, db_session):
        for d, v in [(1, 60), (2, 62), (3, 58), (4, 66), (5, 64), (6, 61), (7, 63), (8, 65)]:
            repo.upsert_health_metric(db_session, date(2026, 6, d), hrv_ms=v, rhr_bpm=54)
        hist = repo.recent_hrv(db_session, date(2026, 6, 8), days=7)
        assert len(hist) == 7
        assert hist[0] == 62 and hist[-1] == 65          # 升序，丢掉最早的 6/1

    def test_metric_series(self, db_session):
        repo.upsert_health_metric(db_session, date(2026, 6, 1), hrv_ms=40, rhr_bpm=54)
        repo.upsert_health_metric(db_session, date(2026, 6, 2), hrv_ms=65, rhr_bpm=54)
        series = repo.metric_series(db_session, "hrv_ms", date(2026, 6, 1), date(2026, 6, 2))
        assert [p["value"] for p in series] == [40, 65]

    def test_metric_series_unknown_column(self, db_session):
        assert repo.metric_series(db_session, "nope", date(2026, 6, 1), date(2026, 6, 2)) == []


class TestAnnotationRepo:
    def test_add_list_delete(self, db_session):
        row = repo.add_annotation(db_session, date(2026, 5, 20), "镁甘氨酸", "supplement")
        assert repo.list_annotations(db_session, label="镁甘氨酸")[0].id == row.id
        assert repo.delete_annotation(db_session, row.id) is True
        assert repo.list_annotations(db_session) == []

    def test_delete_missing_returns_false(self, db_session):
        assert repo.delete_annotation(db_session, 999) is False

    def test_list_by_date_range(self, db_session):
        repo.add_annotation(db_session, date(2026, 5, 19), "旧")
        repo.add_annotation(db_session, date(2026, 5, 21), "新")
        rows = repo.list_annotations(db_session, date(2026, 5, 20), date(2026, 5, 22))
        assert [r.label for r in rows] == ["新"]


class TestExerciseRepo:
    def test_add_and_history(self, db_session):
        repo.add_exercise_logs(db_session, date(2026, 6, 1), [
            {"exercise_name": "杠铃卧推", "weight_kg": 60, "sets": 3,
             "reps_completed": [8, 8, 8], "progression_flag": True},
        ])
        hist = repo.exercise_history(db_session, "杠铃卧推")
        assert len(hist) == 1 and hist[0].weight_kg == 60


# ── /data 端点 ───────────────────────────────────────────────────────────────
class TestDataEndpoints:
    def test_health_metric_uses_db_history_for_baseline(self, client):
        # 先灌一周高基线 HRV
        for d in range(1, 8):
            client.post("/data/health-metric", json={"date": f"2026-06-0{d}", "hrv_ms": 66, "rhr_bpm": 53})
        # 第 8 天读数，恢复评分应基于 DB 历史（无需手动传 recent_hrv）
        r = client.post("/data/health-metric", json={"date": "2026-06-08", "hrv_ms": 68, "rhr_bpm": 52})
        assert r.status_code == 200
        body = r.json()
        assert body["recovery"]["grade"] == "green"
        assert body["recovery"]["hrv_baseline"] > 60     # 来自 DB 历史

    def test_health_metric_persisted_and_queryable(self, client):
        client.post("/data/health-metric", json={"date": "2026-06-01", "hrv_ms": 32, "rhr_bpm": 58})
        rows = client.get("/data/health-metrics", params={"frm": "2026-06-01", "to": "2026-06-01"}).json()
        assert rows[0]["recovery_grade"] == "red"        # 评分已回写

    def test_annotation_crud_flow(self, client):
        created = client.post("/data/annotation", json={
            "date": "2026-05-20", "label": "镁甘氨酸", "category": "supplement"}).json()
        listed = client.get("/data/annotations").json()
        assert len(listed) == 1
        assert client.delete(f"/data/annotation/{created['id']}").status_code == 200
        assert client.get("/data/annotations").json() == []

    def test_delete_missing_annotation_404(self, client):
        assert client.delete("/data/annotation/999").status_code == 404

    def test_exercise_log_persists_and_history(self, client):
        client.post("/data/exercise-log", json={
            "date": "2026-06-01",
            "entries": [{"exercise_name": "杠铃卧推", "weight_kg": 60, "reps_completed": [8, 8, 8]}]})
        hist = client.get("/data/exercise-history/杠铃卧推").json()
        assert len(hist) == 1 and hist[0]["progression_flag"] is True

    def test_workout_persist_and_list(self, client):
        client.post("/data/workout", json={
            "date": "2026-05-31", "workout_type": "力量", "duration_min": 53, "calories_kcal": 600})
        rows = client.get("/data/workouts", params={"frm": "2026-05-31", "to": "2026-05-31"}).json()
        assert len(rows) == 1 and rows[0]["workout_type"] == "力量"

    def test_sleep_persist_and_list(self, client):
        client.post("/data/sleep-session", json={
            "date": "2026-05-31", "total_min": 400, "deep_min": 70, "rem_min": 80,
            "awake_count": 3, "max_awake_min": 62})
        rows = client.get("/data/sleep-sessions", params={"frm": "2026-05-31", "to": "2026-05-31"}).json()
        assert len(rows) == 1 and rows[0]["max_awake_min"] == 62
