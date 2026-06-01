"""
sleep_analysis.py — 睡眠恢复报告（dev spec v2.0 §4.4 / Module D）

分析维度：
  · Deep / REM 质量（目标 ≥90 分钟）
  · 睡眠连续性指数（觉醒 ≤2 次且最长 <10 分钟为优秀）
  · 睡眠碎片化指数（觉醒总时长 / 睡眠总时长，>15% 异常）
  · 觉醒模式识别（凌晨 2–4 点长觉醒 → 皮质醇过早分泌）
  · 训练-睡眠关联（昨日训练负荷对当晚睡眠的影响）
  · 观察指标叠加（补剂/环境/压力等标注对睡眠的前后影响，支持多指标叠加）

叠加多个观察指标时，明确标注效果相互交织、无法单独归因（呼应 §5.1 排除干扰原则）。
纯函数，可独立测试。
"""
from __future__ import annotations

from app.engine.annotations import compare_before_after

# 阶段目标（spec §4.4）
DEEP_TARGET_MIN = 90
REM_TARGET_MIN = 90

# 连续性判定（spec §4.4：觉醒 ≤2 次且最长 <10 分钟为优秀）
CONTINUITY_EXCELLENT = {"awake_count": 2, "max_awake_min": 10}

# 碎片化阈值（spec §4.1：觉醒总时长/睡眠总时长 >15% 异常）
FRAGMENTATION_ABNORMAL_PCT = 15.0

# 皮质醇过早分泌窗口（spec §4.4：凌晨 2–4 点）与长觉醒阈值
CORTISOL_WINDOW = (2, 4)   # 本地小时 [2,4)，即 02:00–03:59
LONG_AWAKE_MIN = 10


def _stage_quality(minutes: int, target: int, name: str) -> dict:
    if minutes >= target:
        grade, note = "good", f"{name} {minutes} 分钟，达到 ≥{target} 分钟目标，修复充分。"
    elif minutes >= target * 0.66:
        grade, note = "fair", f"{name} {minutes} 分钟，略低于 {target} 分钟目标，质量尚可。"
    else:
        grade, note = "poor", f"{name} {minutes} 分钟，明显不足（目标 ≥{target}），影响恢复。"
    return {"minutes": minutes, "target_met": minutes >= target, "grade": grade, "note": note}


def continuity_index(awake_count: int, max_awake_min: int) -> dict:
    """睡眠连续性指数：觉醒次数与最长觉醒共同决定。"""
    if awake_count <= CONTINUITY_EXCELLENT["awake_count"] and max_awake_min < CONTINUITY_EXCELLENT["max_awake_min"]:
        label, score = "优秀", 95
    elif awake_count <= 3 and max_awake_min < 20:
        label, score = "良好", 78
    elif awake_count <= 4 and max_awake_min < 30:
        label, score = "尚可", 58
    else:
        label, score = "较差", 32
    note = f"夜间觉醒 {awake_count} 次、最长 {max_awake_min} 分钟，连续性{label}。"
    return {"label": label, "score": score, "note": note}


def fragmentation(total_awake_min: float | None, total_sleep_min: int) -> dict | None:
    """碎片化指数 = 觉醒总时长 / 睡眠总时长。数据不足返回 None。"""
    if total_awake_min is None or not total_sleep_min:
        return None
    pct = round(total_awake_min / total_sleep_min * 100, 1)
    abnormal = pct > FRAGMENTATION_ABNORMAL_PCT
    note = (f"碎片化指数 {pct}%，超过 {FRAGMENTATION_ABNORMAL_PCT}% 阈值，睡眠较破碎。"
            if abnormal else f"碎片化指数 {pct}%，在正常范围内。")
    return {"pct": pct, "abnormal": abnormal, "note": note}


def detect_cortisol_awakening(awake_events: list[dict]) -> dict:
    """
    识别凌晨 2–4 点的长觉醒（皮质醇过早分泌 / 压力认知激活）。
    awake_events: [{"hour": 本地小时 int, "duration_min": int}, ...]
    """
    lo, hi = CORTISOL_WINDOW
    hits = [e for e in awake_events
            if lo <= e.get("hour", -1) < hi and e.get("duration_min", 0) >= LONG_AWAKE_MIN]
    if hits:
        longest = max(e["duration_min"] for e in hits)
        note = (f"凌晨 {lo}–{hi} 点出现长觉醒（最长 {longest} 分钟），符合皮质醇过早分泌 / 压力认知激活模式。"
                f"建议睡前 10 分钟做任务清单 dump 清空工作记忆；可观察镁甘氨酸等补剂的改善效果。")
        return {"cortisol_flag": True, "longest_min": longest, "note": note}
    return {"cortisol_flag": False, "longest_min": 0,
            "note": f"凌晨 {lo}–{hi} 点无显著长觉醒，皮质醇节律平稳。"}


def training_sleep_link(yesterday_load_level: str | None) -> dict | None:
    """昨日训练负荷对当晚睡眠的影响（衔接 Module C 的 training_load.level）。"""
    if yesterday_load_level is None:
        return None
    notes = {
        "high": "昨日为高负荷训练，可能压缩深睡前半段并增加觉醒，今晚睡眠数据需结合负荷理解。",
        "normal": "昨日训练负荷正常，对睡眠结构无明显负面影响。",
        "light": "昨日为轻负荷日，睡眠应较少受训练干扰。",
        "unknown": "昨日训练负荷未知，暂无法关联。",
    }
    return {"level": yesterday_load_level, "note": notes.get(yesterday_load_level, notes["unknown"])}


def _annotation_overlay(annotations: list[dict], metric_comparisons: list[dict]) -> dict:
    """汇总今晚生效的观察指标，并对提供了序列的指标做前后对比；多指标叠加时给出归因警示。"""
    active = [a.get("label", "") for a in annotations]
    impacts = [
        compare_before_after(
            series=mc["series"],
            boundary_date=mc["boundary_date"],
            metric=mc["metric"],
            label=mc.get("label", "该标注"),
            higher_is_better=mc.get("higher_is_better"),
        )
        for mc in metric_comparisons
    ]
    note = ""
    if len(active) > 1:
        note = (f"今晚有 {len(active)} 个观察指标叠加（{'、'.join(active)}），"
                f"其对睡眠的影响相互交织，无法单独归因；如需评估单一指标，请安排只含该指标的对照夜。")
    elif len(active) == 1:
        note = f"今晚生效的观察指标：{active[0]}。"
    return {"active": active, "impacts": impacts, "note": note}


def build_sleep_report(
    sleep: dict,
    yesterday_load_level: str | None = None,
    annotations: list[dict] | None = None,
    metric_comparisons: list[dict] | None = None,
) -> dict:
    """
    睡眠恢复报告总入口。

    sleep: {
        total_min, deep_min, rem_min, awake_count, max_awake_min,
        awake_events?: [{"hour": int, "duration_min": int}],
        awake_total_min?: float    # 未提供 awake_events 时可直接给觉醒总时长
    }
    """
    annotations = annotations or []
    metric_comparisons = metric_comparisons or []

    awake_events = sleep.get("awake_events") or []
    total_awake = (
        sum(e.get("duration_min", 0) for e in awake_events) if awake_events
        else sleep.get("awake_total_min")
    )

    return {
        "summary": {
            "total_min": sleep.get("total_min", 0),
            "deep_min": sleep.get("deep_min", 0),
            "rem_min": sleep.get("rem_min", 0),
            "awake_count": sleep.get("awake_count", 0),
            "max_awake_min": sleep.get("max_awake_min", 0),
        },
        "deep_sleep": _stage_quality(sleep.get("deep_min", 0), DEEP_TARGET_MIN, "深睡"),
        "rem": _stage_quality(sleep.get("rem_min", 0), REM_TARGET_MIN, "REM"),
        "continuity": continuity_index(sleep.get("awake_count", 0), sleep.get("max_awake_min", 0)),
        "fragmentation": fragmentation(total_awake, sleep.get("total_min", 0)),
        "awakening_pattern": detect_cortisol_awakening(awake_events),
        "training_link": training_sleep_link(yesterday_load_level),
        "annotations": _annotation_overlay(annotations, metric_comparisons),
    }
