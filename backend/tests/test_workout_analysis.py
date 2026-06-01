"""
test_workout_analysis.py — 训练后复盘分析器测试（spec §4.3）

含 5/31 实战回归：椭圆 55min + 力量 53min + 跑步 35min = 1409kcal → 高风险预警。
"""
from app.engine.workout_analysis import (
    assess_overtraining,
    detect_set_recovery,
    intensity_match,
    review_session,
    training_load,
)
from app.engine.hr_zones import zone_distribution


# ── 组间回落检测 ─────────────────────────────────────────────────────────────
class TestSetRecovery:
    def test_adequate_rest_valleys(self):
        # 两次做组（>130）之间回落到 110（≤115，充分）
        hr = [135, 140, 138, 110, 108, 136, 142, 139, 112, 134, 140]
        r = detect_set_recovery(hr)
        assert r["valleys"] >= 2
        assert r["adequate"] == r["valleys"]
        assert r["rest_adequacy_pct"] == 100.0

    def test_insufficient_rest(self):
        # 组间只回落到 125（>115，不足）
        hr = [135, 140, 125, 138, 142, 124, 136, 140]
        r = detect_set_recovery(hr)
        assert r["rest_adequacy_pct"] < 50

    def test_empty_samples(self):
        assert detect_set_recovery([])["valleys"] == 0

    def test_continuous_high_intensity_no_valleys(self):
        # 全程 ≥130，无回落 → 识别不到组间谷值
        r = detect_set_recovery([135, 140, 138, 142, 145])
        assert r["valleys"] == 0
        assert "未识别到" in r["note"]

    def test_partial_rest_adequacy(self):
        # 三次回落，两次达标 → 66.7%，落在「尚可」区间 [50,80)
        hr = [135, 110, 135, 112, 135, 120, 135]
        r = detect_set_recovery(hr)
        assert r["valleys"] == 3
        assert 50 <= r["rest_adequacy_pct"] < 80
        assert "尚可" in r["note"]


# ── 强度匹配 ─────────────────────────────────────────────────────────────────
class TestIntensityMatch:
    def test_red_day_high_intensity_is_mismatch(self):
        dist = zone_distribution([150, 155, 160, 158, 152])  # 全 Z3+
        r = intensity_match("red", dist)
        assert r["assessment"] == "mismatch"

    def test_red_day_low_intensity_matches(self):
        dist = zone_distribution([120, 122, 118, 125])       # 全 Z1
        assert intensity_match("red", dist)["assessment"] == "match"

    def test_green_day_too_easy_is_underload(self):
        dist = zone_distribution([120, 122, 130, 135])       # Z1-Z2
        assert intensity_match("green", dist)["assessment"] == "underload"

    def test_yellow_day_too_hard_is_mismatch(self):
        dist = zone_distribution([155, 160, 158, 162, 165])  # 大量 Z4-Z5
        assert intensity_match("yellow", dist)["assessment"] == "mismatch"

    def test_yellow_day_moderate_matches(self):
        dist = zone_distribution([130, 135, 145, 140])       # Z2-Z3，无高区间
        assert intensity_match("yellow", dist)["assessment"] == "match"


# ── 训练负荷 ─────────────────────────────────────────────────────────────────
class TestTrainingLoad:
    def test_high_load_vs_weekly(self):
        dist = zone_distribution([150, 155, 160])
        r = training_load(1400, dist, weekly_avg_calories=700)
        assert r["level"] == "high"
        assert r["ratio_vs_weekly"] == 2.0

    def test_normal_load(self):
        dist = zone_distribution([135, 140, 145])
        r = training_load(700, dist, weekly_avg_calories=700)  # ratio 1.0
        assert r["level"] == "normal"

    def test_light_load(self):
        dist = zone_distribution([120, 125])
        r = training_load(300, dist, weekly_avg_calories=700)
        assert r["level"] == "light"

    def test_no_weekly_avg(self):
        r = training_load(500, zone_distribution([130]), weekly_avg_calories=None)
        assert r["level"] == "unknown"


# ── 过度训练预警 ─────────────────────────────────────────────────────────────
class TestOvertraining:
    def test_531_three_session_stack_is_high_risk(self):
        sessions = [
            {"workout_type": "椭圆", "calories_kcal": 500},
            {"workout_type": "力量", "calories_kcal": 600},
            {"workout_type": "跑步", "calories_kcal": 309},
        ]
        r = assess_overtraining(sessions, total_calories=1409)
        assert r["risk"] == "high"
        assert "显著下滑" in r["next_day_prediction"]

    def test_high_calorie_single_session_also_high(self):
        r = assess_overtraining([{"workout_type": "力量", "calories_kcal": 1250}], 1250)
        assert r["risk"] == "high"

    def test_moderate_load(self):
        r = assess_overtraining([{"workout_type": "力量", "calories_kcal": 850}], 850)
        assert r["risk"] == "moderate"

    def test_low_load(self):
        r = assess_overtraining([{"workout_type": "力量", "calories_kcal": 400}], 400)
        assert r["risk"] == "low"


# ── 复盘总入口 ───────────────────────────────────────────────────────────────
class TestReviewSession:
    def test_531_full_review(self):
        sessions = [
            {"workout_type": "椭圆", "duration_min": 55, "calories_kcal": 500, "hr_samples": [135, 138, 140]},
            {"workout_type": "力量", "duration_min": 53, "calories_kcal": 600,
             "hr_samples": [140, 145, 110, 142, 148, 112]},
            {"workout_type": "跑步", "duration_min": 35, "calories_kcal": 309, "hr_samples": [155, 160, 158]},
        ]
        r = review_session("green", sessions, weekly_avg_calories=700)
        assert r["total_duration_min"] == 143
        assert r["total_calories"] == 1409
        assert r["overtraining"]["risk"] == "high"
        assert r["set_recovery"] is not None       # 含力量项
        assert abs(sum(r["zone_distribution"].values()) - 100.0) < 0.5

    def test_review_without_strength_has_no_set_recovery(self):
        sessions = [{"workout_type": "跑步", "duration_min": 30, "calories_kcal": 300, "hr_samples": [150, 155]}]
        r = review_session("yellow", sessions)
        assert r["set_recovery"] is None
