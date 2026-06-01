"""
hr_zones.py — 心率分区分类器（spec §2.1 / Phase 1 任务⑤）

纯函数，不依赖 FastAPI。
"""
from app.config import HR_ZONES


def classify_zone(bpm: int) -> dict:
    """把单个心率值归入 Z1–Z5。超出 HR_MAX 标准的实测值仍归入 Z5（spec §8 边界条件）。"""
    for z in HR_ZONES:
        if z["min"] <= bpm <= z["max"]:
            return z
    return HR_ZONES[-1]  # 兜底：极高心率归 Z5


def zone_distribution(hr_samples: list[int]) -> dict:
    """
    把一段心率时序分桶为各区间占比（%）。

    返回 {"z1_pct": .., "z2_pct": .., ..., "z5_pct": ..}，五项之和为 100（四舍五入到 1 位）。
    空输入返回全 0。
    """
    keys = ["z1_pct", "z2_pct", "z3_pct", "z4_pct", "z5_pct"]
    if not hr_samples:
        return {k: 0.0 for k in keys}

    counts = [0, 0, 0, 0, 0]
    for bpm in hr_samples:
        counts[classify_zone(bpm)["zone"] - 1] += 1

    total = len(hr_samples)
    return {keys[i]: round(counts[i] / total * 100, 1) for i in range(5)}
