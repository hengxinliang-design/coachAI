"""
workout_analysis.py — 训练后复盘分析器（dev spec v2.0 §4.3 / Phase 3）

消费 workouts 表的心率时序与负荷数据，输出五个分析维度：
  1. 强度匹配度     —— 实际 HR 区间分布 vs 当日评级期望强度
  2. 力量组心率模式 —— 组间回落是否达到 ≤115 bpm（休息充分度）
  3. 训练负荷评分   —— 消耗 × 强度系数，与本周日均对比
  4. 过度训练预警   —— 单日多项叠加识别（5/31 椭圆+力量+跑步=1409kcal）
  5. 次日影响预判   —— 基于今日负荷预测明晨 HRV 变化方向

全部纯函数，可独立测试。
"""
from __future__ import annotations

from app.engine.hr_zones import zone_distribution

# 组间回落判定（spec §4.3）
SET_WORK_THRESHOLD = 130   # HR ≥ 此值视为「在做组」
SET_REST_TARGET = 115      # 组间回落到 ≤ 此值视为休息充分

# 过度训练阈值（spec §4.3 实战案例：5/31 三项叠加 1409kcal → 6/1 HRV 32ms）
OVERTRAIN_SESSION_COUNT = 3
OVERTRAIN_CALORIE_HIGH = 1200
OVERTRAIN_CALORIE_MODERATE = 800

# 各区间的强度系数（用于负荷加权）
_ZONE_COEF = {"z1_pct": 0.5, "z2_pct": 1.0, "z3_pct": 1.3, "z4_pct": 1.6, "z5_pct": 2.0}

_STRENGTH_KEYS = ("力量", "strength", "push", "pull", "legs", "腿")


def is_strength(workout_type: str) -> bool:
    t = (workout_type or "").lower()
    return any(k in t for k in _STRENGTH_KEYS)


def detect_set_recovery(hr_samples: list[int]) -> dict:
    """
    检测力量训练的组间回落模式。

    把 HR 时序切成「做组（≥130）→ 休息（回落）」的锯齿，统计每次休息谷值，
    判断有多少次回落到 ≤115 bpm。返回休息充分度百分比。
    """
    if not hr_samples:
        return {"valleys": 0, "adequate": 0, "rest_adequacy_pct": 0.0, "note": "无心率时序数据。"}

    valleys: list[int] = []
    in_work = False
    trough: int | None = None
    for hr in hr_samples:
        if hr >= SET_WORK_THRESHOLD:
            if not in_work and trough is not None:
                valleys.append(trough)   # 一次休息结束（HR 重新拉起）
            in_work = True
            trough = None
        else:
            in_work = False
            trough = hr if trough is None else min(trough, hr)
    if trough is not None:               # 收尾：最后一段休息谷值
        valleys.append(trough)

    if not valleys:
        return {"valleys": 0, "adequate": 0, "rest_adequacy_pct": 0.0,
                "note": "未识别到明显的组间回落（可能为持续高强度或数据不足）。"}

    adequate = sum(1 for v in valleys if v <= SET_REST_TARGET)
    pct = round(adequate / len(valleys) * 100, 1)
    if pct >= 80:
        note = f"组间回落充分：{adequate}/{len(valleys)} 次回落到 ≤{SET_REST_TARGET} bpm，休息节奏良好。"
    elif pct >= 50:
        note = f"组间回落尚可：{adequate}/{len(valleys)} 次达标，部分组休息偏短，可适当延长。"
    else:
        note = f"组间回落不足：仅 {adequate}/{len(valleys)} 次回落到 ≤{SET_REST_TARGET} bpm，组间休息偏短，影响下一组发力。"
    return {"valleys": len(valleys), "adequate": adequate, "rest_adequacy_pct": pct, "note": note}


def intensity_match(grade: str, zone_dist: dict) -> dict:
    """实际强度区间分布 vs 当日评级期望。"""
    high = zone_dist["z4_pct"] + zone_dist["z5_pct"]
    mid_high = zone_dist["z3_pct"] + high

    if grade == "red":
        if mid_high > 10:
            return {"assessment": "mismatch",
                    "note": f"红灯日出现 {mid_high:.0f}% 的 Z3+ 高强度，与「主动恢复」期望不符，加深了疲劳。"}
        return {"assessment": "match", "note": "红灯日强度控制在低区间，符合主动恢复期望。"}

    if grade == "yellow":
        if high > 25:
            return {"assessment": "mismatch",
                    "note": f"中等日 Z4-Z5 占比 {high:.0f}% 偏高，建议下次控制在 25% 以内、以感受为主。"}
        return {"assessment": "match", "note": "中等日强度分布合理，主要落在有氧与中强度区间。"}

    # green
    if mid_high < 15:
        return {"assessment": "underload",
                "note": f"优秀日强度偏低（Z3+ 仅 {mid_high:.0f}%），未充分利用超补偿窗口，下次可冲更大重量。"}
    return {"assessment": "match", "note": "优秀日强度充分，有效利用了良好的恢复状态。"}


def training_load(total_calories: float, zone_dist: dict, weekly_avg_calories: float | None) -> dict:
    """训练负荷评分 = 消耗 × 强度系数，与本周日均对比。"""
    coef = sum(zone_dist[k] * c for k, c in _ZONE_COEF.items()) / 100 if any(zone_dist.values()) else 1.0
    load_score = round(total_calories * coef)
    ratio = round(total_calories / weekly_avg_calories, 2) if weekly_avg_calories else None

    if ratio is None:
        level, note = "unknown", f"负荷评分 {load_score}（强度系数 {coef:.2f}），无本周均值可对比。"
    elif ratio >= 1.3:
        level, note = "high", f"今日消耗为本周日均的 {ratio}×，负荷偏高，注意补充恢复。"
    elif ratio >= 0.7:
        level, note = "normal", f"今日消耗为本周日均的 {ratio}×，负荷处于正常区间。"
    else:
        level, note = "light", f"今日消耗为本周日均的 {ratio}×，属轻负荷日。"
    return {"load_score": load_score, "intensity_coef": round(coef, 2),
            "ratio_vs_weekly": ratio, "level": level, "note": note}


def assess_overtraining(sessions: list[dict], total_calories: float) -> dict:
    """单日多项叠加过度训练识别 + 次日 HRV 影响预判（spec §4.3 实战案例）。"""
    n = len(sessions)
    types = [s.get("workout_type", "") for s in sessions]

    if n >= OVERTRAIN_SESSION_COUNT or total_calories >= OVERTRAIN_CALORIE_HIGH:
        return {
            "risk": "high",
            "next_day_prediction": "明晨 HRV 预计显著下滑，建议明日主动恢复或休息。",
            "note": (f"单日 {n} 项训练叠加（{'、'.join(t for t in types if t)}）、合计 {total_calories:.0f} kcal，"
                     f"属高风险负荷。这类「多项叠加」会突破恢复缓冲，次日恢复指标大概率回落。"),
        }
    if total_calories >= OVERTRAIN_CALORIE_MODERATE:
        return {"risk": "moderate",
                "next_day_prediction": "明晨 HRV 可能小幅波动，留意睡眠质量。",
                "note": f"今日合计 {total_calories:.0f} kcal，中等偏上负荷，单项为主，恢复影响可控。"}
    return {"risk": "low",
            "next_day_prediction": "负荷可控，对明晨恢复影响较小。",
            "note": f"今日合计 {total_calories:.0f} kcal，负荷适中。"}


def review_session(grade: str, sessions: list[dict], weekly_avg_calories: float | None = None) -> dict:
    """
    训练后复盘总入口。

    sessions: 当日训练项列表，每项含
        workout_type, duration_min, calories_kcal, hr_peak?, hr_avg?, hr_samples?
    """
    total_duration = sum(s.get("duration_min", 0) or 0 for s in sessions)
    total_calories = sum(s.get("calories_kcal", 0) or 0 for s in sessions)

    all_samples: list[int] = []
    for s in sessions:
        all_samples.extend(s.get("hr_samples") or [])
    zone_dist = zone_distribution(all_samples)

    # 组间回落只对力量训练有意义
    strength_samples: list[int] = []
    for s in sessions:
        if is_strength(s.get("workout_type", "")):
            strength_samples.extend(s.get("hr_samples") or [])
    set_recovery = detect_set_recovery(strength_samples) if strength_samples else None

    return {
        "total_duration_min": total_duration,
        "total_calories": round(total_calories),
        "zone_distribution": zone_dist,
        "intensity_match": intensity_match(grade, zone_dist),
        "set_recovery": set_recovery,
        "training_load": training_load(total_calories, zone_dist, weekly_avg_calories),
        "overtraining": assess_overtraining(sessions, total_calories),
    }
