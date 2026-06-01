"""
schemas.py — API 请求/响应模型（Pydantic v2）

Phase 1 仅定义恢复评分相关的 schema；后续模块（训练复盘、睡眠、补剂）按 spec §4–5 扩展。
"""
from pydantic import BaseModel, Field


class RecoveryRequest(BaseModel):
    hrv_ms: float | None = Field(default=None, description="今日 HRV (SDNN, ms)；缺失或异常值传 None/原值均可")
    rhr_bpm: int = Field(description="今日静息心率 (bpm)")
    wrist_temp_dev: float = Field(default=0.0, description="腕温相对基线偏差 (°C)，正值为升高")
    recent_hrv: list[float | None] = Field(
        default_factory=list,
        description="最近若干日 HRV（含今日，用于7日滚动基线），可含 null",
    )


class RecoveryResponse(BaseModel):
    score: int
    grade: str
    grade_label: str
    grade_emoji: str
    hrv_is_outlier: bool
    hrv_baseline: float
    hrv_subscore: float | None
    rhr_subscore: float
    temp_subscore: float
    notes: list[str]
