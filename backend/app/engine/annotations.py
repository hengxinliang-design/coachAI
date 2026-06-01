"""
annotations.py — 观察指标「前后对比」分析（dev spec v2.0 §5 的泛化）

把 spec §5.1「服用前基线 vs 服用后趋势」从补剂专属逻辑，泛化成对任意指标 +
任意分界日期的通用对比。镁甘氨酸只是它的一个用例（见测试）。

纯函数，可独立测试。
"""
from __future__ import annotations

from datetime import date

# 指标方向注册表：True = 越高越好，False = 越低越好。
# 未登记的指标由调用方通过 higher_is_better 参数显式指定。
METRIC_HIGHER_IS_BETTER = {
    "hrv_ms": True,
    "recovery_score": True,
    "deep_min": True,
    "rem_min": True,
    "sleep_total_min": True,
    "rhr_bpm": False,
    "max_awake_min": False,
    "awake_count": False,
    "fragmentation_pct": False,
}

# 评估窗口建议（spec §5.1：正式评估节点设在服用满 1 周 / 2 周，避开自然恢复期干扰）
MIN_RELIABLE_AFTER_DAYS = 7


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def compare_before_after(
    series: list[dict],
    boundary_date: date,
    metric: str,
    label: str = "该标注",
    higher_is_better: bool | None = None,
) -> dict:
    """
    series           [{"date": date, "value": float}, ...]，可乱序，自动按日期切分
    boundary_date    分界日（含当日及之后算「之后」，之前算「之前」）
    metric           指标名（用于判断方向与文案）
    label            观察指标名（用于文案，如「镁甘氨酸」）
    higher_is_better 覆盖默认方向；None 时查注册表，仍未知则不判断方向

    返回 before/after 均值、绝对与百分比变化、方向（improved/worsened/flat）、解读与可靠性提示。
    """
    before = [p["value"] for p in series if p["value"] is not None and p["date"] < boundary_date]
    after = [p["value"] for p in series if p["value"] is not None and p["date"] >= boundary_date]

    before_mean = _mean(before)
    after_mean = _mean(after)

    if before_mean is None or after_mean is None:
        return {
            "metric": metric, "label": label,
            "before": {"n": len(before), "mean": before_mean},
            "after": {"n": len(after), "mean": after_mean},
            "delta": None, "pct_change": None, "direction": "insufficient_data",
            "note": "前后任一窗口缺少有效数据，无法对比，建议继续积累样本。",
        }

    delta = round(after_mean - before_mean, 1)
    pct = round(delta / before_mean * 100, 1) if before_mean != 0 else None

    hib = higher_is_better if higher_is_better is not None else METRIC_HIGHER_IS_BETTER.get(metric)
    if hib is None or delta == 0:
        direction = "flat" if delta == 0 else "changed"
    else:
        improved = (delta > 0) if hib else (delta < 0)
        direction = "improved" if improved else "worsened"

    dir_word = {"improved": "明显改善", "worsened": "出现退步",
                "flat": "基本持平", "changed": "发生变化"}[direction]
    pct_txt = f"（{pct:+.0f}%）" if pct is not None else ""
    note = f"开始「{label}」后，{metric} 从 {before_mean} 变为 {after_mean}{pct_txt}，{dir_word}。"

    if len(after) < MIN_RELIABLE_AFTER_DAYS:
        note += f" ⚠ 服用后样本仅 {len(after)} 天，建议满 {MIN_RELIABLE_AFTER_DAYS} 天再正式评估，以排除自然恢复期干扰。"

    return {
        "metric": metric, "label": label,
        "before": {"n": len(before), "mean": before_mean},
        "after": {"n": len(after), "mean": after_mean},
        "delta": delta, "pct_change": pct, "direction": direction,
        "note": note,
    }
