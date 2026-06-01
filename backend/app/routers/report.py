"""
report.py (router) — 报告类 API（spec Phase 3）

Module C 训练后复盘已实现；Module A 晨间报告、Module D 睡眠报告后续接入同一路由前缀。
"""
from fastapi import APIRouter

from app.engine.annotations import compare_before_after
from app.engine.sleep_analysis import build_sleep_report
from app.engine.workout_analysis import review_session
from app.models.schemas import (
    AnnotationImpactRequest,
    SleepReportRequest,
    WorkoutReviewRequest,
)

router = APIRouter(prefix="/report", tags=["report"])


@router.post("/workout-review")
def workout_review(req: WorkoutReviewRequest) -> dict:
    """训练后复盘：强度匹配、组间回落、负荷评分、过度训练预警、次日预判。"""
    return review_session(
        grade=req.grade,
        sessions=[s.model_dump() for s in req.sessions],
        weekly_avg_calories=req.weekly_avg_calories,
    )


@router.post("/annotation-impact")
def annotation_impact(req: AnnotationImpactRequest) -> dict:
    """观察指标前后对比：某指标在标注分界日之前 vs 之后的均值变化与方向。"""
    return compare_before_after(
        series=[p.model_dump() for p in req.series],
        boundary_date=req.boundary_date,
        metric=req.metric,
        label=req.label,
        higher_is_better=req.higher_is_better,
    )


@router.post("/sleep")
def sleep_report(req: SleepReportRequest) -> dict:
    """睡眠恢复报告：深睡/REM 质量、连续性、碎片化、凌晨觉醒模式、训练关联、观察指标叠加。"""
    return build_sleep_report(
        sleep=req.sleep.model_dump(),
        yesterday_load_level=req.yesterday_load_level,
        annotations=req.annotations,
        metric_comparisons=[c.model_dump() for c in req.metric_comparisons],
    )
