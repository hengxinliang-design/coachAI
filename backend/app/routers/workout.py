"""
workout.py (router) — CBum 训练引擎 API（spec Phase 2 /workout 路由）
"""
from fastapi import APIRouter

from app.engine.cbum import generate_plan
from app.engine.progression import check_progression
from app.engine.rotation import suggest_split
from app.models.schemas import (
    PlanRequest,
    ProgressionRequest,
    ProgressionResponse,
    SplitSuggestionRequest,
    SplitSuggestionResponse,
)

router = APIRouter(prefix="/workout", tags=["workout"])


@router.post("/plan")
def create_plan(req: PlanRequest) -> dict:
    """评级 × 部位 × 器械 → CBum 训练计划（强度按 §4.2 调节）。"""
    return generate_plan(grade=req.grade, split=req.split, equipment=req.equipment)


@router.post("/suggest-split", response_model=SplitSuggestionResponse)
def suggest(req: SplitSuggestionRequest) -> SplitSuggestionResponse:
    """根据近期训练历史，自动建议今日训练部位。"""
    return SplitSuggestionResponse(**suggest_split(req.recent_splits))


@router.post("/progression", response_model=ProgressionResponse)
def progression(req: ProgressionRequest) -> ProgressionResponse:
    """双重渐进超负荷判断：是否达到加重条件。"""
    return ProgressionResponse(**check_progression(
        reps_completed=req.reps_completed,
        target_rep_high=req.target_rep_high,
        movement_type=req.movement_type,
        current_weight_kg=req.current_weight_kg,
    ))
