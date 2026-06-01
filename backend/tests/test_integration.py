"""
test_integration.py — 跨模块逻辑联调

验证四大引擎能协同构成完整闭环，并复现 spec 的两条实战叙事：
  · 5/25 旅行回归日：HRV 优秀 + RHR 中等 → 保守评级 → 计划降强度
  · 5/31 → 6/1：单日三项叠加高负荷 → 预警次日 HRV 下滑 → 次日红灯
"""
from datetime import date

from app.engine.cbum import generate_plan
from app.engine.recovery import compute_recovery
from app.engine.rotation import suggest_split
from app.engine.sleep_analysis import build_sleep_report
from app.engine.workout_analysis import review_session


class TestDailyClosedLoop:
    """晨间恢复 → 部位建议 → 训练计划 → 训练后复盘 → 睡眠报告，一天闭环。"""

    def test_green_day_full_flow(self):
        # 1) 晨间恢复评分
        rec = compute_recovery(hrv_ms=68.0, rhr_bpm=52, wrist_temp_dev=0.0,
                               recent_hrv=[64, 66, 67, 65, 68])
        assert rec.grade == "green"

        # 2) 部位轮换建议（上次练 push、pull）
        split = suggest_split(["push", "pull"])["suggested"]
        assert split == "legs"

        # 3) 训练计划（评级驱动强度）
        plan = generate_plan(rec.grade, split, "full")
        assert plan["split"] == "legs"
        assert any(e["has_drop_set"] for e in plan["exercises"])  # 优秀日有递减组

        # 4) 训练后复盘
        review = review_session(rec.grade, sessions=[
            {"workout_type": "力量", "duration_min": 70, "calories_kcal": 520,
             "hr_samples": [140, 110, 145, 112, 148]},
        ], weekly_avg_calories=600)
        assert review["overtraining"]["risk"] == "low"
        assert review["set_recovery"] is not None

        # 5) 睡眠报告
        sleep = build_sleep_report({"total_min": 460, "deep_min": 95, "rem_min": 92,
                                    "awake_count": 1, "max_awake_min": 6},
                                   yesterday_load_level=review["training_load"]["level"])
        assert sleep["continuity"]["label"] == "优秀"


class TestTravelReturnConservative:
    """5/25：HRV 优秀但 RHR 中等 → 保守取中等 → 计划应为中等强度（无递减组）。"""

    def test_conservative_grade_drives_moderate_plan(self):
        rec = compute_recovery(hrv_ms=69.0, rhr_bpm=59, wrist_temp_dev=0.1)
        assert rec.grade == "yellow"
        plan = generate_plan(rec.grade, "push", "full")
        assert plan["intensity_notes"] == []                      # 中等日不加高强度手段
        assert all(not e["has_drop_set"] for e in plan["exercises"])


class TestOvertrainingToNextDayDecline:
    """5/31 三项叠加 → 复盘预警；6/1 次日红灯 → 计划转主动恢复。"""

    def test_531_review_predicts_decline_and_61_is_red(self):
        # 5/31：椭圆 + 力量 + 跑步 = 1409 kcal
        review = review_session("green", sessions=[
            {"workout_type": "椭圆", "duration_min": 55, "calories_kcal": 500},
            {"workout_type": "力量", "duration_min": 53, "calories_kcal": 600},
            {"workout_type": "跑步", "duration_min": 35, "calories_kcal": 309},
        ], weekly_avg_calories=700)
        assert review["overtraining"]["risk"] == "high"
        assert "下滑" in review["overtraining"]["next_day_prediction"]

        # 6/1：次日晨间 HRV 跌到 32ms（预警兑现）
        rec = compute_recovery(hrv_ms=32.0, rhr_bpm=58, wrist_temp_dev=0.2,
                               recent_hrv=[66, 64, 62, 32])
        assert rec.grade == "red"

        # 红灯日训练计划应转为主动恢复
        plan = generate_plan(rec.grade, "push", "full")
        assert plan["split"] == "cardio"
        assert "Z1" in plan["zone_target"]


class TestOutlierDayStillProducesPlan:
    """5/31 当日 HRV 154 异常值：评级仍可产出（按 RHR），不应崩溃。"""

    def test_outlier_day_grades_and_plans(self):
        rec = compute_recovery(hrv_ms=154.0, rhr_bpm=56, wrist_temp_dev=0.2,
                               recent_hrv=[62, 65, 60, 154])
        assert rec.hrv_is_outlier is True
        assert rec.grade in {"green", "yellow", "red"}
        plan = generate_plan(rec.grade, "auto", "full")
        assert plan["split"] in {"push", "cardio"}
