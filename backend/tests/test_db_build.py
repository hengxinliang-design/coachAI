"""
test_db_build.py — 数据模型可构建性验证

确保「构建程序时可用」：用内存 SQLite 真正建出全部表，并对每张表做一次
插入+查询，验证 SQLAlchemy 声明无误、字段类型可落库。
"""
from datetime import date

import pytest

pytest.importorskip("sqlalchemy")
from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.models.db import (  # noqa: E402
    Annotation,
    Base,
    ExerciseLog,
    HealthMetric,
    SleepSession,
    Workout,
)


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def test_all_five_tables_created():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    assert set(Base.metadata.tables) == {
        "health_metrics", "sleep_sessions", "workouts", "exercise_log", "annotations",
    }


def test_health_metric_roundtrip(session):
    session.add(HealthMetric(date=date(2026, 6, 1), hrv_ms=32.0, hrv_is_outlier=False,
                             rhr_bpm=58, wrist_temp=35.4, recovery_score=61, recovery_grade="red"))
    session.commit()
    row = session.scalar(select(HealthMetric).where(HealthMetric.date == date(2026, 6, 1)))
    assert row.recovery_grade == "red" and row.hrv_ms == 32.0


def test_sleep_session_jsonb_stages(session):
    session.add(SleepSession(date=date(2026, 6, 1), total_min=400, deep_min=70, rem_min=80,
                             awake_count=3, max_awake_min=62, fragmentation_pct=17.5,
                             stages={"timeline": [{"stage": "deep", "min": 70}]}))
    session.commit()
    row = session.scalar(select(SleepSession))
    assert row.stages["timeline"][0]["stage"] == "deep"


def test_workout_zone_pcts_and_samples(session):
    session.add(Workout(date=date(2026, 5, 31), workout_type="力量", duration_min=53,
                        calories_kcal=600, hr_peak=165, hr_avg=140,
                        z1_pct=10, z2_pct=30, z3_pct=30, z4_pct=25, z5_pct=5,
                        execution_score=82, hr_samples=[140, 145, 110]))
    session.commit()
    row = session.scalar(select(Workout))
    assert row.hr_samples == [140, 145, 110] and row.z4_pct == 25

def test_exercise_log_reps_array(session):
    session.add(ExerciseLog(date=date(2026, 6, 1), exercise_name="杠铃卧推", weight_kg=40.0,
                            sets=3, reps_completed=[10, 10, 10], progression_flag=True))
    session.commit()
    row = session.scalar(select(ExerciseLog))
    assert row.reps_completed == [10, 10, 10] and row.progression_flag is True


def test_annotation_roundtrip(session):
    session.add(Annotation(date=date(2026, 5, 20), label="镁甘氨酸",
                           category="supplement", note="每晚2粒，睡前30-60分钟"))
    session.commit()
    row = session.scalar(select(Annotation).where(Annotation.label == "镁甘氨酸"))
    assert row.category == "supplement"
