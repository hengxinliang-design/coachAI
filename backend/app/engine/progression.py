"""
progression.py — 双重渐进超负荷追踪（dev spec v2.0 §3.1② / Phase 2 任务⑲）

双重渐进规则：在目标次数范围内用同一重量训练，当某次训练「所有组都达到
次数范围上限」时，才建议加重 5-15 lbs（约 2.5-5 kg）。否则保持重量，
继续在该重量下把各组次数堆到上限。
"""
from __future__ import annotations

# 加重步长（kg）：复合动作大肌群进步快，孤立动作进步慢
INCREMENT_KG = {"compound": 2.5, "isolation": 1.25}


def check_progression(
    reps_completed: list[int],
    target_rep_high: int,
    movement_type: str = "compound",
    current_weight_kg: float | None = None,
) -> dict:
    """
    reps_completed   本次训练各组完成次数，如 [8, 8, 8, 7]
    target_rep_high  目标次数范围上限（如 8-10 次的 10）
    movement_type    compound / isolation（决定加重步长）
    current_weight_kg 当前重量，提供时给出建议新重量

    返回 {"progress": bool, "suggestion": str, "next_weight_kg": float|None}
    """
    if not reps_completed:
        return {"progress": False, "suggestion": "无完成记录，保持当前重量。", "next_weight_kg": current_weight_kg}

    all_hit_top = all(r >= target_rep_high for r in reps_completed)
    increment = INCREMENT_KG.get(movement_type, 2.5)

    if all_hit_top:
        next_weight = round(current_weight_kg + increment, 2) if current_weight_kg is not None else None
        weight_txt = f"，建议加到 {next_weight} kg" if next_weight is not None else f"，建议加重 {increment} kg"
        return {
            "progress": True,
            "suggestion": f"所有组均达到 {target_rep_high} 次上限{weight_txt}（双重渐进达成）。",
            "next_weight_kg": next_weight,
        }

    min_reps = min(reps_completed)
    return {
        "progress": False,
        "suggestion": f"尚未全部达到 {target_rep_high} 次（最低 {min_reps} 次），保持当前重量，继续把各组次数堆到上限。",
        "next_weight_kg": current_weight_kg,
    }
