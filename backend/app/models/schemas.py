"""
schemas.py — API 请求/响应模型（Pydantic v2）

Phase 1 仅定义恢复评分相关的 schema；后续模块（训练复盘、观察指标）按 spec §4–5 扩展。
"""
from datetime import date

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


# ── 训练（Phase 2） ──────────────────────────────────────────────────────────
class PlanRequest(BaseModel):
    grade: str = Field(description="今日恢复评级 green/yellow/red")
    split: str = Field(default="auto", description="训练部位 push/pull/legs/auto")
    equipment: str = Field(default="full", description="可用器械 full/home/outdoor")


class SplitSuggestionRequest(BaseModel):
    recent_splits: list[str] = Field(
        default_factory=list,
        description="按时间正序的近期训练部位（最后一个为最近一次），可含 cardio",
    )


class SplitSuggestionResponse(BaseModel):
    suggested: str
    reason: str


class ProgressionRequest(BaseModel):
    reps_completed: list[int] = Field(description="本次各组完成次数，如 [8,8,8,7]")
    target_rep_high: int = Field(description="目标次数范围上限")
    movement_type: str = Field(default="compound", description="compound / isolation")
    current_weight_kg: float | None = Field(default=None, description="当前重量 kg")


class ProgressionResponse(BaseModel):
    progress: bool
    suggestion: str
    next_weight_kg: float | None


# ── 运动后追问 + 动作分类记录 ────────────────────────────────────────────────
class PostWorkoutPromptRequest(BaseModel):
    workout_type: str = Field(description="HealthKit 识别的训练类型，如 力量训练/跑步/椭圆")
    duration_min: int = Field(default=0)
    calories_kcal: float = Field(default=0.0)
    hr_samples: list[int] = Field(default_factory=list)


class ExerciseEntry(BaseModel):
    exercise_name: str
    weight_kg: float | None = None
    sets: int | None = None
    reps_completed: list[int] = Field(default_factory=list)
    target_rep_high: int | None = Field(default=None, description="库外动作可手动指定次数上限")


class LogExercisesRequest(BaseModel):
    date: date
    entries: list[ExerciseEntry]


# ── 持久化层 ingestion schemas ───────────────────────────────────────────────
class HealthMetricIn(BaseModel):
    date: date
    hrv_ms: float | None = None
    rhr_bpm: int = Field(description="今日静息心率")
    wrist_temp_dev: float = Field(default=0.0, description="腕温相对基线偏差 (°C)")
    wrist_temp: float | None = Field(default=None, description="腕温绝对值 (°C)，可选存档")


class AnnotationIn(BaseModel):
    date: date
    label: str
    category: str | None = None
    note: str | None = None


class WorkoutIn(BaseModel):
    date: date
    workout_type: str
    duration_min: int = 0
    calories_kcal: float = 0.0
    distance_m: float | None = None
    avg_pace_per_km: str | None = None
    hr_peak: int | None = None
    hr_avg: int | None = None


class SleepSessionIn(BaseModel):
    date: date
    total_min: int = 0
    deep_min: int = 0
    rem_min: int = 0
    awake_count: int = 0
    max_awake_min: int = 0
    fragmentation_pct: float | None = None
    stages: dict | None = None


# ── 教练口吻渲染 ─────────────────────────────────────────────────────────────
class RenderRequest(BaseModel):
    kind: str = Field(description="渲染类型：recovery / workout_review / sleep")
    data: dict = Field(description="对应引擎的结构化输出")
    model: str | None = Field(default=None, description="覆盖 Claude 模型名（可选）")
    include_claude_request: bool = Field(
        default=True, description="是否一并返回可直接发往 Claude 的请求负载（带 prompt caching）")


# ── 训练后复盘（Phase 3, Module C） ──────────────────────────────────────────
class WorkoutSession(BaseModel):
    workout_type: str = Field(description="力量/Push/Pull/Legs/椭圆/跑步 等")
    duration_min: int = Field(default=0)
    calories_kcal: float = Field(default=0.0)
    hr_peak: int | None = Field(default=None)
    hr_avg: int | None = Field(default=None)
    hr_samples: list[int] = Field(default_factory=list, description="逐点心率采样")


class WorkoutReviewRequest(BaseModel):
    grade: str = Field(description="当日恢复评级 green/yellow/red")
    sessions: list[WorkoutSession] = Field(description="当日训练项（支持多项叠加）")
    weekly_avg_calories: float | None = Field(default=None, description="本周日均消耗，用于负荷对比")


# ── 观察指标前后对比（§5 泛化） ──────────────────────────────────────────────
class MetricPoint(BaseModel):
    date: date
    value: float | None = None


class AnnotationImpactRequest(BaseModel):
    label: str = Field(description="观察指标名，如「镁甘氨酸」「旅行」")
    metric: str = Field(description="对比的指标名，如 hrv_ms / max_awake_min / rhr_bpm")
    boundary_date: date = Field(description="分界日（含当日起算「之后」）")
    series: list[MetricPoint] = Field(description="该指标的逐日序列，可乱序")
    higher_is_better: bool | None = Field(default=None, description="覆盖指标方向；留空则查内置注册表")


# ── 睡眠恢复报告（Phase 3, Module D） ────────────────────────────────────────
class AwakeEvent(BaseModel):
    hour: int = Field(description="觉醒发生的本地小时 (0–23)")
    duration_min: int = Field(description="该次觉醒时长（分钟）")


class SleepInput(BaseModel):
    total_min: int = Field(default=0, description="睡眠总时长（分钟）")
    deep_min: int = Field(default=0)
    rem_min: int = Field(default=0)
    awake_count: int = Field(default=0)
    max_awake_min: int = Field(default=0)
    awake_events: list[AwakeEvent] = Field(default_factory=list, description="各次觉醒（本地小时+时长）")
    awake_total_min: float | None = Field(default=None, description="觉醒总时长；未给 events 时可直接传")


class AnnotationComparison(BaseModel):
    label: str
    metric: str
    boundary_date: date
    series: list[MetricPoint]
    higher_is_better: bool | None = None


class SleepReportRequest(BaseModel):
    sleep: SleepInput
    yesterday_load_level: str | None = Field(default=None, description="昨日训练负荷 high/normal/light")
    annotations: list[dict] = Field(default_factory=list, description="今晚生效的观察指标 [{label, category}]")
    metric_comparisons: list[AnnotationComparison] = Field(
        default_factory=list, description="需做前后对比的观察指标×指标序列（支持多指标叠加）",
    )


# ── 环境上下文（方向 B：上下文标注层，自动采集信号 → 解释性标注） ────────────
class EnvironmentRequest(BaseModel):
    pressure_hpa: float | None = Field(default=None, description="今日气压 (hPa)")
    pressure_hpa_prev: float | None = Field(default=None, description="昨日气压 (hPa)，用于环比")
    altitude_m: float | None = Field(default=None, description="海拔 (m)")
    temp_c: float | None = Field(default=None, description="气温 (°C)")
    humidity_pct: float | None = Field(default=None, description="湿度 (%)")
    aqi: int | None = Field(default=None, description="空气质量指数")
    spo2_pct: float | None = Field(default=None, description="血氧 (%)；无则不传")
    location_changed: bool = Field(default=False, description="定位是否发生显著变化（旅行/换床）")
    timezone_shift_hours: int = Field(default=0, description="跨时区小时数")
