"""
workout_logging.py — 运动后追问 + 动作分类标注记录（产品方向：传感器优先，只问绕不开的）

闭环：HealthKit 自动识别训练完成（类型/时长/热量/心率）→ 本模块生成「快速结构化追问」
（只问机器测不到的：部位、动作、重量×次数、RPE）→ 用户回答后分类标注、写入 exercise_log，
并复用双重渐进引擎给出加重建议。

纯函数，可独立测试。
"""
from __future__ import annotations

from collections import Counter

from app.engine.cbum import EXERCISES, SPLIT_LABEL
from app.engine.hr_zones import zone_distribution
from app.engine.progression import check_progression
from app.engine.workout_analysis import is_strength

STRENGTH_SPLITS = ["push", "pull", "legs"]

# HealthKit 训练类型字符串 → CBum 部位（通常只给"力量训练"，无法区分推/拉/腿）
_TYPE_TO_SPLIT = {"push": "push", "推": "push", "pull": "pull", "拉": "pull",
                  "legs": "legs", "腿": "legs", "腿部": "legs"}


def classify_exercise(name: str) -> dict:
    """把一个动作名归类到 CBum 库：部位 / 复合或孤立 / 目标肌群 / 次数上限。库外动作标 found=False。"""
    norm = (name or "").strip()
    for split, groups in EXERCISES.items():
        for category in ("compound", "isolation"):
            for e in groups[category]:
                if e["name"] == norm or e["name"] in norm or (norm and norm in e["name"]):
                    return {"found": True, "exercise": e["name"], "split": split,
                            "category": category, "muscle": e["muscle"],
                            "target_rep_high": e["reps"][1]}
    return {"found": False, "exercise": norm, "split": None,
            "category": None, "muscle": None, "target_rep_high": None}


def infer_split(exercise_names: list[str]) -> dict:
    """从一组动作推断本次训练部位（多数表决，仅看力量部位）。"""
    splits = [classify_exercise(n)["split"] for n in exercise_names]
    found = [s for s in splits if s in STRENGTH_SPLITS]
    if not found:
        return {"split": "auto", "confidence": "low", "note": "未能从动作识别部位。"}
    top, cnt = Counter(found).most_common(1)[0]
    confidence = "high" if cnt == len(found) else "mixed"
    note = (f"动作均属「{SPLIT_LABEL[top]}」。" if confidence == "high"
            else f"动作以「{SPLIT_LABEL[top]}」为主，含其他部位，请确认。")
    return {"split": top, "confidence": confidence, "note": note}


def _split_from_type(workout_type: str) -> str:
    t = (workout_type or "").lower()
    for key, split in _TYPE_TO_SPLIT.items():
        if key in t:
            return split
    return "auto"  # 通用"力量训练"无法区分部位，需用户先选


def build_post_workout_prompt(session: dict) -> dict:
    """
    根据 HealthKit 自动识别的训练，生成运动后快速追问。
    只问机器测不到的内容；自动采集字段以 auto_captured 回显。
    """
    wtype = session.get("workout_type", "")
    strength = is_strength(wtype)

    auto = {"workout_type": wtype,
            "duration_min": session.get("duration_min"),
            "calories_kcal": session.get("calories_kcal")}
    samples = session.get("hr_samples") or []
    if samples:
        auto["hr_peak"] = max(samples)
        auto["zone_distribution"] = zone_distribution(samples)

    questions: list[dict] = []
    if strength:
        split = _split_from_type(wtype)
        if split == "auto":
            questions.append({"id": "split", "type": "choice", "label": "今天练的是哪个部位？",
                              "options": STRENGTH_SPLITS})
            suggestions: list[str] = []
        else:
            pool = EXERCISES[split]
            suggestions = [e["name"] for e in pool["compound"]] + [e["name"] for e in pool["isolation"]]
        questions.append({"id": "exercises", "type": "exercise_sets",
                          "label": "做了哪些动作？逐个填重量 × 各组次数",
                          "suggested_split": split, "suggestions": suggestions})
        questions.append({"id": "rpe", "type": "scale", "label": "整体 RPE（1–10）", "min": 1, "max": 10})
    else:
        questions.append({"id": "rpe", "type": "scale", "label": "整体感受 RPE（1–10）", "min": 1, "max": 10})
        questions.append({"id": "note", "type": "text", "label": "补充说明（可选）", "optional": True})

    return {"auto_captured": auto, "is_strength": strength, "questions": questions}


def log_exercises(date_str: str, entries: list[dict]) -> dict:
    """
    把用户回答的动作明细分类标注并落库（exercise_log 形态），每个动作复用双重渐进引擎评估。

    entries: [{"exercise_name", "weight_kg"?, "sets"?, "reps_completed": [..]}, ...]
    """
    logs = []
    for en in entries:
        cls = classify_exercise(en.get("exercise_name", ""))
        reps = en.get("reps_completed") or []
        target = cls["target_rep_high"] or en.get("target_rep_high")
        weight = en.get("weight_kg")

        if target:
            prog = check_progression(reps, target, cls["category"] or "compound", weight)
        else:
            prog = {"progress": False, "next_weight_kg": weight,
                    "suggestion": "动作不在 CBum 库中，已记录但无法自动评估渐进。"}

        logs.append({
            "date": date_str,
            "exercise_name": cls["exercise"],
            "weight_kg": weight,
            "sets": en.get("sets") or len(reps),
            "reps_completed": reps,
            "split": cls["split"],
            "category": cls["category"],
            "muscle": cls["muscle"],
            "classified": cls["found"],
            "progression_flag": prog["progress"],
            "next_weight_kg": prog["next_weight_kg"],
            "progression_suggestion": prog["suggestion"],
        })

    inferred = infer_split([en.get("exercise_name", "") for en in entries])
    return {"date": date_str, "logged": logs, "inferred_split": inferred}
