"""
data.py (router) — 持久化层 API（/data/*）

存入原始数据并提供历史查询。亮点：POST /data/health-metric 在落库的同时，
自动用数据库里的 7 日 HRV 历史计算 history-aware 恢复评分并回写——这是持久化
解锁的核心价值（无需客户端再手动传 recent_hrv）。
"""
from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import repository as repo
from app.database import get_db
from app.engine.recovery import compute_recovery
from app.engine.workout_logging import log_exercises
from app.models.schemas import (
    AnnotationIn,
    HealthMetricIn,
    LogExercisesRequest,
    SleepSessionIn,
    WorkoutIn,
)

router = APIRouter(prefix="/data", tags=["data"])


# ── 健康指标：落库 + history-aware 恢复评分 ──────────────────────────────────
@router.post("/health-metric")
def save_health_metric(req: HealthMetricIn, db: Session = Depends(get_db)) -> dict:
    """存入当日读数，自动用 DB 中的 7 日 HRV 历史计算恢复评分并回写。"""
    history = repo.recent_hrv(db, req.date, days=7)
    recovery = compute_recovery(
        hrv_ms=req.hrv_ms, rhr_bpm=req.rhr_bpm,
        wrist_temp_dev=req.wrist_temp_dev, recent_hrv=[*history, req.hrv_ms],
    )
    repo.upsert_health_metric(
        db, req.date,
        hrv_ms=req.hrv_ms, hrv_is_outlier=recovery.hrv_is_outlier,
        rhr_bpm=req.rhr_bpm, wrist_temp=req.wrist_temp,
        recovery_score=recovery.score, recovery_grade=recovery.grade,
    )
    return {"date": req.date.isoformat(), "recovery": asdict(recovery)}


@router.get("/health-metrics")
def get_health_metrics(frm: str, to: str, db: Session = Depends(get_db)) -> list[dict]:
    from datetime import date as D
    rows = repo.list_health_metrics(db, D.fromisoformat(frm), D.fromisoformat(to))
    return [{"date": r.date.isoformat(), "hrv_ms": r.hrv_ms, "rhr_bpm": r.rhr_bpm,
             "recovery_score": r.recovery_score, "recovery_grade": r.recovery_grade,
             "hrv_is_outlier": r.hrv_is_outlier} for r in rows]


# ── 观察指标：增 / 查 / 删 ───────────────────────────────────────────────────
@router.post("/annotation")
def create_annotation(req: AnnotationIn, db: Session = Depends(get_db)) -> dict:
    row = repo.add_annotation(db, req.date, req.label, req.category, req.note)
    return {"id": row.id, "date": row.date.isoformat(), "label": row.label,
            "category": row.category, "note": row.note}


@router.get("/annotations")
def get_annotations(frm: str | None = None, to: str | None = None,
                    label: str | None = None, db: Session = Depends(get_db)) -> list[dict]:
    from datetime import date as D
    rows = repo.list_annotations(
        db, D.fromisoformat(frm) if frm else None, D.fromisoformat(to) if to else None, label)
    return [{"id": r.id, "date": r.date.isoformat(), "label": r.label,
             "category": r.category, "note": r.note} for r in rows]


@router.delete("/annotation/{annotation_id}")
def remove_annotation(annotation_id: int, db: Session = Depends(get_db)) -> dict:
    if not repo.delete_annotation(db, annotation_id):
        raise HTTPException(status_code=404, detail="annotation not found")
    return {"deleted": annotation_id}


# ── 训练 / 睡眠 / 动作日志 ───────────────────────────────────────────────────
@router.post("/workout")
def save_workout(req: WorkoutIn, db: Session = Depends(get_db)) -> dict:
    row = repo.add_workout(db, **req.model_dump())
    return {"id": row.id, "date": row.date.isoformat(), "workout_type": row.workout_type}


@router.get("/workouts")
def get_workouts(frm: str, to: str, db: Session = Depends(get_db)) -> list[dict]:
    from datetime import date as D
    rows = repo.list_workouts(db, D.fromisoformat(frm), D.fromisoformat(to))
    return [{"id": r.id, "date": r.date.isoformat(), "workout_type": r.workout_type,
             "duration_min": r.duration_min, "calories_kcal": r.calories_kcal} for r in rows]


@router.post("/sleep-session")
def save_sleep_session(req: SleepSessionIn, db: Session = Depends(get_db)) -> dict:
    row = repo.add_sleep_session(db, **req.model_dump())
    return {"id": row.id, "date": row.date.isoformat(), "total_min": row.total_min}


@router.get("/sleep-sessions")
def get_sleep_sessions(frm: str, to: str, db: Session = Depends(get_db)) -> list[dict]:
    from datetime import date as D
    rows = repo.list_sleep_sessions(db, D.fromisoformat(frm), D.fromisoformat(to))
    return [{"id": r.id, "date": r.date.isoformat(), "total_min": r.total_min,
             "deep_min": r.deep_min, "rem_min": r.rem_min, "awake_count": r.awake_count,
             "max_awake_min": r.max_awake_min} for r in rows]


@router.post("/exercise-log")
def save_exercise_log(req: LogExercisesRequest, db: Session = Depends(get_db)) -> dict:
    """分类标注后落库，并回写本次分类结果。"""
    result = log_exercises(req.date.isoformat(), [e.model_dump() for e in req.entries])
    repo.add_exercise_logs(db, req.date, result["logged"])
    return result


@router.get("/exercise-history/{exercise_name}")
def get_exercise_history(exercise_name: str, db: Session = Depends(get_db)) -> list[dict]:
    rows = repo.exercise_history(db, exercise_name)
    return [{"date": r.date.isoformat(), "weight_kg": r.weight_kg, "sets": r.sets,
             "reps_completed": r.reps_completed, "progression_flag": r.progression_flag}
            for r in rows]
