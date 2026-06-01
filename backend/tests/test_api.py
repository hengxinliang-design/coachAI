"""test_api.py — FastAPI 端点冒烟测试。需安装 fastapi/httpx，未安装则跳过。"""
import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_recovery_conservative_grade():
    # 5/25：HRV 69(优秀) + RHR 59(中等) → 取中等
    r = client.post("/recovery", json={"hrv_ms": 69.0, "rhr_bpm": 59, "wrist_temp_dev": 0.1})
    assert r.status_code == 200
    body = r.json()
    assert body["grade"] == "yellow"
    assert 0 <= body["score"] <= 100


def test_recovery_outlier_excluded():
    # 5/31：HRV 154 异常值 → 剔除，按 RHR 评级
    r = client.post("/recovery", json={
        "hrv_ms": 154.0, "rhr_bpm": 58, "wrist_temp_dev": 0.3,
        "recent_hrv": [62.0, 65.0, 60.0, 66.0, 154.0],
    })
    body = r.json()
    assert body["hrv_is_outlier"] is True
    assert body["hrv_subscore"] is None
    assert body["grade"] == "yellow"


def test_workout_plan_green():
    r = client.post("/workout/plan", json={"grade": "green", "split": "push", "equipment": "full"})
    assert r.status_code == 200
    body = r.json()
    assert body["split"] == "push"
    assert len(body["exercises"]) == 7


def test_workout_suggest_split():
    r = client.post("/workout/suggest-split", json={"recent_splits": ["push", "pull"]})
    assert r.status_code == 200
    assert r.json()["suggested"] == "legs"


def test_workout_progression():
    r = client.post("/workout/progression", json={
        "reps_completed": [10, 10, 10], "target_rep_high": 10, "current_weight_kg": 40.0,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["progress"] is True
    assert body["next_weight_kg"] == 42.5


def test_workout_review_overtraining():
    # 5/31：三项叠加 1409kcal → 高风险
    r = client.post("/report/workout-review", json={
        "grade": "green",
        "sessions": [
            {"workout_type": "椭圆", "duration_min": 55, "calories_kcal": 500},
            {"workout_type": "力量", "duration_min": 53, "calories_kcal": 600},
            {"workout_type": "跑步", "duration_min": 35, "calories_kcal": 309},
        ],
        "weekly_avg_calories": 700,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["total_calories"] == 1409
    assert body["overtraining"]["risk"] == "high"
