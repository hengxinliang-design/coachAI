"""test_workout_logging.py — 运动后追问 + 动作分类标注记录测试"""
from app.engine.workout_logging import (
    build_post_workout_prompt,
    classify_exercise,
    infer_split,
    log_exercises,
)


class TestClassifyExercise:
    def test_known_compound(self):
        r = classify_exercise("杠铃卧推")
        assert r["found"] and r["split"] == "push" and r["category"] == "compound"
        assert r["target_rep_high"] == 8

    def test_known_isolation(self):
        r = classify_exercise("侧平举")
        assert r["found"] and r["split"] == "push" and r["category"] == "isolation"

    def test_legs_exercise(self):
        assert classify_exercise("杠铃深蹲")["split"] == "legs"

    def test_substring_match(self):
        # 用户写法略有出入仍可命中
        assert classify_exercise("绳索下压（三头）")["found"] is True

    def test_unknown_exercise(self):
        r = classify_exercise("保加利亚分腿蹲")
        assert r["found"] is False and r["split"] is None


class TestInferSplit:
    def test_all_push(self):
        r = infer_split(["杠铃卧推", "侧平举", "绳索夹胸"])
        assert r["split"] == "push" and r["confidence"] == "high"

    def test_mixed_majority(self):
        r = infer_split(["杠铃深蹲", "腿举", "杠铃卧推"])  # 2 legs + 1 push
        assert r["split"] == "legs" and r["confidence"] == "mixed"

    def test_none_recognized(self):
        assert infer_split(["未知动作A", "未知动作B"])["split"] == "auto"


class TestPostWorkoutPrompt:
    def test_generic_strength_asks_split_first(self):
        p = build_post_workout_prompt({"workout_type": "力量训练", "duration_min": 60, "calories_kcal": 500})
        assert p["is_strength"] is True
        qids = [q["id"] for q in p["questions"]]
        assert qids[0] == "split"          # 通用力量先问部位
        assert "exercises" in qids and "rpe" in qids

    def test_typed_split_prefills_suggestions(self):
        p = build_post_workout_prompt({"workout_type": "pull day", "duration_min": 70, "calories_kcal": 540})
        ex_q = next(q for q in p["questions"] if q["id"] == "exercises")
        assert ex_q["suggested_split"] == "pull"
        assert "杠铃划船" in ex_q["suggestions"]
        assert all(q["id"] != "split" for q in p["questions"])  # 已知部位不再追问

    def test_cardio_no_exercise_question(self):
        p = build_post_workout_prompt({"workout_type": "跑步", "duration_min": 35, "calories_kcal": 309,
                                       "hr_samples": [150, 160, 158]})
        assert p["is_strength"] is False
        assert all(q["id"] != "exercises" for q in p["questions"])
        assert "zone_distribution" in p["auto_captured"]    # 心率自动分区
        assert p["auto_captured"]["hr_peak"] == 160


class TestLogExercises:
    def test_classify_and_progression_flag(self):
        r = log_exercises("2026-06-02", [
            {"exercise_name": "杠铃卧推", "weight_kg": 60, "reps_completed": [8, 8, 8]},
        ])
        row = r["logged"][0]
        assert row["split"] == "push" and row["category"] == "compound"
        assert row["classified"] is True
        assert row["progression_flag"] is True              # 全部达 8 次上限
        assert row["next_weight_kg"] == 62.5
        assert r["inferred_split"]["split"] == "push"

    def test_hold_weight_when_short(self):
        r = log_exercises("2026-06-02", [
            {"exercise_name": "侧平举", "weight_kg": 12, "reps_completed": [15, 13, 12]},
        ])
        assert r["logged"][0]["progression_flag"] is False

    def test_unknown_exercise_logged_without_progression(self):
        r = log_exercises("2026-06-02", [
            {"exercise_name": "保加利亚分腿蹲", "weight_kg": 20, "reps_completed": [10, 10]},
        ])
        row = r["logged"][0]
        assert row["classified"] is False
        assert "不在 CBum 库" in row["progression_suggestion"]

    def test_unknown_with_manual_target_evaluates(self):
        # 库外动作但手动给了次数上限 → 仍能评估渐进
        r = log_exercises("2026-06-02", [
            {"exercise_name": "保加利亚分腿蹲", "weight_kg": 20, "sets": 3,
             "reps_completed": [12, 12, 12], "target_rep_high": 12},
        ])
        assert r["logged"][0]["progression_flag"] is True
