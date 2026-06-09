"""
repository.py — 数据访问层（CRUD + 历史查询）

把引擎需要的"历史数据"从一次性请求参数，变成数据库持久查询：
  · recent_hrv      → 喂恢复评分的 7 日滚动基线
  · exercise_history→ 喂双重渐进的历史重量对比
  · metric_series   → 喂观察指标的前后对比
全部接收一个 SQLAlchemy Session，事务在函数内提交。
"""
from __future__ import annotations

from datetime import date as Date

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.db import (
    Annotation,
    ExerciseLog,
    HealthMetric,
    SleepSession,
    Workout,
)

# ── health_metrics ───────────────────────────────────────────────────────────
def upsert_health_metric(db: Session, day: Date, **fields) -> HealthMetric:
    """按日期主键 upsert（同日重复写入则更新）。"""
    row = db.get(HealthMetric, day)
    if row:
        for k, v in fields.items():
            setattr(row, k, v)
    else:
        row = HealthMetric(date=day, **fields)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def recent_hrv(db: Session, on_date: Date, days: int = 7) -> list[float | None]:
    """取 on_date（含）往前 days 天的 HRV，按日期升序返回（可含 None，异常值由引擎剔除）。"""
    rows = db.execute(
        select(HealthMetric.hrv_ms)
        .where(HealthMetric.date <= on_date)
        .order_by(HealthMetric.date.desc())
        .limit(days)
    ).scalars().all()
    return list(reversed(rows))


def list_health_metrics(db: Session, frm: Date, to: Date) -> list[HealthMetric]:
    return db.execute(
        select(HealthMetric).where(HealthMetric.date.between(frm, to)).order_by(HealthMetric.date)
    ).scalars().all()


def metric_series(db: Session, metric: str, frm: Date, to: Date) -> list[dict]:
    """
    取某个 health_metrics 列的日序列（用于观察指标前后对比）。
    支持列：hrv_ms / rhr_bpm / wrist_temp / recovery_score。
    """
    col = getattr(HealthMetric, metric, None)
    if col is None:
        return []
    rows = db.execute(
        select(HealthMetric.date, col).where(HealthMetric.date.between(frm, to)).order_by(HealthMetric.date)
    ).all()
    return [{"date": d, "value": v} for d, v in rows]


# ── annotations（用户可增删的观察指标） ──────────────────────────────────────
def add_annotation(db: Session, day: Date, label: str,
                   category: str | None = None, note: str | None = None) -> Annotation:
    row = Annotation(date=day, label=label, category=category, note=note)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_annotations(db: Session, frm: Date | None = None, to: Date | None = None,
                     label: str | None = None) -> list[Annotation]:
    stmt = select(Annotation)
    if frm is not None and to is not None:
        stmt = stmt.where(Annotation.date.between(frm, to))
    if label is not None:
        stmt = stmt.where(Annotation.label == label)
    return db.execute(stmt.order_by(Annotation.date)).scalars().all()


def delete_annotation(db: Session, annotation_id: int) -> bool:
    result = db.execute(delete(Annotation).where(Annotation.id == annotation_id))
    db.commit()
    return result.rowcount > 0


# ── workouts ─────────────────────────────────────────────────────────────────
def add_workout(db: Session, **fields) -> Workout:
    row = Workout(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_workouts(db: Session, frm: Date, to: Date) -> list[Workout]:
    return db.execute(
        select(Workout).where(Workout.date.between(frm, to)).order_by(Workout.date)
    ).scalars().all()


# ── sleep_sessions ───────────────────────────────────────────────────────────
def add_sleep_session(db: Session, **fields) -> SleepSession:
    row = SleepSession(**fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_sleep_sessions(db: Session, frm: Date, to: Date) -> list[SleepSession]:
    return db.execute(
        select(SleepSession).where(SleepSession.date.between(frm, to)).order_by(SleepSession.date)
    ).scalars().all()


# ── exercise_log（双重渐进历史） ─────────────────────────────────────────────
def add_exercise_logs(db: Session, day: Date, logged: list[dict]) -> list[ExerciseLog]:
    """从 log_exercises 的输出落库（只取模型字段）。"""
    rows = [
        ExerciseLog(
            date=day,
            exercise_name=e["exercise_name"],
            weight_kg=e.get("weight_kg"),
            sets=e.get("sets"),
            reps_completed=e.get("reps_completed"),
            progression_flag=e.get("progression_flag", False),
        )
        for e in logged
    ]
    db.add_all(rows)
    db.commit()
    return rows


def exercise_history(db: Session, exercise_name: str, limit: int = 10) -> list[ExerciseLog]:
    """取某动作最近的历史记录（最新在前），用于双重渐进的重量对比。"""
    return db.execute(
        select(ExerciseLog)
        .where(ExerciseLog.exercise_name == exercise_name)
        .order_by(ExerciseLog.date.desc())
        .limit(limit)
    ).scalars().all()
