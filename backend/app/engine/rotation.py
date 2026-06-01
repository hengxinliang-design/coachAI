"""
rotation.py — 部位轮换追踪器（dev spec v2.0 §4.2 / Phase 2 任务⑮）

根据近期训练历史，自动建议今日训练部位。
原则：PPL 轮换 + 背部双频次（spec §3.1⑥）——在一个标准 push/pull/legs
循环里，pull 隐含两次背部刺激（厚度划船 + 宽度下拉），无需额外加频。
建议「距上次训练最久」的部位；力量部位平手时按 push→pull→legs 顺序补位。
"""
from __future__ import annotations

STRENGTH_SPLITS = ["push", "pull", "legs"]


def suggest_split(recent_splits: list[str]) -> dict:
    """
    recent_splits: 按时间正序排列的近期训练部位（最后一个为最近一次），
                   可含 "cardio"（不参与轮换计数）。

    返回 {"suggested": "push|pull|legs", "reason": "..."}。
    """
    # 计算每个力量部位「距今多少次训练之前练过」，从未练过记为无穷大
    last_index = {s: None for s in STRENGTH_SPLITS}
    for i, s in enumerate(recent_splits):
        if s in last_index:
            last_index[s] = i

    def staleness(split: str) -> int:
        idx = last_index[split]
        if idx is None:
            return len(recent_splits) + 1  # 从未练过，最优先
        return len(recent_splits) - 1 - idx  # 距最近一次的间隔

    # 选最久未练的；平手时按 STRENGTH_SPLITS 固定顺序（push 优先）保证确定性
    suggested = max(STRENGTH_SPLITS, key=lambda s: (staleness(s), -STRENGTH_SPLITS.index(s)))

    never = [s for s in STRENGTH_SPLITS if last_index[s] is None]
    last_strength = next((s for s in reversed(recent_splits) if s in STRENGTH_SPLITS), None)

    if never:
        # 含「无任何历史」与「部分部位未练」两种情形
        reason = f"{'、'.join(never)} 本周期尚未训练，优先补齐部位轮换。"
    else:
        # 三个部位都练过 → 必有最近一次力量训练
        reason = f"上次力量训练为「{last_strength}」，{suggested} 距今最久，轮到它了。"

    return {"suggested": suggested, "reason": reason}
