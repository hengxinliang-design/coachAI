"""
recovery.py (router) — 恢复评分 API（spec Phase 1 /recovery 路由）
"""
from dataclasses import asdict

from fastapi import APIRouter

from app.engine.recovery import compute_recovery
from app.models.schemas import RecoveryRequest, RecoveryResponse

router = APIRouter(prefix="/recovery", tags=["recovery"])


@router.post("", response_model=RecoveryResponse)
def score_recovery(req: RecoveryRequest) -> RecoveryResponse:
    """计算当日恢复评分与评级（HRV 异常值剔除 + HRV/RHR 矛盾取保守档）。"""
    result = compute_recovery(
        hrv_ms=req.hrv_ms,
        rhr_bpm=req.rhr_bpm,
        wrist_temp_dev=req.wrist_temp_dev,
        recent_hrv=req.recent_hrv,
    )
    return RecoveryResponse(**asdict(result))
