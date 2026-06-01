"""
report.py (router) — 报告类 API（spec Phase 3）

Module C 训练后复盘已实现；Module A 晨间报告、Module D 睡眠报告后续接入同一路由前缀。
"""
from fastapi import APIRouter

from app.engine.workout_analysis import review_session
from app.models.schemas import WorkoutReviewRequest

router = APIRouter(prefix="/report", tags=["report"])


@router.post("/workout-review")
def workout_review(req: WorkoutReviewRequest) -> dict:
    """训练后复盘：强度匹配、组间回落、负荷评分、过度训练预警、次日预判。"""
    return review_session(
        grade=req.grade,
        sessions=[s.model_dump() for s in req.sessions],
        weekly_avg_calories=req.weekly_avg_calories,
    )
