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


def test_annotation_impact():
    r = client.post("/report/annotation-impact", json={
        "label": "镁甘氨酸", "metric": "max_awake_min", "boundary_date": "2026-05-20",
        "series": [
            {"date": "2026-05-16", "value": 54}, {"date": "2026-05-18", "value": 52},
            {"date": "2026-05-21", "value": 5}, {"date": "2026-05-22", "value": 3},
            {"date": "2026-05-23", "value": 4}, {"date": "2026-05-24", "value": 6},
            {"date": "2026-05-25", "value": 2}, {"date": "2026-05-26", "value": 5},
            {"date": "2026-05-27", "value": 3}, {"date": "2026-05-28", "value": 4},
        ],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["direction"] == "improved"


def test_sleep_report_with_annotation_stack():
    r = client.post("/report/sleep", json={
        "sleep": {
            "total_min": 400, "deep_min": 70, "rem_min": 80,
            "awake_count": 3, "max_awake_min": 62,
            "awake_events": [{"hour": 3, "duration_min": 62}],
        },
        "yesterday_load_level": "high",
        "annotations": [
            {"label": "旅行", "category": "environment"},
            {"label": "项目压力高", "category": "lifestyle"},
        ],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["awakening_pattern"]["cortisol_flag"] is True
    assert body["training_link"]["level"] == "high"
    assert "无法单独归因" in body["annotations"]["note"]


def test_environment_context():
    r = client.post("/report/environment-context", json={
        "altitude_m": 2700, "pressure_hpa": 1008, "pressure_hpa_prev": 1016, "spo2_pct": 93,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["factors"][0]["severity"] == "high"   # 高海拔排最前
    assert "高海拔低氧" in body["auto_annotations"]


def test_environment_context_stable():
    r = client.post("/report/environment-context", json={"altitude_m": 100, "temp_c": 20})
    assert r.status_code == 200
    assert "平稳" in r.json()["summary"]


def test_post_workout_prompt():
    r = client.post("/workout/post-prompt", json={
        "workout_type": "力量训练", "duration_min": 60, "calories_kcal": 500,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["is_strength"] is True
    assert body["questions"][0]["id"] == "split"


def test_log_exercises():
    r = client.post("/workout/log", json={
        "date": "2026-06-02",
        "entries": [{"exercise_name": "杠铃卧推", "weight_kg": 60, "reps_completed": [8, 8, 8]}],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["logged"][0]["split"] == "push"
    assert body["logged"][0]["progression_flag"] is True
    assert body["inferred_split"]["split"] == "push"


def test_render_recovery():
    r = client.post("/render", json={
        "kind": "recovery",
        "data": {"grade": "green", "grade_label": "优秀", "grade_emoji": "🟢", "score": 88,
                 "notes": ["HRV 在基线内。"]},
    })
    assert r.status_code == 200
    body = r.json()
    assert "优秀" in body["template_text"]
    assert body["claude_request"]["system"][0]["cache_control"]["type"] == "ephemeral"


def test_render_unknown_kind_400():
    r = client.post("/render", json={"kind": "bogus", "data": {}})
    assert r.status_code == 400


def test_render_without_claude_request():
    r = client.post("/render", json={
        "kind": "recovery", "data": {"grade": "green", "score": 90, "notes": []},
        "include_claude_request": False,
    })
    assert r.status_code == 200
    assert "claude_request" not in r.json()
