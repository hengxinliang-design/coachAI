"""
db.py — 数据库模型（coach.ai dev spec v2.0 §6.2）

SQLAlchemy 2.0 声明式映射，对应 PostgreSQL（+ TimescaleDB 时序）。
Phase 1 仅建模，连接/迁移在 Phase 4 接入。字段与 spec §6.2 一一对应。
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import JSON, Date, Float, Integer, String, Boolean
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class HealthMetric(Base):
    """health_metrics — 每日核心指标"""
    __tablename__ = "health_metrics"

    date: Mapped[date] = mapped_column(Date, primary_key=True)
    hrv_ms: Mapped[float | None] = mapped_column(Float)
    hrv_is_outlier: Mapped[bool] = mapped_column(Boolean, default=False)  # >100ms 标记
    rhr_bpm: Mapped[int | None] = mapped_column(Integer)
    wrist_temp: Mapped[float | None] = mapped_column(Float)
    recovery_score: Mapped[float | None] = mapped_column(Float)           # 0–100
    recovery_grade: Mapped[str | None] = mapped_column(String)            # green/yellow/red


class SleepSession(Base):
    """sleep_sessions — 每晚睡眠"""
    __tablename__ = "sleep_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    total_min: Mapped[int | None] = mapped_column(Integer)
    deep_min: Mapped[int | None] = mapped_column(Integer)
    rem_min: Mapped[int | None] = mapped_column(Integer)
    awake_count: Mapped[int | None] = mapped_column(Integer)
    max_awake_min: Mapped[int | None] = mapped_column(Integer)
    fragmentation_pct: Mapped[float | None] = mapped_column(Float)
    stages: Mapped[dict | None] = mapped_column(JSON)                     # 完整阶段时间线


class Workout(Base):
    """workouts — 训练记录"""
    __tablename__ = "workouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    workout_type: Mapped[str | None] = mapped_column(String)             # Push/Pull/Legs/Elliptical/Running
    duration_min: Mapped[int | None] = mapped_column(Integer)
    calories_kcal: Mapped[float | None] = mapped_column(Float)
    distance_m: Mapped[float | None] = mapped_column(Float)              # 跑步
    avg_pace_per_km: Mapped[str | None] = mapped_column(String)         # 跑步
    hr_peak: Mapped[int | None] = mapped_column(Integer)
    hr_avg: Mapped[int | None] = mapped_column(Integer)
    z1_pct: Mapped[float | None] = mapped_column(Float)
    z2_pct: Mapped[float | None] = mapped_column(Float)
    z3_pct: Mapped[float | None] = mapped_column(Float)
    z4_pct: Mapped[float | None] = mapped_column(Float)
    z5_pct: Mapped[float | None] = mapped_column(Float)
    execution_score: Mapped[float | None] = mapped_column(Float)
    hr_samples: Mapped[list | None] = mapped_column(JSON)


class ExerciseLog(Base):
    """exercise_log — 双重渐进追踪"""
    __tablename__ = "exercise_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    exercise_name: Mapped[str] = mapped_column(String)
    weight_kg: Mapped[float | None] = mapped_column(Float)
    sets: Mapped[int | None] = mapped_column(Integer)
    reps_completed: Mapped[list | None] = mapped_column(JSON)            # reps_completed INTEGER[]
    progression_flag: Mapped[bool] = mapped_column(Boolean, default=False)  # 是否达到加重条件


class SupplementTracking(Base):
    """supplement_tracking — 补剂追踪"""
    __tablename__ = "supplement_tracking"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    supplement_name: Mapped[str] = mapped_column(String)
    dosage: Mapped[str | None] = mapped_column(String)
    baseline_period: Mapped[bool] = mapped_column(Boolean, default=False)  # 是否服用前基线
