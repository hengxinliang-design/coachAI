"""
recovery.py — 恢复评分引擎（coach.ai dev spec v2.0 §2.2 / §2.3）

实现三件事，全部为纯函数、可独立测试：
  1. HRV 异常值剔除（>100ms）——既不入评级，也不入7日滚动基线
  2. 7日滚动 HRV 基线（剔除异常值与空值后取均值，数据不足时回落到个人基线）
  3. 恢复评分（HRV 50% + RHR 35% + 腕温 15%）+ 评级决策矩阵（HRV/RHR 矛盾取保守档）

实战校验点（见 tests/test_recovery.py）：
  · 5/13 HRV 105ms、5/31 HRV 154ms → 异常值，剔除
  · 5/25 HRV 69ms(优秀) + RHR 59bpm(中等) → 保守取「中等」
  · 6/1  HRV 32ms → 较差
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app import config

# 评级严重度排序，用于「取保守档」比较
_GRADE_RANK = {"green": 0, "yellow": 1, "red": 2}
_GRADE_LABEL = {"green": "优秀", "yellow": "中等", "red": "较差"}
_GRADE_EMOJI = {"green": "🟢", "yellow": "🟡", "red": "🔴"}


def is_hrv_outlier(hrv_ms: float | None) -> bool:
    """单日 HRV > 100ms 视为测量偏差（spec §2.2）。None / 非正值不算异常值（算缺失）。"""
    return hrv_ms is not None and hrv_ms > config.HRV_OUTLIER_THRESHOLD


def rolling_hrv_baseline(recent_hrv: list[float | None]) -> float:
    """
    7日滚动 HRV 基线：剔除异常值(>100ms)与空值后取均值。
    有效样本不足（0 个）时回落到个人硬编码基线 HRV_BASELINE。
    """
    window = recent_hrv[-config.BASELINE_WINDOW_DAYS:]
    valid = [v for v in window if v is not None and 0 < v <= config.HRV_OUTLIER_THRESHOLD]
    if not valid:
        return config.HRV_BASELINE
    return sum(valid) / len(valid)


# ── 各分项子评分（0–100） ────────────────────────────────────────────────────
def _hrv_subscore(hrv_ms: float, baseline: float) -> float:
    """与基线对比的偏差百分比映射到 0–100（spec §2.2），达到或超过基线即满分。"""
    if baseline <= 0:
        return 0.0
    return max(0.0, min(100.0, round(hrv_ms / baseline * 100)))


def _rhr_subscore(rhr_bpm: int) -> float:
    """RHR ≤ 54 满分；超基线上沿每多 1bpm 扣约 9 分（+5→黄区、+8→红区）。"""
    over = max(0, rhr_bpm - config.RHR_GREEN_MAX)
    return max(0.0, min(100.0, round(100 - over * 9)))


def _temp_subscore(wrist_temp_dev: float) -> float:
    """腕温偏差 ≤ +0.2°C 满分；+0.3 黄、+0.5 红，线性递减。"""
    over = max(0.0, wrist_temp_dev - 0.2)
    return max(0.0, min(100.0, round(100 - over * 150)))


# ── 分项评级 ─────────────────────────────────────────────────────────────────
def _hrv_grade(hrv_ms: float) -> str:
    if hrv_ms >= config.HRV_GREEN_MIN:
        return "green"
    if hrv_ms < config.HRV_RED_MAX:
        return "red"
    return "yellow"


def _rhr_grade(rhr_bpm: int) -> str:
    if rhr_bpm <= config.RHR_GREEN_MAX:
        return "green"
    if rhr_bpm > config.RHR_RED_MIN:
        return "red"
    return "yellow"


def _worst(*grades: str) -> str:
    """取最保守（最差）的一档（spec §2.3 注：HRV 与 RHR 不一致时取保守档）。"""
    return max(grades, key=lambda g: _GRADE_RANK[g])


@dataclass
class RecoveryResult:
    score: int                       # 综合评分 0–100
    grade: str                       # green / yellow / red
    grade_label: str                 # 优秀 / 中等 / 较差
    grade_emoji: str                 # 🟢 / 🟡 / 🔴
    hrv_is_outlier: bool             # 今日 HRV 是否被判为异常值
    hrv_baseline: float              # 本次评级所用的 7日滚动基线
    hrv_subscore: float | None       # HRV 分项（异常值时为 None）
    rhr_subscore: float
    temp_subscore: float
    notes: list[str] = field(default_factory=list)  # 诊断/提示（自然语言）


def compute_recovery(
    hrv_ms: float | None,
    rhr_bpm: int,
    wrist_temp_dev: float = 0.0,
    recent_hrv: list[float | None] | None = None,
) -> RecoveryResult:
    """
    计算当日恢复评分与评级。

    参数
        hrv_ms          今日 HRV (SDNN, ms)；None 或异常值时走「无 HRV」路径
        rhr_bpm         今日静息心率 (bpm)
        wrist_temp_dev  腕温相对基线偏差 (°C)，正值为升高
        recent_hrv      最近若干日 HRV（含今日，用于7日滚动基线），可含 None

    规则
        · HRV > 100ms：剔除，不入评级也不入基线；评分按 RHR 70% + 腕温 30% 归一化，
          评级仅按 RHR（保守），并附诊断提示。
        · 正常：评分 = HRV 50% + RHR 35% + 腕温 15%；评级 = HRV 档与 RHR 档取保守者。
    """
    recent = recent_hrv or []
    notes: list[str] = []

    rhr_sub = _rhr_subscore(rhr_bpm)
    temp_sub = _temp_subscore(wrist_temp_dev)
    baseline = rolling_hrv_baseline(recent)

    outlier = is_hrv_outlier(hrv_ms)
    missing = hrv_ms is None or hrv_ms <= 0

    if outlier or missing:
        # ── 无可用 HRV：RHR 70% + 腕温 30%，评级仅按 RHR ──
        score = round(rhr_sub * config.WEIGHT_RHR_NO_HRV + temp_sub * config.WEIGHT_TEMP_NO_HRV)
        grade = _rhr_grade(rhr_bpm)
        if outlier:
            notes.append(
                f"HRV {hrv_ms:.0f}ms 超过 {config.HRV_OUTLIER_THRESHOLD:.0f}ms 异常阈值，"
                f"已剔除出评级与7日基线，改用静息心率与腕温综合判断。"
            )
        else:
            notes.append("今日缺少有效 HRV 读数，改用静息心率与腕温综合判断，建议稍后重查。")
        return RecoveryResult(
            score=score, grade=grade,
            grade_label=_GRADE_LABEL[grade], grade_emoji=_GRADE_EMOJI[grade],
            hrv_is_outlier=outlier, hrv_baseline=round(baseline, 1),
            hrv_subscore=None, rhr_subscore=rhr_sub, temp_subscore=temp_sub,
            notes=notes,
        )

    # ── 正常路径 ──
    hrv_sub = _hrv_subscore(hrv_ms, baseline)
    score = round(
        hrv_sub * config.WEIGHT_HRV
        + rhr_sub * config.WEIGHT_RHR
        + temp_sub * config.WEIGHT_TEMP
    )

    hrv_g = _hrv_grade(hrv_ms)
    rhr_g = _rhr_grade(rhr_bpm)
    grade = _worst(hrv_g, rhr_g)
    if hrv_g != rhr_g:
        notes.append(
            f"HRV 指向「{_GRADE_LABEL[hrv_g]}」、静息心率指向「{_GRADE_LABEL[rhr_g]}」，"
            f"按保守原则取「{_GRADE_LABEL[grade]}」。"
        )

    return RecoveryResult(
        score=score, grade=grade,
        grade_label=_GRADE_LABEL[grade], grade_emoji=_GRADE_EMOJI[grade],
        hrv_is_outlier=False, hrv_baseline=round(baseline, 1),
        hrv_subscore=hrv_sub, rhr_subscore=rhr_sub, temp_subscore=temp_sub,
        notes=notes,
    )
